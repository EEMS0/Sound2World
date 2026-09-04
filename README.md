# Sound2World v0.4.1

Load a song and explore a procedural 3D world that responds to its rhythm, energy, and musical structure.

**Live demo:** https://eems0.github.io/Sound2World/

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
- Immersive: fade the interface away so the world can fill the screen

## What changed in v0.4.1

- Fixed expanding ground pulses so uneven terrain can no longer clip away one side of the ring.
- Added song-adaptive frequency normalization so quiet, loud, warm and bright tracks produce balanced movement.
- Rebuilt onset and beat detection with spectral flux, dynamic thresholds and smoother attack/release response.
- Improved offline tempo estimation and section choreography for more convincing builds, drops and breakdowns.
- Added an animated aurora sky, soft moon, living grass, layered trees, atmospheric mist and luminous terrain paths.
- Added a central World Heart with orbital rings, vortex particles, beat pulses and expanding shockwaves.
- Added a live spectrum, pulse meter, musical-texture readout, cinematic section titles and an immersive interface mode.
- Refined bloom, colour, fog, camera motion and vegetation response to feel musical without constant visual twitching.
