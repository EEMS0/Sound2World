# Sound2World v0.3

Load a song and explore a procedural 3D world that responds to its rhythm, energy, and musical structure.

## Start the app

Do not open `index.html` directly. Modern browsers protect local JavaScript modules, so use the launcher included with the app:

- **Windows:** double-click `start_windows.bat`.
- **macOS/Linux:** open a terminal in the folder and run `bash start_mac_linux.sh`.

The launcher starts a tiny local web server and opens `http://localhost:5173`. Python 3 is the only requirement. The Three.js engine is included in the archive, so Sound2World does not need internet access.

## Load music

Click **Choose audio** or drag a file anywhere onto the app. Supported formats depend slightly on the browser, but current Chrome, Edge, Firefox and Safari generally support MP3, WAV, M4A/AAC and OGG. FLAC support varies.

Audio never leaves the device. Sound2World reads it locally, estimates its tempo and energy structure, and produces an INTRO / BUILD / DROP / BREAK / FLOW / OUTRO timeline.

## Controls

- WASD or arrow keys: move
- Drag the 3D view: look around
- Shift: sprint
- Cinematic: let the automatic director fly the camera
- Theme: cycle Moss, Aurora and Ember biomes
- World DNA: generate a new deterministic environment
- Reactivity: increase or reduce how strongly the world responds

## What changed in v0.3

- Rebuilt file upload with a native file label, global drag-and-drop, validation, progress, errors and reliable replacement/removal.
- Bundled Three.js locally instead of relying on a CDN.
- Added offline track analysis, estimated BPM and a generated musical-section timeline.
- Added an adaptive beat detector, shockwaves, crystals, stronger drop transformations and section-aware fog/lighting.
- Finished the cinematic camera mode and improved terrain-following exploration.
- Added three biomes, regenerating World DNA, volume, reactivity and fullscreen controls.
- Redesigned the interface for clearer loading, playback and director feedback.
