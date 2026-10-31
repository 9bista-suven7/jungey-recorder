'use strict';
// Electron main process: window, on-disk video library, screen picker, ffmpeg finishing.
const {
  app, BrowserWindow, ipcMain, protocol, session, desktopCapturer,
  shell, globalShortcut, dialog, systemPreferences, screen, net,
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

// ---------------------------------------------------------------- real data for charts

/**
 * Yearly figures from the World Bank's open API (no key). The only request the app makes to
 * the internet, and only when you press "Get data". The URL is built here from checked codes.
 */
ipcMain.handle('data:worldbank', async (_e, { country, indicator, years }) => {
  if (!/^[A-Za-z]{2,3}$/.test(country) || !/^[A-Z][A-Z0-9.]{2,40}$/.test(indicator)) throw new Error('Unknown country or indicator');
  const n = Math.max(2, Math.min(60, Number(years) || 15));
  const url = `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&per_page=${n}&mrv=${n}`;
  const res = await net.fetch(url);
  if (!res.ok) throw new Error(`The World Bank answered ${res.status}`);
  const json = await res.json();
  const rows = Array.isArray(json) && Array.isArray(json[1]) ? json[1] : [];
  return {
    country: rows[0]?.country?.value ?? country,
    points: rows
      .filter((r) => typeof r.value === 'number')
      .map((r) => ({ year: String(r.date), value: r.value }))
      .sort((a, b) => a.year.localeCompare(b.year)),
  };
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
      // The picker lives in the app window; while presenting that window is out of the way.
      if (win.isMinimized()) {
        win.restore();
        win.show();
        win.focus();
      }
      const id = await new Promise((resolve) => { pickResolver = resolve; win.webContents.send('screen:pick', list); });
      chosen = sources.find((s) => s.id === id) || null;
    }
    if (!chosen) return callback({});
    lastSource = { id: chosen.id, displayId: chosen.display_id };
    callback(process.platform === 'win32' ? { video: chosen, audio: 'loopback' } : { video: chosen });
  } catch (e) {
    console.error('[screen]', e);
    callback({});
  }
}

// ---------------------------------------------------------------- drawing on the shared screen
// While you record your whole screen, a see-through window covers it. You draw, point and stamp
// emojis on top of any app, and the screen recording picks it up exactly as you see it.
// The page opens these windows itself (window.open), so they share its state.

let lastSource = null;
/** Set while presenting a whole screen: the area the ink layer covers. */
let desk = null;
/** A drawing tool is picked (the ink layer takes the mouse). */
let drawing = false;
let wheelTimer = null;
/** Child windows by name: jungey-ink (ink layer), jungey-cam (face bubble), jungey-mini (controls). */
const kids = new Map();
const DESK_KEYS = ['Alt+Shift+D'];
const DRAW_KEYS = ['Escape', 'CommandOrControl+Z'];

/** The area the shared screen covers. `hint` is what the captured video track reports. */
function sourceBounds(src, hint) {
  const all = screen.getAllDisplays();
  const match = src && all.find((d) => String(d.id) === String(src.displayId));
  if (match) return match.bounds;
  if (all.length === 1) return all[0].bounds;
  // Linux and the macOS system picker don't say which display: the one whose pixel size matches
  // the capture, preferring the display the pointer is on when several are the same size.
  const w = Number(hint?.width) || 0, h = Number(hint?.height) || 0;
  const same = all.filter((d) => Math.round(d.size.width * d.scaleFactor) === w && Math.round(d.size.height * d.scaleFactor) === h);
  if (same.length) {
    const near = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    return (same.find((d) => d.id === near.id) || same[0]).bounds;
  }
  // One capture of every monitor together (X11): cover them all.
  const x0 = Math.min(...all.map((d) => d.bounds.x)), y0 = Math.min(...all.map((d) => d.bounds.y));
  const x1 = Math.max(...all.map((d) => d.bounds.x + d.bounds.width)), y1 = Math.max(...all.map((d) => d.bounds.y + d.bounds.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Where the floating controls go: bottom middle of the shared screen, else top middle. */
function miniPlace(width, height) {
  const area = (desk ? screen.getDisplayMatching(desk.bounds) : screen.getPrimaryDisplay()).workArea;
  return { x: Math.round(area.x + area.width / 2 - width / 2), y: desk ? area.y + area.height - height - 20 : area.y + 16, width, height };
}

const kid = (name) => {
  const w = kids.get(name);
  return w && !w.isDestroyed() ? w : null;
};

/** Controls and face bubble always sit above the ink layer, so they stay clickable. */
function restack() {
  kid('jungey-cam')?.moveTop();
  kid('jungey-mini')?.moveTop();
}

function shortcuts(keys, on, send) {
  for (const k of keys) {
    if (!on) globalShortcut.unregister(k);
    else if (!globalShortcut.isRegistered(k)) globalShortcut.register(k, () => win?.webContents.send('shortcut', send(k)));
  }
}

// Linux desktops with picom-style effects blur and shadow whatever is behind a see-through window,
// which would frost the whole screen under the ink layer. GTK's own client-side-decorated windows
// carry _GTK_FRAME_EXTENTS, and nearly every effects config leaves those alone, so the overlays
// carry it too. Nothing to do on Wayland (no overlays there) or other platforms.
const SET_PROP_PY = `
import ctypes, sys
x = ctypes.CDLL('libX11.so.6')
x.XOpenDisplay.restype = ctypes.c_void_p; x.XOpenDisplay.argtypes = [ctypes.c_char_p]
x.XInternAtom.restype = ctypes.c_ulong; x.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
x.XChangeProperty.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_void_p, ctypes.c_int]
x.XCloseDisplay.argtypes = [ctypes.c_void_p]
d = x.XOpenDisplay(None)
w = int(sys.argv[1], 16)
card = x.XInternAtom(d, b'CARDINAL', 0)
x.XChangeProperty(d, w, x.XInternAtom(d, b'_GTK_FRAME_EXTENTS', 0), card, 32, 0, (ctypes.c_ulong * 4)(0, 0, 0, 0), 4)
x.XChangeProperty(d, w, x.XInternAtom(d, b'_COMPTON_SHADOW', 0), card, 32, 0, (ctypes.c_ulong * 1)(0), 1)
x.XCloseDisplay(d)
`;
function exemptFromDesktopEffects(w) {
  if (process.platform !== 'linux' || process.env.XDG_SESSION_TYPE === 'wayland') return;
  let id;
  try {
    id = '0x' + w.getNativeWindowHandle().readUInt32LE(0).toString(16);
  } catch {
    return;
  }
  const apply = () => {
    if (w.isDestroyed()) return;
    execFile('xprop', ['-id', id, '-f', '_GTK_FRAME_EXTENTS', '32c', '-set', '_GTK_FRAME_EXTENTS', '0, 0, 0, 0'], (e) => {
      if (e) return execFile('python3', ['-c', SET_PROP_PY, id], () => {});
      execFile('xprop', ['-id', id, '-f', '_COMPTON_SHADOW', '32c', '-set', '_COMPTON_SHADOW', '0'], () => {});
    });
  };
  // Chromium clears the property while it finishes setting the window up, so apply it now and
  // again a little later.
  apply();
  for (const ms of [250, 1500]) setTimeout(apply, ms);
}

/** Number features from window.open ("left=10,top=20,width=300,height=200"). */
function features(str) {
  const out = {};
  for (const part of String(str || '').split(',')) {
    const [k, v] = part.split('=').map((x) => x.trim());
    if (k && /^-?\d+(\.\d+)?$/.test(v || '')) out[k] = Math.round(Number(v));
  }
  return out;
}

/** Everything presenting holds in this process, let go: shortcuts, timers, the floating windows. */
function endDesk() {
  shortcuts(DESK_KEYS, false);
  shortcuts(DRAW_KEYS, false);
  drawing = false;
  swallowed = null;
  clearInterval(wheelTimer);
  desk = null;
  for (const name of ['jungey-cam', 'jungey-mini', 'jungey-ink']) kid(name)?.destroy();
}

// `hint` comes from the captured video track: surface ('monitor' / 'window') and pixel size. It
// stands in for the picker's choice when the picker was the system's own (macOS 15+).
ipcMain.handle('desk:begin', (_e, hint) => {
  // Wayland can't place windows over the screen: the shared screen shows inside the app instead.
  if (process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland') return { kind: 'window', bounds: null };
  const surface = typeof hint?.surface === 'string' ? hint.surface : null;
  const kind = lastSource ? (lastSource.id.startsWith('screen') ? 'screen' : 'window') : surface === 'monitor' ? 'screen' : surface ? 'window' : null;
  if (kind !== 'screen') return { kind, bounds: null };
  desk = { bounds: sourceBounds(lastSource, hint) };
  shortcuts(DESK_KEYS, true, () => 'draw');
  // Out of the way, so the recording starts on your screen, not on this window.
  win?.minimize();
  return { kind, bounds: desk.bounds };
});

ipcMain.handle('desk:end', () => {
  const was = !!desk;
  endDesk();
  if (!was || !win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

ipcMain.on('desk:draw', (_e, on) => {
  const ink = kid('jungey-ink');
  drawing = !!on && !!ink;
  swallowed = null;
  clearInterval(wheelTimer);
  // While drawing, Esc goes back to using your apps and Ctrl+Z takes back the last mark.
  shortcuts(DRAW_KEYS, drawing, (k) => (k === 'Escape' ? 'mouse' : 'undo'));
  if (!ink) return;
  ink.setIgnoreMouseEvents(!drawing);
  // Back to your apps: the layer and controls give up the keyboard too, so typing never re-arms a tool.
  if (!drawing) {
    ink.blur();
    kid('jungey-mini')?.blur();
  }
  restack();
});

// Scrolling while drawing: the wheel can't reach the app through the ink layer, so on the first
// notch the layer lets the mouse through, sends that notch again so it isn't lost, and stays out
// of the way until the pointer moves on (you're about to draw again).
const WHEEL_PY = `
import ctypes, sys
x = ctypes.CDLL('libX11.so.6'); t = ctypes.CDLL('libXtst.so.6')
x.XOpenDisplay.restype = ctypes.c_void_p; x.XOpenDisplay.argtypes = [ctypes.c_char_p]
x.XFlush.argtypes = [ctypes.c_void_p]; x.XCloseDisplay.argtypes = [ctypes.c_void_p]
t.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
d = x.XOpenDisplay(None)
for b in sys.argv[1:]:
    t.XTestFakeButtonEvent(d, int(b), 1, 0); t.XTestFakeButtonEvent(d, int(b), 0, 0)
x.XFlush(d); x.XCloseDisplay(d)
`;
/** Wheel notches that hit the ink layer before the mouse went through (its page reports them). */
let swallowed = null;
let replaying = false;
function replayWheel(buttons, done) {
  if (process.platform !== 'linux' || !buttons.length) return done();
  replaying = true;
  // The helper exits after XFlush, so by the callback the notches are in the X server.
  execFile('python3', ['-c', WHEEL_PY, ...buttons.slice(0, 6).map(String)], () => {
    replaying = false;
    done();
  });
}
ipcMain.on('desk:wheel', (_e, d) => {
  if (!swallowed) return;
  // One X button press per notch. Touchpad nudges smaller than a third of a notch are not worth it.
  const y = Number(d?.y) || 0, x = Number(d?.x) || 0;
  if (Math.abs(y) >= 40) swallowed.push(y > 0 ? 5 : 4);
  else if (Math.abs(x) >= 40) swallowed.push(x > 0 ? 7 : 6);
});
/** Takes the mouse back once the pointer moves on (you're about to draw again). */
function watchPointer() {
  const from = screen.getCursorScreenPoint();
  clearInterval(wheelTimer);
  wheelTimer = setInterval(() => {
    const k = kid('jungey-ink');
    if (!k || !drawing) return clearInterval(wheelTimer);
    const p = screen.getCursorScreenPoint();
    if (Math.hypot(p.x - from.x, p.y - from.y) > 12) {
      clearInterval(wheelTimer);
      k.setIgnoreMouseEvents(false);
    }
  }, 100);
}
function scrollThrough() {
  const ink = kid('jungey-ink');
  if (!ink || !drawing || replaying) return;
  ink.setIgnoreMouseEvents(true);
  if (swallowed) return; // a pass-through is already starting; its notches are being collected
  swallowed = [];
  clearInterval(wheelTimer);
  // Collect the notches that still land here, send them again, and only once they are out watch
  // the pointer, so the replay can't bounce back into the layer.
  setTimeout(() => {
    const s = swallowed;
    swallowed = null;
    if (!drawing) return;
    replayWheel(s, () => drawing && watchPointer());
  }, 120);
}

ipcMain.on('desk:moveCam', (_e, pos) => {
  const cam = kid('jungey-cam');
  if (!cam || !desk) return;
  const { width, height } = cam.getBounds();
  const b = desk.bounds;
  // Keep at least half of it on the shared screen.
  const x = Math.min(Math.max(Math.round(pos?.x || 0), b.x - width / 2), b.x + b.width - width / 2);
  const y = Math.min(Math.max(Math.round(pos?.y || 0), b.y - height / 2), b.y + b.height - height / 2);
  cam.setPosition(Math.round(x), Math.round(y));
});

ipcMain.on('desk:toolbar', (_e, size) => {
  const m = kid('jungey-mini');
  if (!m) return;
  const b = m.getBounds();
  const w = Math.max(200, Math.round(size?.width || 0));
  const h = Math.max(40, Math.round(size?.height || 0));
  if (w === b.width && h === b.height) return;
  // Grow away from the nearest screen edge.
  const area = screen.getDisplayMatching(b).workArea;
  const low = b.y + b.height / 2 > area.y + area.height / 2;
  m.setResizable(true);
  m.setBounds({ x: Math.round(b.x + (b.width - w) / 2), y: low ? b.y + b.height - h : b.y, width: w, height: h });
  m.setResizable(false);
});

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
  win.on('closed', () => { endDesk(); win = null; });
  win.webContents.on('render-process-gone', endDesk);
  win.webContents.on('did-start-navigation', (ev, _url, inPlace, mainFrame) => {
    if ((ev?.isMainFrame ?? mainFrame) && !(ev?.isSameDocument ?? inPlace)) endDesk();
  });

  // Floating windows the page opens with window.open: recording controls, and while presenting
  // a whole screen, the ink layer over it and the face bubble.
  const floating = {
    frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true,
    minimizable: false, maximizable: false, fullscreenable: false,
    webPreferences: { backgroundThrottling: false },
  };
  const clear = { transparent: true, backgroundColor: '#00000000', hasShadow: false };
  win.webContents.setWindowOpenHandler(({ frameName, url, features: feat }) => {
    const f = features(feat);
    if (frameName === 'jungey-mini') {
      // Over a shared screen: bottom middle, clear of what you're showing. Otherwise: top middle.
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { ...floating, ...miniPlace(f.width || 392, f.height || 64), backgroundColor: '#15171d', title: 'Jungey controls' },
      };
    }
    if (frameName === 'jungey-ink' && desk) {
      const { x, y, width, height } = desk.bounds;
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          ...floating, ...clear, x, y, width, height, movable: false, enableLargerThanScreen: true, title: 'Jungey ink',
        },
      };
    }
    if (frameName === 'jungey-cam' && desk && f.width && f.height) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { ...floating, ...clear, x: f.left, y: f.top, width: f.width, height: f.height, title: 'Jungey camera' },
      };
    }
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', (child, { frameName }) => {
    kids.set(frameName, child);
    child.on('closed', () => kids.get(frameName) === child && kids.delete(frameName));
    child.setAlwaysOnTop(true, 'screen-saver');
    child.setVisibleOnAllWorkspaces(true);
    if (frameName === 'jungey-ink' || frameName === 'jungey-cam') exemptFromDesktopEffects(child);
    if (frameName === 'jungey-ink') {
      // Clicks go through to your apps until you pick a drawing tool.
      child.setIgnoreMouseEvents(true);
      // Controls already open from a window share: now they belong over the shared screen.
      for (const name of ['jungey-cam', 'jungey-mini']) kid(name)?.setParentWindow(child);
      const m = kid('jungey-mini');
      if (m && desk) {
        const b = m.getBounds();
        m.setBounds(miniPlace(b.width, b.height));
      }
      child.webContents.on('input-event', (_e, input) => input.type === 'mouseWheel' && scrollThrough());
      if (desk) child.setBounds(desk.bounds);
    }
    // Windows and macOS leave the controls out of the recording.
    if (frameName === 'jungey-mini') child.setContentProtection(true);
    // Owned by the ink layer, so window managers always keep them above it, even after you click it.
    const ink = kid('jungey-ink');
    if (ink && frameName !== 'jungey-ink') child.setParentWindow(ink);
    restack();
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
