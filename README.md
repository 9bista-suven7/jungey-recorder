# Jungey Recorder

A desktop app for making explainer videos the way tutors and YouTubers do: draw on a chalk board,
build animated flow diagrams, show your face in a bubble (or don't), share your screen, read from a
teleprompter, and get an MP4.

Pick what you want to make on the start screen and you're ready to record. Board, camera and mic are set up for you.

| Start with | What you get |
|---|---|
| Blackboard lesson | Chalk board with texture, face bubble in the corner |
| Explain a flow | Diagrams, pipelines and architecture with real tech logos, revealed step by step |
| Whiteboard explainer | Clean markers on white |
| Screen + me | Share your screen and draw, point and add emojis right on top of any app, face bubble |
| Teach from slides | Opens a PDF or images as pages you can mark up |
| Talking head | Full camera with a scrolling teleprompter |
| Shorts & Reels | Vertical 9:16, you on top and the board below |

## Features

- **Layouts you can switch while recording:** board only, board + face bubble, side by side, just you, screen + you.
  The video is exactly what you see on the stage; tools, menus and the script never appear in it.
- **Drawing:** pen (pressure on tablets), highlighter, eraser, line / arrow / box / circle, handwritten text,
  laser pointer, pan and zoom, pages, undo / redo. Colours adapt when you switch boards.
- **Flow diagrams:** boxes, decisions, databases, sections, sticky notes and ~6,000 icons (Maven, MongoDB, Kafka,
  Docker, AWS, bank, tree, person…) grouped by sector (Tech, Finance, Business, Science, Nature & people) with search.
  Templates: stock price story, inflation explained, request flow, CI/CD pipeline, Git branching, microservices, org chart.
- **Charts:** line, area, bar, pie, donut and candlestick charts that draw themselves in while you talk (lines run left
  to right, bars grow, values count up). Paste a table from Excel or Google Sheets, open a CSV, or get real figures
  from the [World Bank](https://data.worldbank.org) (inflation, GDP growth, unemployment, interest rates, population)
  for 30 countries and compare them. For stock prices, use `=GOOGLEFINANCE(...)` in Google Sheets and paste the result.
- **Steps and animations:** press <kbd>→</kbd> while recording to reveal the next step. Arrows draw themselves and data
  flows along them. Animate anything: pop, grow, jump in, slide, jump, shake, pulse, spin, collapse, regrow, run along an
  arrow… Diagrams without steps reveal in arrow order automatically.
- **Draw on your screen:** record your whole screen and draw right on top of any app: pen, highlighter, arrows,
  boxes, circles, emojis, numbered steps (1, 2, 3…) and a laser pointer. Click the pointer button (or press <kbd>Esc</kbd>) to use your
  apps again; your marks stay until you clear them. Your face bubble sits on the screen too, so you can drag it out of the way,
  and the video shows exactly what you see. (Windows leaves the floating controls out of the video; Linux can't,
  so drag them to a corner.)
- **Recording:** 3-2-1 countdown, pause / resume, a floating mini control bar while you present another app,
  <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> / <kbd>P</kbd> work from any app. Chunks are written to disk as you record,
  so a crash doesn't lose the take (it is recovered on next start).
- **After recording:** watch it, trim the start and end, rename, show in folder, save a copy.

Everything stays on your computer. Nothing is uploaded. The only time the app goes online is when you press
**Get data** in a chart, which downloads public figures from the World Bank.

## Download

**Linux (x64):** get `jungey-recorder-<version>-x86_64.AppImage` from the
[latest release](https://github.com/9bista-suven7/jungey-recorder/releases/latest), then:

```bash
chmod +x jungey-recorder-*-x86_64.AppImage
./jungey-recorder-*-x86_64.AppImage --no-sandbox
```

`--no-sandbox` is needed on Ubuntu 24.04 and newer (AppArmor blocks Electron's own sandbox for AppImages).
If it doesn't start, install FUSE 2, which AppImages need: `sudo apt install libfuse2t64` on Ubuntu 24.04,
`sudo apt install libfuse2` on 22.04. Install [ffmpeg](https://ffmpeg.org/download.html) too for the best MP4 files.

**Windows (x64):** get `jungey-recorder-<version>-windows-setup.exe` from the
[latest release](https://github.com/9bista-suven7/jungey-recorder/releases/latest) and run it. It installs for your
user (no admin rights) and adds a Start menu shortcut. The installer isn't code-signed yet, so Windows SmartScreen may
say "Windows protected your PC": click **More info → Run anyway**. Install ffmpeg with `winget install Gyan.FFmpeg`.

**macOS:** not yet; build from source on a Mac as described below.

## What you need

| | Needed for | Download |
|---|---|---|
| **Node.js 22 LTS or newer** (includes npm) | Running and building from source | <https://nodejs.org/en/download> |
| **Git** | Getting the source | <https://git-scm.com/downloads> |
| **ffmpeg** (recommended) | Standard MP4 output (H.264 + AAC) that plays everywhere; fast, exact trimming | <https://ffmpeg.org/download.html> |

Installing ffmpeg:

- Ubuntu / Debian: `sudo apt install ffmpeg`
- macOS (Homebrew, <https://brew.sh>): `brew install ffmpeg`
- Windows: `winget install Gyan.FFmpeg` (or a build from <https://www.gyan.dev/ffmpeg/builds/>)

Without ffmpeg the app still works: recordings are still MP4, and trimming re-records the clip in real time.

A webcam and microphone are optional; everything else works without them.

## Run it

```bash
git clone https://github.com/9bista-suven7/jungey-recorder.git
cd jungey-recorder
npm install
npm run dev
```

`npm run dev` copies the icon set into `public/devicon/`, starts Vite and opens the Electron window with hot reload.
Changing code reloads the window, so don't edit files while a recording is running.

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Typecheck and build the production bundle into `dist/` |
| `npm start` | Build, then run the production app (faster than dev mode) |
| `npm run typecheck` | Typecheck only |

## Install on Linux (for your user, no sudo)

```bash
npm run install-app
```

This builds the app and installs it like any other desktop app:

| What | Where |
|---|---|
| App files | `~/.local/opt/jungey-recorder` |
| Command | `~/.local/bin/jungey-recorder` |
| App-menu entry (Sound & Video) | `~/.local/share/applications/jungey-recorder.desktop` |
| Icons | `~/.local/share/icons/hicolor/*/apps/jungey-recorder.*` |

Run the same command again to update; close the app first.

The installed launcher starts the app with `--no-sandbox`, because Ubuntu 24.04's AppArmor blocks Electron's own
sandbox for apps installed in your home folder. The app only loads its own built-in pages. To turn the sandbox on
anyway (needs your password):

```bash
sudo chown root:root ~/.local/opt/jungey-recorder/chrome-sandbox
sudo chmod 4755 ~/.local/opt/jungey-recorder/chrome-sandbox
```

Then remove `--no-sandbox` from `~/.local/bin/jungey-recorder`.

## Build installers (deploy)

```bash
npm run dist
```

Output goes to `release/`:

| Platform | File | How to run it |
|---|---|---|
| Linux | `jungey-recorder-<version>-x86_64.AppImage` | `chmod +x` it, then run it with `--no-sandbox` |
| macOS | `.dmg` (build on a Mac) | Open and drag to Applications |
| Windows | `.exe` installer (build on Windows) | Run the installer |

Build each installer on its own platform. To also build a Linux `.deb`, add `"homepage"` and an author email to
`package.json` and add `"deb"` to `build.linux.target`.

**Publishing a version for download:** bump `version` in `package.json`, commit and push, then publish a release:

```bash
gh release create v0.2.0 --title "Jungey Recorder 0.2.0" --notes "What's new"
```

Publishing the release starts the **Build installers** GitHub Actions workflow (`.github/workflows/release.yml`), which
builds the Linux AppImage on Linux and the Windows installer on Windows and attaches both to the release, usually within
about 10 minutes. You can also run it by hand from the repo's **Actions** tab for an existing tag.

## Where things are saved

| What | Linux | macOS | Windows |
|---|---|---|---|
| Videos | `~/Videos/Jungey Recorder/` | `~/Movies/Jungey Recorder/` | `Videos\Jungey Recorder\` |
| Boards (one JSON file each) | `~/.config/jungey-recorder/projects/` | `~/Library/Application Support/jungey-recorder/projects/` | `%APPDATA%\jungey-recorder\projects\` |

## Keyboard shortcuts

| Keys | Action |
|---|---|
| <kbd>R</kbd> / <kbd>K</kbd> | Start-stop recording / pause |
| <kbd>→</kbd> <kbd>←</kbd> | Next / previous step (or page) |
| <kbd>V</kbd> <kbd>P</kbd> <kbd>H</kbd> <kbd>E</kbd> <kbd>S</kbd> <kbd>T</kbd> <kbd>L</kbd> | Select, pen, highlighter, eraser, shapes, text, laser |
| <kbd>A</kbd> | Open the library (boxes, icons, templates) |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> | Sharing your whole screen: start drawing on it / back to your apps (<kbd>Esc</kbd> also goes back) |
| Hold <kbd>Space</kbd> | Move the board |
| <kbd>1</kbd>–<kbd>6</kbd>, <kbd>[</kbd> <kbd>]</kbd> | Colours, thinner / thicker |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> | Undo / redo |
| <kbd>Del</kbd>, <kbd>Ctrl</kbd>+<kbd>D</kbd> | Delete, duplicate the selection |

Press <kbd>?</kbd> in the app for the full list.

## Project layout

```
electron/main.cjs     window, app:// protocol, video library and board files on disk, screen picker, ffmpeg
electron/preload.cjs  the bridge the page uses (window.jungey)
src/engine/           compositor (draws each frame), input, media, recorder, session, PDF import, trim
src/diagram/          flow diagrams: shapes, arrows, icons, charts, steps, animations, templates
src/components/       Home, Studio (TopBar, ToolDock, Stage, LibraryPanel, PagesBar, Teleprompter), Review, overlays
scripts/              dev runner, icon copier, Linux installer
```

Built with Electron, React, Vite and TypeScript.

## Credits

- Icons: [Devicon](https://devicon.dev) (MIT), [Simple Icons](https://simpleicons.org) (CC0), [Lucide](https://lucide.dev) (ISC).
  Brand logos are trademarks of their owners.
- Strokes: [perfect-freehand](https://github.com/steveruizok/perfect-freehand) (MIT). PDF pages: [pdf.js](https://mozilla.github.io/pdf.js/) (Apache-2.0).
- Economic data: [World Bank Open Data](https://data.worldbank.org) (CC BY 4.0), fetched only when you ask for it.
- Fonts: [Inter](https://rsms.me/inter/) and [Caveat](https://fonts.google.com/specimen/Caveat) (SIL Open Font License).
