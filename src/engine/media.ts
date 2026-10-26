// Camera, microphone and screen capture, plus the audio mix that goes into the recording.
import { actions, useStore, type DevState } from '../store';

function hiddenVideo() {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  return v;
}

const stopAll = (s: MediaStream | null) => s?.getTracks().forEach((t) => t.stop());

function failState(err: unknown): DevState {
  const name = (err as DOMException)?.name;
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error';
}

class Media {
  readonly camVideo = hiddenVideo();
  readonly screenVideo = hiddenVideo();
  private cam: MediaStream | null = null;
  private mic: MediaStream | null = null;
  private screen: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private micNode: MediaStreamAudioSourceNode | null = null;
  private screenNode: MediaStreamAudioSourceNode | null = null;
  analyser: AnalyserNode | null = null;

  get camReady() {
    return !!this.cam && this.camVideo.videoWidth > 0;
  }
  get screenReady() {
    return !!this.screen && this.screenVideo.videoWidth > 0;
  }

  private audio() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.dest = this.ctx.createMediaStreamDestination();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
    }
    return this.ctx;
  }

  async resumeAudio() {
    const ctx = this.audio();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  }

  /** The mixed mic + screen audio. Stays alive (silent) when sources come and go. */
  audioStream(): MediaStream {
    this.audio();
    return this.dest!.stream;
  }

  private attachMic(stream: MediaStream) {
    const ctx = this.audio();
    this.micNode?.disconnect();
    this.micNode = ctx.createMediaStreamSource(stream);
    this.micNode.connect(this.dest!);
    this.micNode.connect(this.analyser!);
    void this.resumeAudio();
  }

  private async attachCam(stream: MediaStream) {
    this.cam = stream;
    this.camVideo.srcObject = stream;
    await this.camVideo.play().catch(() => {});
    stream.getVideoTracks()[0]?.addEventListener('ended', () => this.stopCamera());
    useStore.setState({ cam: 'on' });
  }

  private camConstraints(id: string): MediaTrackConstraints {
    return { deviceId: id ? { ideal: id } : undefined, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
  }

  private micConstraints(id: string): MediaTrackConstraints {
    return { deviceId: id ? { ideal: id } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  }

  /** Camera and mic together, so there is a single permission prompt where the OS asks. */
  async startCamAndMic() {
    const { camId, micId } = useStore.getState();
    if (!navigator.mediaDevices?.getUserMedia) {
      useStore.setState({ cam: 'error', mic: 'error' });
      actions.toast('Camera and microphone are not available here.', 'error');
      return;
    }
    useStore.setState({ cam: 'pending', mic: 'pending' });
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: this.camConstraints(camId), audio: this.micConstraints(micId) });
      this.mic = new MediaStream(s.getAudioTracks());
      this.attachMic(this.mic);
      useStore.setState({ mic: 'on' });
      await this.attachCam(new MediaStream(s.getVideoTracks()));
    } catch {
      // One of the two is missing or blocked: try each on its own.
      await Promise.all([this.startCamera(), this.startMic()]);
    }
  }

  async startCamera(deviceId = useStore.getState().camId) {
    stopAll(this.cam);
    this.cam = null;
    useStore.setState({ cam: 'pending' });
    try {
      await this.attachCam(await navigator.mediaDevices.getUserMedia({ video: this.camConstraints(deviceId) }));
    } catch (err) {
      const state = failState(err);
      useStore.setState({ cam: state });
      actions.toast(state === 'denied' ? 'Camera access was blocked. Allow it in your system settings.' : 'No camera found.', 'error');
    }
  }

  stopCamera() {
    stopAll(this.cam);
    this.cam = null;
    this.camVideo.srcObject = null;
    useStore.setState({ cam: 'off' });
  }

  async startMic(deviceId = useStore.getState().micId) {
    stopAll(this.mic);
    this.mic = null;
    useStore.setState({ mic: 'pending' });
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: this.micConstraints(deviceId) });
      this.attachMic(this.mic);
      useStore.setState({ mic: 'on' });
    } catch (err) {
      const state = failState(err);
      useStore.setState({ mic: state });
      actions.toast(state === 'denied' ? 'Microphone access was blocked.' : 'No microphone found.', 'error');
    }
  }

  stopMic() {
    stopAll(this.mic);
    this.mic = null;
    this.micNode?.disconnect();
    this.micNode = null;
    useStore.setState({ mic: 'off' });
  }

  /** Must be called from a click: the app shows its own screen/window picker. */
  async startScreen(): Promise<boolean> {
    useStore.setState({ screen: 'pending' });
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: true });
      this.stopScreen(false);
      this.screen = s;
      this.screenVideo.srcObject = s;
      await this.screenVideo.play().catch(() => {});
      s.getVideoTracks()[0]?.addEventListener('ended', () => this.stopScreen());
      if (s.getAudioTracks().length) {
        const ctx = this.audio();
        this.screenNode = ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks()));
        this.screenNode.connect(this.dest!);
      }
      useStore.setState({ screen: 'on' });
      return true;
    } catch (err) {
      useStore.setState({ screen: this.screen ? 'on' : 'off' });
      if (failState(err) === 'error') actions.toast('Could not share the screen.', 'error');
      return false;
    }
  }

  stopScreen(updateState = true) {
    stopAll(this.screen);
    this.screen = null;
    this.screenVideo.srcObject = null;
    this.screenNode?.disconnect();
    this.screenNode = null;
    if (updateState) useStore.setState({ screen: 'off' });
  }

  stopEverything() {
    this.stopCamera();
    this.stopMic();
    this.stopScreen();
  }

  async devices() {
    const list = await navigator.mediaDevices.enumerateDevices();
    return {
      cams: list.filter((d) => d.kind === 'videoinput'),
      mics: list.filter((d) => d.kind === 'audioinput'),
    };
  }

  /** 0..1 loudness of the mic, for the level meter. */
  level(buf: Uint8Array<ArrayBuffer>) {
    if (!this.analyser || !this.mic) return 0;
    this.analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
  }
}

export const media = new Media();
