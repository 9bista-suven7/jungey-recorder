import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Check, ChevronDown, Film, Keyboard, LoaderCircle, Mic, MicOff, MonitorUp, Pause, Play,
  ScrollText, Settings2, Square, Video, VideoOff, X, FolderOpen,
} from 'lucide-react';
import { actions, useStore } from '../store';
import { ASPECTS, BOARD_STYLES, LAYOUTS, PATTERNS, getBoardStyle } from '../lib/boards';
import { LayoutIcon, Logo } from './icons';
import { Popover } from './ui';
import { media } from '../engine/media';
import { cancelCountdown, getElapsed, startRecording, stopRecording, togglePause } from '../engine/session';
import { bridge, isDesktop } from '../platform';
import { formatTime } from '../lib/util';
import type { CamShape } from '../types';

function LayoutSwitcher() {
  const layout = useStore((s) => s.project!.settings.layout);
  return (
    <div className="segmented" role="radiogroup" aria-label="Layout">
      {LAYOUTS.map((l) => (
        <button
          key={l.id}
          role="radio"
          aria-checked={layout === l.id}
          className={layout === l.id ? 'on' : ''}
          data-tip={`${l.label}: ${l.hint}`}
          onClick={() => actions.updateSettings({ layout: l.id })}
        >
          <LayoutIcon kind={l.id} />
          <span className="seg-label">{l.short}</span>
        </button>
      ))}
    </div>
  );
}

function BoardMenu() {
  const settings = useStore((s) => s.project!.settings);
  const style = getBoardStyle(settings.boardStyle);
  return (
    <Popover
      button={({ toggle, open }) => (
        <button className={`btn chip ${open ? 'active' : ''}`} onClick={toggle} data-tip="Board colour, paper and video size">
          <span className="swatch" style={{ background: style.bg }} />
          <span className="chip-label">{style.label}</span>
          <span className="chip-dim">{settings.aspect}</span>
          <ChevronDown size={14} />
        </button>
      )}
    >
      <div className="menu-section">
        <div className="menu-label">Board</div>
        <div className="board-swatches">
          {BOARD_STYLES.map((b) => (
            <button key={b.id} className={`board-swatch ${b.id === settings.boardStyle ? 'on' : ''}`} onClick={() => actions.updateSettings({ boardStyle: b.id })}>
              <span style={{ background: b.bg }}>{b.chalk && <i />}</span>
              {b.label}
            </button>
          ))}
        </div>
      </div>
      <div className="menu-section">
        <div className="menu-label">Paper</div>
        <div className="pill-row">
          {PATTERNS.map((p) => (
            <button key={p.id} className={`pill ${p.id === settings.pattern ? 'on' : ''}`} onClick={() => actions.updateSettings({ pattern: p.id })}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="menu-section">
        <div className="menu-label">Video size</div>
        <div className="aspect-grid">
          {ASPECTS.map((a) => (
            <button key={a.id} className={`aspect ${a.id === settings.aspect ? 'on' : ''}`} onClick={() => actions.updateSettings({ aspect: a.id })}>
              <span className="aspect-box" data-aspect={a.id} />
              <b>{a.label}</b>
              <small>{a.hint}</small>
            </button>
          ))}
        </div>
      </div>
    </Popover>
  );
}

function DeviceList({ kind, current, onPick }: { kind: 'cams' | 'mics'; current: string; onPick: (id: string) => void }) {
  const [list, setList] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    media.devices().then((d) => setList(d[kind])).catch(() => {});
  }, [kind]);
  if (!list.length) return <div className="menu-empty">No devices found</div>;
  return (
    <>
      {list.map((d, i) => (
        <button key={d.deviceId || i} className="menu-item" onClick={() => onPick(d.deviceId)}>
          <span className="menu-check">{(current ? current === d.deviceId : i === 0) && <Check size={14} />}</span>
          {d.label || `${kind === 'cams' ? 'Camera' : 'Microphone'} ${i + 1}`}
        </button>
      ))}
    </>
  );
}

function CameraControl() {
  const cam = useStore((s) => s.cam);
  const camId = useStore((s) => s.camId);
  const mirror = useStore((s) => s.mirror);
  const bubble = useStore((s) => s.project!.settings.bubble);
  const on = cam === 'on';
  const toggle = () => (on ? media.stopCamera() : void media.startCamera());
  return (
    <div className={`split ${on ? '' : 'off'} ${cam === 'denied' || cam === 'error' ? 'bad' : ''}`}>
      <button className="split-main" onClick={toggle} data-tip={on ? 'Turn camera off (C)' : 'Turn camera on (C)'}>
        {cam === 'pending' ? <LoaderCircle size={18} className="spin" /> : on ? <Video size={18} /> : <VideoOff size={18} />}
      </button>
      <Popover
        placement="bottom-end"
        button={({ toggle: t }) => (
          <button className="split-more" onClick={t} aria-label="Camera options">
            <ChevronDown size={14} />
          </button>
        )}
      >
        {(close) => (
          <>
            <div className="menu-section">
              <div className="menu-label">Camera</div>
              <DeviceList
                kind="cams"
                current={camId}
                onPick={(id) => {
                  useStore.setState({ camId: id });
                  void media.startCamera(id);
                  close();
                }}
              />
            </div>
            <div className="menu-section">
              <div className="menu-label">Bubble</div>
              <div className="pill-row">
                {(['circle', 'rounded'] as CamShape[]).map((s) => (
                  <button key={s} className={`pill ${bubble.shape === s ? 'on' : ''}`} onClick={() => actions.setBubble({ shape: s })}>
                    {s === 'circle' ? 'Circle' : 'Rectangle'}
                  </button>
                ))}
              </div>
              <label className="slider-row">
                Size
                <input type="range" min={0.14} max={0.6} step={0.01} value={bubble.size} onChange={(e) => actions.setBubble({ size: +e.target.value })} />
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={mirror} onChange={(e) => useStore.setState({ mirror: e.target.checked })} />
                Mirror my camera
              </label>
            </div>
          </>
        )}
      </Popover>
    </div>
  );
}

function MicMeter() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const buf = new Uint8Array(512);
    let raf = 0;
    const tick = () => {
      const lvl = media.level(buf);
      if (ref.current) ref.current.style.transform = `scaleY(${0.08 + lvl * 0.92})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <span className="meter" aria-hidden>
      <span ref={ref} />
    </span>
  );
}

function MicControl() {
  const mic = useStore((s) => s.mic);
  const micId = useStore((s) => s.micId);
  const on = mic === 'on';
  return (
    <div className={`split ${on ? '' : 'off'} ${mic === 'denied' || mic === 'error' ? 'bad' : ''}`}>
      <button className="split-main" onClick={() => (on ? media.stopMic() : void media.startMic())} data-tip={on ? 'Mute microphone' : 'Turn microphone on'}>
        {mic === 'pending' ? <LoaderCircle size={18} className="spin" /> : on ? <Mic size={18} /> : <MicOff size={18} />}
        {on && <MicMeter />}
      </button>
      <Popover
        placement="bottom-end"
        button={({ toggle }) => (
          <button className="split-more" onClick={toggle} aria-label="Microphone options">
            <ChevronDown size={14} />
          </button>
        )}
      >
        {(close) => (
          <div className="menu-section">
            <div className="menu-label">Microphone</div>
            <DeviceList
              kind="mics"
              current={micId}
              onPick={(id) => {
                useStore.setState({ micId: id });
                void media.startMic(id);
                close();
              }}
            />
          </div>
        )}
      </Popover>
    </div>
  );
}

function ScreenButton() {
  const layout = useStore((s) => s.project!.settings.layout);
  const screen = useStore((s) => s.screen);
  if (layout !== 'screen-cam') return null;
  return (
    <button className="btn chip" onClick={() => void media.startScreen()} data-tip="Choose what to share">
      <MonitorUp size={16} />
      <span className="chip-label">{screen === 'on' ? 'Change screen' : 'Share screen'}</span>
    </button>
  );
}

function MoreMenu() {
  const countdown = useStore((s) => s.countdown);
  const autoScroll = useStore((s) => s.autoScroll);
  return (
    <Popover
      placement="bottom-end"
      button={({ toggle, open }) => (
        <button className={`icon-btn ${open ? 'active' : ''}`} onClick={toggle} data-tip="Settings">
          <Settings2 size={18} />
        </button>
      )}
    >
      {(close) => (
        <div className="menu-section">
          <label className="toggle-row">
            <input type="checkbox" checked={countdown} onChange={(e) => useStore.setState({ countdown: e.target.checked })} />
            3-second countdown before recording
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={autoScroll} onChange={(e) => useStore.setState({ autoScroll: e.target.checked })} />
            Scroll the script while recording
          </label>
          <button className="menu-item" onClick={() => (close(), useStore.setState({ helpOpen: true }))}>
            <span className="menu-check">
              <Keyboard size={14} />
            </span>
            Keyboard shortcuts
          </button>
          {isDesktop && (
            <button className="menu-item" onClick={() => (close(), void bridge.videos.openFolder())}>
              <span className="menu-check">
                <FolderOpen size={14} />
              </span>
              Open videos folder
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}

export function Timer() {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setMs(getElapsed()), 250);
    return () => clearInterval(h);
  }, []);
  return <span className="timer">{formatTime(ms)}</span>;
}

export function RecordControls({ compact = false }: { compact?: boolean }) {
  const rec = useStore((s) => s.rec);
  const n = useStore((s) => s.countdownN);
  const progress = useStore((s) => s.saveProgress);
  if (rec === 'idle') {
    return (
      <button className="rec-btn" onClick={() => void startRecording()} data-tip="Start recording (R)">
        <span className="rec-dot" /> Record
      </button>
    );
  }
  if (rec === 'countdown') {
    return (
      <button className="rec-btn counting" onClick={cancelCountdown} data-tip="Cancel">
        Starting in {n} <X size={16} />
      </button>
    );
  }
  if (rec === 'saving') {
    return (
      <button className="rec-btn saving" disabled>
        <LoaderCircle size={16} className="spin" /> {progress > 0 ? `Finishing ${Math.round(progress * 100)}%` : 'Saving…'}
      </button>
    );
  }
  const paused = rec === 'paused';
  return (
    <div className={`rec-live ${compact ? 'compact' : ''}`}>
      <span className={`rec-status ${paused ? 'paused' : ''}`}>
        <span className="rec-dot" />
        <Timer />
        {paused && <em>Paused</em>}
      </span>
      <button className="icon-btn" onClick={togglePause} data-tip={paused ? 'Resume (K)' : 'Pause (K)'}>
        {paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
      </button>
      <button className="stop-btn" onClick={() => void stopRecording()} data-tip="Stop and save (R)">
        <Square size={14} fill="currentColor" /> Stop
      </button>
    </div>
  );
}

export function TopBar() {
  const title = useStore((s) => s.project!.title);
  const teleprompter = useStore((s) => s.teleprompter);
  const videoCount = useStore((s) => s.videos.length);
  const busy = useStore((s) => s.rec !== 'idle');
  return (
    <header className="topbar">
      <button className="icon-btn home-btn" onClick={actions.goHome} disabled={busy} data-tip="Back to start">
        <ArrowLeft size={18} />
        <Logo size={24} />
      </button>
      <input className="title-input" value={title} onChange={(e) => actions.setTitle(e.target.value)} aria-label="Project name" spellCheck={false} />
      <div className="topbar-group">
        <LayoutSwitcher />
        <BoardMenu />
        <ScreenButton />
      </div>
      <div className="grow" />
      <div className="topbar-group">
        <button
          className={`icon-btn ${teleprompter ? 'active' : ''}`}
          onClick={() => useStore.setState({ teleprompter: !teleprompter, promptPlaying: false })}
          data-tip="Script / teleprompter"
        >
          <ScrollText size={18} />
        </button>
        <CameraControl />
        <MicControl />
        <button className="icon-btn badge-btn" onClick={() => useStore.setState({ libraryOpen: true })} data-tip="My videos">
          <Film size={18} />
          {videoCount > 0 && <span className="badge">{videoCount}</span>}
        </button>
        <MoreMenu />
      </div>
      <RecordControls />
    </header>
  );
}
