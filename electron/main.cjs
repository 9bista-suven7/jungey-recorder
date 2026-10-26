'use strict';
// Electron main process: window, on-disk video library, screen picker, ffmpeg finishing.
const {
  app, BrowserWindow, ipcMain, protocol, session, desktopCapturer,
  shell, globalShortcut, dialog, systemPreferences, screen,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileP = promisify(execFile);
const { Readable } = require('node:stream');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const DIST = path.join(__dirname, '..', 'dist');
const APP_URL = 'app://bundle/';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

app.setName('Jungey Recorder');
// Same folder style as the other Jungey apps (~/.config/jungey-snip, ...).
app.setPath('userData', path.join(app.getPath('appData'), 'jungey-recorder'));
if (!app.requestSingleInstanceLock()) app.quit();

/** @type {BrowserWindow | null} */
let win = null;

// ---------------------------------------------------------------- paths & helpers

const videosDir = () => path.join(app.getPath('videos'), 'Jungey Recorder');
const metaDir = () => path.join(videosDir(), '.jungey');
const tmpDir = () => path.join(metaDir(), 'tmp');
const metaFile = (id) => path.join(metaDir(), `${String(id).replace(/[^\w-]/g, '')}.json`);

function safeName(title) {
  const s = String(title || 'Recording').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.slice(0, 80) || 'Recording';
}

async function uniquePath(dir, base, ext) {
  for (let i = 0; ; i++) {
    const file = path.join(dir, `${base}${i ? ` (${i + 1})` : ''}.${ext}`);
    try { await fsp.access(file); } catch { return file; }
  }
}

async function readMeta(id) {
  try { return JSON.parse(await fsp.readFile(metaFile(id), 'utf8')); } catch { return null; }
}

async function writeMeta(meta) {
  await fsp.mkdir(metaDir(), { recursive: true });
  await fsp.writeFile(metaFile(meta.id), JSON.stringify(meta));
  return meta;
}

// ---------------------------------------------------------------- ffmpeg

let ffmpegFound = null;
/**
 * Path to ffmpeg, or null. Checked in the background (a blocking check froze the app), and a
 * check that merely timed out on a busy machine is retried next time instead of remembered.
 */
function ffmpeg() {
  ffmpegFound ??= (async () => {
    const candidates = [process.env.JUNGEY_FFMPEG, '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', 'ffmpeg'];
    let timedOut = false;
    for (const c of candidates.filter(Boolean)) {
      try {
        await execFileP(c, ['-version'], { timeout: 20000 });
        return c;
      } catch (e) {
        if (e.killed || e.signal) timedOut = true;
      }
    }
    if (timedOut) ffmpegFound = null;
    return null;
  })();
  return ffmpegFound;
}

async function runFfmpeg(args, durationSec, onProgress) {
  const bin = await ffmpeg();
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ['-hide_banner', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1', '-y', ...args]);
    let err = '';
    p.stdout.on('data', (d) => {
      const all = [...String(d).matchAll(/out_time_us=(\d+)/g)];
      const last = all[all.length - 1];
      if (last && durationSec > 0) onProgress(Math.min(1, Number(last[1]) / 1e6 / durationSec));
    });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim().split('\n').slice(-3).join('\n') || `ffmpeg exited with ${code}`))));
  });
}

const H264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p'];
const AAC = ['-c:a', 'aac', '-b:a', '160k'];

/** Turn a raw MediaRecorder file into a normal, seekable MP4 that plays everywhere. */
async function finishFile(src, srcExt, title, durationSec, onProgress) {
  await fsp.mkdir(videosDir(), { recursive: true });
  if (await ffmpeg()) {
    const out = await uniquePath(videosDir(), safeName(title), 'mp4');
    const video = srcExt === 'mp4' ? ['-c:v', 'copy', '-tag:v', 'avc1'] : H264;
    try {
      await runFfmpeg(['-i', src, ...video, ...AAC, '-movflags', '+faststart', out], durationSec, onProgress);
      await fsp.rm(src, { force: true });
      return out;
    } catch (e) {
      console.error('[ffmpeg] finishing failed, keeping the raw recording:', e.message);
      await fsp.rm(out, { force: true });
    }
  }
  const out = await uniquePath(videosDir(), safeName(title), srcExt);
  await fsp.rename(src, out);
  return out;
}

// ---------------------------------------------------------------- recording stream → disk

/** @type {Map<string, {stream: fs.WriteStream, file: string, ext: string}>} */
const writers = new Map();

ipcMain.handle('rec:begin', async (_e, { id, ext }) => {
  await fsp.mkdir(tmpDir(), { recursive: true });
  const file = path.join(tmpDir(), `${String(id).replace(/[^\w-]/g, '')}.${ext === 'mp4' ? 'mp4' : 'webm'}`);
  writers.set(id, { stream: fs.createWriteStream(file), file, ext: ext === 'mp4' ? 'mp4' : 'webm' });
  return true;
});

ipcMain.handle('rec:chunk', (_e, id, buf) => new Promise((resolve, reject) => {
  const w = writers.get(id);
  if (!w) return reject(new Error('Recording not started'));
  w.stream.write(Buffer.from(buf), (err) => (err ? reject(err) : resolve(true)));
}));

ipcMain.handle('rec:abort', async (_e, id) => {
  const w = writers.get(id);
  writers.delete(id);
  if (w) { await new Promise((r) => w.stream.end(r)); await fsp.rm(w.file, { force: true }); }
  return true;
});

ipcMain.handle('rec:finish', async (e, { id, meta }) => {
  const w = writers.get(id);
  if (!w) throw new Error('Recording not started');
  writers.delete(id);
  await new Promise((r) => w.stream.end(r));
  const progress = (p) => e.sender.send('job:progress', { id, progress: p });
  const file = await finishFile(w.file, w.ext, meta.title, (meta.durationMs || 0) / 1000, progress);
  return writeMeta({ ...meta, id, file });
});

// ---------------------------------------------------------------- boards (one JSON file per project)

const projectsDir = () => path.join(app.getPath('userData'), 'projects');
const projectFile = (id) => path.join(projectsDir(), `${String(id).replace(/[^\w-]/g, '')}.json`);

ipcMain.handle('projects:list', async () => {
  let names = [];
  try { names = await fsp.readdir(projectsDir()); } catch { return []; }
  const out = [];
  for (const n of names.filter((x) => x.endsWith('.json'))) {
    try { out.push(JSON.parse(await fsp.readFile(path.join(projectsDir(), n), 'utf8'))); } catch { /* skip a damaged file */ }
  }
  return out;
});

ipcMain.handle('projects:put', async (_e, project) => {
  await fsp.mkdir(projectsDir(), { recursive: true });
  const file = projectFile(project.id);
  // Write then rename, so a crash mid-save never leaves a half-written board.
  await fsp.writeFile(`${file}.tmp`, JSON.stringify(project));
  await fsp.rename(`${file}.tmp`, file);
  return true;
});

ipcMain.handle('projects:delete', async (_e, id) => {
  await fsp.rm(projectFile(id), { force: true });
  return true;
});

// ---------------------------------------------------------------- library

async function listVideos() {
  let names = [];
  try { names = await fsp.readdir(metaDir()); } catch { return []; }
  const metas = await Promise.all(names.filter((n) => n.endsWith('.json')).map((n) => readMeta(n.slice(0, -5))));
  return metas.filter((m) => m && m.file && fs.existsSync(m.file)).sort((a, b) => b.createdAt - a.createdAt);
}

/** Recordings interrupted by a crash or a forced quit are still on disk; turn them into normal videos. */
async function recoverOrphans() {
  let names = [];
  try { names = await fsp.readdir(tmpDir()); } catch { return; }
  for (const n of names) {
    const src = path.join(tmpDir(), n);
    const ext = n.endsWith('.mp4') ? 'mp4' : 'webm';
    try {
      const { size, mtimeMs } = await fsp.stat(src);
      if (size < 1024) { await fsp.rm(src, { force: true }); continue; }
      const title = `Recovered recording ${new Date(mtimeMs).toLocaleString()}`;
      const file = await finishFile(src, ext, title, 0, () => {});
      await writeMeta({ id: path.basename(n, path.extname(n)), title, file, createdAt: mtimeMs, durationMs: 0, width: 0, height: 0, thumb: '' });
    } catch (e) { console.error('[recover]', e); }
  }
}

ipcMain.handle('app:info', async () => ({
  platform: process.platform,
  version: app.getVersion(),
  videosDir: videosDir(),
  hasFfmpeg: !!(await ffmpeg()),
}));

ipcMain.handle('videos:list', () => listVideos());

ipcMain.handle('videos:rename', async (_e, id, title) => {
  const m = await readMeta(id);
  if (!m) return null;
  let file = m.file;
  const wanted = safeName(title);
  if (path.basename(file, path.extname(file)) !== wanted) {
    const next = await uniquePath(path.dirname(file), wanted, path.extname(file).slice(1));
    try { await fsp.rename(file, next); file = next; } catch { /* keep old file name */ }
  }
  return writeMeta({ ...m, title, file });
});

ipcMain.handle('videos:delete', async (_e, id) => {
  const m = await readMeta(id);
  if (m?.file) await shell.trashItem(m.file).catch(() => fsp.rm(m.file, { force: true }));
  await fsp.rm(metaFile(id), { force: true });
  return true;
});

ipcMain.handle('videos:reveal', async (_e, id) => {
  const m = await readMeta(id);
  if (m?.file) shell.showItemInFolder(m.file);
});

ipcMain.handle('videos:openFolder', async () => {
  await fsp.mkdir(videosDir(), { recursive: true });
  return shell.openPath(videosDir());
});

ipcMain.handle('videos:saveCopy', async (_e, id) => {
  const m = await readMeta(id);
  if (!m?.file || !win) return null;
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save a copy',
    defaultPath: path.join(app.getPath('desktop'), path.basename(m.file)),
  });
  if (canceled || !filePath) return null;
  await fsp.copyFile(m.file, filePath);
  return filePath;
});

ipcMain.handle('videos:trim', async (e, { id, start, end, title }) => {
  const m = await readMeta(id);
  if (!m?.file) throw new Error('Video not found');
  if (!(await ffmpeg())) throw new Error('ffmpeg is not installed');
  const out = await uniquePath(videosDir(), safeName(title), 'mp4');
  const dur = Math.max(0.1, end - start);
  const jobId = `trim-${id}`;
  await runFfmpeg(
    ['-ss', start.toFixed(3), '-i', m.file, '-t', dur.toFixed(3), ...H264, ...AAC, '-movflags', '+faststart', out],
    dur,
    (p) => e.sender.send('job:progress', { id: jobId, progress: p }),
  );
  const newId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return writeMeta({ ...m, id: newId, title, file: out, durationMs: Math.round(dur * 1000), createdAt: Date.now() });
});

// ---------------------------------------------------------------- app:// protocol (bundle + media)

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.json': 'application/json', '.wasm': 'application/wasm',
  '.map': 'application/json', '.ico': 'image/x-icon',
};

async function serveBundle(url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const file = path.normalize(path.join(DIST, rel));
  if (!file.startsWith(DIST)) return new Response('Forbidden', { status: 403 });
  try {
    const body = await fsp.readFile(file);
    return new Response(body, { headers: { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

async function serveMedia(url, request) {
  const m = await readMeta(decodeURIComponent(url.pathname.slice(1)));
  if (!m?.file) return new Response('Not found', { status: 404 });
  const { size } = await fsp.stat(m.file);
  const headers = {
    'Content-Type': m.file.endsWith('.webm') ? 'video/webm' : 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
  };
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') || '');
  if (!range) {
    return new Response(Readable.toWeb(fs.createReadStream(m.file)), { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
  }
  let start = range[1] ? Number(range[1]) : size - Number(range[2]);
  let end = range[1] && range[2] ? Number(range[2]) : size - 1;
  end = Math.min(end, size - 1);
  start = Math.max(0, start);
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(Readable.toWeb(fs.createReadStream(m.file, { start, end })), {
    status: 206,
    headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
  });
}

// ---------------------------------------------------------------- screen picker

let pickResolver = null;
ipcMain.on('screen:picked', (_e, id) => { pickResolver?.(id); pickResolver = null; });

async function handleDisplayMedia(_request, callback) {
  try {
    const own = new Set(BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId()));
    const sources = (await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 400, height: 225 } }))
      .filter((s) => !own.has(s.id));
    let chosen = null;
    if (sources.length === 1) {
      chosen = sources[0]; // Wayland: the system portal already asked the user
    } else if (sources.length && win) {
      const list = sources.map((s) => ({
        id: s.id, name: s.name, kind: s.id.startsWith('screen') ? 'screen' : 'window', thumb: s.thumbnail.toDataURL(),
      }));
      pickResolver?.(null);
      const id = await new Promise((resolve) => { pickResolver = resolve; win.webContents.send('screen:pick', list); });
      chosen = sources.find((s) => s.id === id) || null;
    }
    if (!chosen) return callback({});
    callback(process.platform === 'win32' ? { video: chosen, audio: 'loopback' } : { video: chosen });
  } catch (e) {
    console.error('[screen]', e);
    callback({});
  }
}

// ---------------------------------------------------------------- window

const ALLOWED_PERMISSIONS = new Set(['media', 'display-capture', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']);

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'Jungey Recorder',
    backgroundColor: '#0d0f13',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      // Keep drawing + recording at full speed when the window is behind another app.
      backgroundThrottling: false,
    },
  });

  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.on('closed', () => { win = null; });

  // Floating mini recording controls (opened by the page with window.open).
  win.webContents.setWindowOpenHandler(({ frameName, url }) => {
    if (frameName === 'jungey-mini') {
      const { workArea } = screen.getPrimaryDisplay();
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 392, height: 64,
          x: Math.round(workArea.x + workArea.width / 2 - 196), y: workArea.y + 16,
          frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true,
          minimizable: false, maximizable: false, fullscreenable: false,
          backgroundColor: '#15171d', title: 'Jungey controls',
          webPreferences: { backgroundThrottling: false },
        },
      };
    }
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', (child) => {
    child.setAlwaysOnTop(true, 'screen-saver');
    child.setVisibleOnAllWorkspaces(true);
  });

  // Closing while recording: the page blocks unload, we ask.
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Keep recording', 'Quit anyway'],
      defaultId: 0,
      cancelId: 0,
      message: 'A recording is in progress.',
      detail: 'Stop the recording first to save it. If you quit now, it will be recovered the next time you open the app.',
    });
    if (choice === 1) event.preventDefault();
  });

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadURL(APP_URL);
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(async () => {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    return url.host === 'media' ? serveMedia(url, request) : serveBundle(url);
  });

  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(ALLOWED_PERMISSIONS.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));
  session.defaultSession.setDisplayMediaRequestHandler(handleDisplayMedia, { useSystemPicker: true });

  if (process.platform === 'darwin') {
    await systemPreferences.askForMediaAccess('camera').catch(() => {});
    await systemPreferences.askForMediaAccess('microphone').catch(() => {});
  }

  void ffmpeg();
  await recoverOrphans();
  createWindow();

  // Work from any app while screen recording.
  globalShortcut.register('Alt+Shift+R', () => win?.webContents.send('shortcut', 'record'));
  globalShortcut.register('Alt+Shift+P', () => win?.webContents.send('shortcut', 'pause'));

  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
