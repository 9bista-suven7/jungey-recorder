#!/bin/sh
# Installs (or updates) Jungey Recorder for the current user, like the other Jungey apps:
#   app files   ~/.local/opt/jungey-recorder
#   command     ~/.local/bin/jungey-recorder
#   icons       ~/.local/share/icons/hicolor/*/apps/jungey-recorder.*
#   menu entry  ~/.local/share/applications/jungey-recorder.desktop
# Run with: npm run install-app  (builds first). Close the app before updating.
set -e
cd "$(dirname "$0")/.."

if pgrep -f "[.]local/opt/jungey-recorder/jungey-recorder" >/dev/null; then
  echo "Jungey Recorder is running. Close it first, then run this again." >&2
  exit 1
fi

rm -rf "$HOME/.local/opt/jungey-recorder"
mkdir -p "$HOME/.local/opt" "$HOME/.local/bin"
cp -a release/linux-unpacked "$HOME/.local/opt/jungey-recorder"

cat > "$HOME/.local/bin/jungey-recorder" <<'SH'
#!/bin/sh
# Jungey Recorder. --no-sandbox: Ubuntu 24.04's AppArmor blocks Electron's own sandbox for
# apps installed in your home folder. The app only loads its own built-in pages.
exec "$HOME/.local/opt/jungey-recorder/jungey-recorder" --no-sandbox "$@"
SH
chmod +x "$HOME/.local/bin/jungey-recorder"

for s in 16 32 48 128 256; do
  mkdir -p "$HOME/.local/share/icons/hicolor/${s}x${s}/apps"
  if command -v rsvg-convert >/dev/null; then
    rsvg-convert -w "$s" -h "$s" build/icon.svg -o "$HOME/.local/share/icons/hicolor/${s}x${s}/apps/jungey-recorder.png"
  fi
done
# Without rsvg-convert (package librsvg2-bin), the scalable icon and the 512px PNG still work.
mkdir -p "$HOME/.local/share/icons/hicolor/512x512/apps"
cp build/icon.png "$HOME/.local/share/icons/hicolor/512x512/apps/jungey-recorder.png"
mkdir -p "$HOME/.local/share/icons/hicolor/scalable/apps"
cp build/icon.svg "$HOME/.local/share/icons/hicolor/scalable/apps/jungey-recorder.svg"
gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1 || true

mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/jungey-recorder.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Jungey Recorder
GenericName=Video Recorder
Comment=Record explainer videos: blackboard, animated flows, your camera and screen
Exec=$HOME/.local/bin/jungey-recorder
Icon=jungey-recorder
Terminal=false
Categories=AudioVideo;Video;Recorder;
Keywords=video;record;recorder;blackboard;whiteboard;diagram;flow;tutorial;explainer;screen;webcam;teleprompter;
StartupWMClass=jungey-recorder
DESKTOP
update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true

echo "Installed Jungey Recorder. Open it from the app menu (Sound & Video) or run: jungey-recorder"
