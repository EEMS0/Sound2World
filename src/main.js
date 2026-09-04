import { AudioEngine, formatTime } from './audio-engine.js?v=0.4.1';
import { WorldEngine } from './world-engine.js?v=0.4.1';

const byId = (id) => document.getElementById(id);
const ui = {
  world: byId('world'), audio: byId('audio'), file: byId('fileInput'), drop: byId('dropZone'),
  empty: byId('emptyTrack'), loaded: byId('loadedTrack'), clear: byId('clearTrack'),
  trackName: byId('trackName'), trackDetails: byId('trackDetails'), fileError: byId('fileError'),
  analysisWrap: byId('analysisWrap'), analysisLabel: byId('analysisLabel'), analysisPercent: byId('analysisPercent'), analysisProgress: byId('analysisProgress'),
  status: byId('engineStatus'), section: byId('sectionName'), bpm: byId('bpmBadge'), timeline: byId('timeline'), durationLabel: byId('durationLabel'), directorCopy: byId('directorCopy'),
  play: byId('playButton'), seek: byId('seek'), current: byId('currentTime'), total: byId('totalTime'), volume: byId('volume'),
  camera: byId('cameraButton'), theme: byId('themeButton'), immersive: byId('immersiveButton'), fullscreen: byId('fullscreenButton'), modeHint: byId('modeHint'),
  sensitivity: byId('sensitivity'), sensitivityValue: byId('sensitivityValue'), dnaButton: byId('dnaButton'), dna: byId('dna'),
  toast: byId('toast'), fatal: byId('fatalError'), spectrum: byId('spectrumCanvas'), texture: byId('textureName'),
  pulseFlash: byId('pulseFlash'), sectionTransition: byId('sectionTransition'),
  meters: {
    bass: [byId('bassBar'), byId('bassValue')], mid: [byId('midBar'), byId('midValue')],
    high: [byId('highBar'), byId('highValue')], beatStrength: [byId('pulseBar'), byId('pulseValue')],
    energy: [byId('energyBar'), byId('energyValue')]
  }
};

let world;
try {
  world = new WorldEngine(ui.world, { onFatal: () => { ui.fatal.hidden = false; } });
} catch (error) {
  console.error(error);
  ui.fatal.hidden = false;
}

const audioEngine = new AudioEngine(ui.audio, {
  onStatus: (message, progress) => updateAnalysis(message, progress),
  onAnalysis: (analysis) => renderTimeline(analysis)
});

let toastTimer = 0;
let activeSection = 'DREAMING';
let isScrubbing = false;
let lastFrame = performance.now();
let lastSpectrumDraw = 0;

function setEngineStatus(label, mode = 'idle') {
  ui.status.dataset.mode = mode;
  ui.status.querySelector('span').textContent = label;
}

function showToast(message, kind = 'info') {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.dataset.kind = kind;
  ui.toast.classList.add('visible');
  toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), 3200);
}

function updateAnalysis(message, progress = null) {
  if (!message) {
    ui.analysisWrap.hidden = true;
    return;
  }
  ui.analysisWrap.hidden = false;
  ui.analysisLabel.textContent = message;
  const value = Math.round((progress ?? 0) * 100);
  ui.analysisPercent.textContent = `${value}%`;
  ui.analysisProgress.style.width = `${value}%`;
}

function renderTimeline(analysis) {
  ui.timeline.replaceChildren();
  for (const segment of analysis.segments) {
    const item = document.createElement('i');
    item.className = `timeline-segment section-${segment.label.toLowerCase()}`;
    item.dataset.label = segment.label;
    item.dataset.start = String(segment.start);
    item.dataset.end = String(segment.end);
    item.title = `${segment.label} · ${formatTime(segment.start)}–${formatTime(segment.end)}`;
    item.style.width = `${Math.max(1.5, ((segment.end - segment.start) / analysis.duration) * 100)}%`;
    ui.timeline.append(item);
  }
  ui.bpm.textContent = analysis.bpm ? `${analysis.bpm} BPM` : 'FREE TIME';
  ui.durationLabel.textContent = formatTime(analysis.duration);
  updateAnalysis(null);
}

function markActiveSegment(time) {
  for (const item of ui.timeline.children) {
    item.classList.toggle('active', time >= +item.dataset.start && time < +item.dataset.end);
  }
}

async function loadFile(file) {
  if (!file) return;
  ui.fileError.hidden = true;
  ui.analysisWrap.hidden = false;
  setEngineStatus('Reading sound', 'working');
  try {
    const info = await audioEngine.loadFile(file);
    ui.empty.hidden = true;
    ui.loaded.hidden = false;
    ui.trackName.textContent = info.name;
    ui.trackDetails.textContent = `${info.typeLabel} · ${formatTime(info.duration)}${info.bpm ? ` · ${info.bpm} BPM` : ''} · local analysis`;
    ui.total.textContent = formatTime(info.duration);
    ui.play.disabled = false;
    ui.play.querySelector('span').textContent = '▶';
    ui.play.setAttribute('aria-label', 'Play');
    updateAnalysis(null);
    setEngineStatus('World ready', 'ready');
    showToast('Audio loaded. Press play to enter the world.', 'success');
  } catch (error) {
    ui.fileError.textContent = error.message || 'That audio file could not be opened.';
    ui.fileError.hidden = false;
    ui.analysisWrap.hidden = true;
    setEngineStatus('Needs audio', 'error');
    showToast(ui.fileError.textContent, 'error');
  } finally {
    ui.file.value = '';
  }
}

ui.file.addEventListener('change', (event) => loadFile(event.target.files?.[0]));
for (const eventName of ['dragenter', 'dragover']) {
  document.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    ui.drop.classList.add('dragging');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  document.addEventListener(eventName, (event) => {
    event.preventDefault();
    ui.drop.classList.remove('dragging');
  });
}
document.addEventListener('drop', (event) => loadFile(event.dataTransfer?.files?.[0]));

ui.clear.addEventListener('click', () => {
  audioEngine.clear();
  ui.empty.hidden = false;
  ui.loaded.hidden = true;
  ui.analysisWrap.hidden = true;
  ui.fileError.hidden = true;
  ui.timeline.innerHTML = '<i class="timeline-placeholder"></i>';
  ui.bpm.textContent = '— BPM';
  ui.durationLabel.textContent = 'No track';
  ui.current.textContent = ui.total.textContent = '0:00';
  ui.seek.value = '0';
  ui.play.querySelector('span').textContent = '▶';
  setEngineStatus('Dreaming', 'idle');
});

ui.play.addEventListener('click', async () => {
  if (!audioEngine.loaded) {
    ui.file.click();
    return;
  }
  try {
    const playing = await audioEngine.togglePlayback();
    ui.play.querySelector('span').textContent = playing ? 'Ⅱ' : '▶';
    ui.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    setEngineStatus(playing ? 'Listening' : 'Paused', playing ? 'live' : 'ready');
  } catch (error) {
    showToast(error.message || 'Playback could not start.', 'error');
  }
});
ui.audio.addEventListener('pause', () => { ui.play.querySelector('span').textContent = '▶'; ui.play.setAttribute('aria-label', 'Play'); });
ui.audio.addEventListener('play', () => { ui.play.querySelector('span').textContent = 'Ⅱ'; ui.play.setAttribute('aria-label', 'Pause'); });
ui.audio.addEventListener('ended', () => setEngineStatus('Journey complete', 'ready'));

ui.seek.addEventListener('pointerdown', () => { isScrubbing = true; });
ui.seek.addEventListener('pointerup', () => { isScrubbing = false; });
ui.seek.addEventListener('input', () => {
  if (!audioEngine.duration) return;
  audioEngine.currentTime = (+ui.seek.value / 1000) * audioEngine.duration;
  ui.current.textContent = formatTime(audioEngine.currentTime);
});
ui.volume.addEventListener('input', () => { ui.audio.volume = +ui.volume.value / 100; });
ui.audio.volume = +ui.volume.value / 100;

ui.sensitivity.addEventListener('input', () => { ui.sensitivityValue.textContent = `${ui.sensitivity.value}%`; });
ui.camera.addEventListener('click', () => {
  const cinematic = world?.toggleCamera();
  ui.camera.querySelector('span').textContent = cinematic ? 'Explore' : 'Cinematic';
  ui.modeHint.textContent = cinematic ? 'CINEMATIC DIRECTOR ACTIVE · CLICK EXPLORE TO TAKE CONTROL' : 'DRAG TO LOOK · WASD TO EXPLORE · SHIFT TO SPRINT';
  showToast(cinematic ? 'Cinematic director enabled.' : 'Camera control returned to you.');
});
ui.theme.addEventListener('click', () => {
  const theme = world?.cycleTheme();
  if (theme) {
    ui.theme.querySelector('span').textContent = theme.name;
    ui.dna.textContent = world.dna;
  }
});
ui.immersive.addEventListener('click', () => {
  const hidden = document.body.classList.toggle('hud-hidden');
  ui.immersive.querySelector('span').textContent = hidden ? 'Show UI' : 'Immersive';
  ui.immersive.title = hidden ? 'Show interface' : 'Hide interface';
});
ui.dnaButton.addEventListener('click', () => {
  const dna = world?.regenerate();
  if (dna) ui.dna.textContent = dna;
  showToast('A new World DNA has been grown.');
});
ui.fullscreen.addEventListener('click', async () => {
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
  else await document.exitFullscreen?.();
});

function demoFeatures(now) {
  const pulse = Math.max(0, Math.sin(now * 2.15) - .82) * 2.5;
  return {
    bass: .13 + Math.sin(now * .8) * .04 + pulse * .18,
    mid: .12 + Math.sin(now * .47 + 1) * .035,
    high: .1 + Math.sin(now * 1.35 + 2) * .03,
    energy: .13 + pulse * .12,
    transient: pulse * .65,
    beatStrength: pulse * .72,
    centroid: .46 + Math.sin(now * .16) * .08,
    warmth: .62,
    kick: pulse > .25 ? 1 : 0
  };
}

function textureName(features) {
  if (features.energy < .16) return 'WEIGHTLESS';
  if (features.transient > .62) return 'PERCUSSIVE';
  if (features.centroid > .64) return 'AIRY';
  if (features.warmth > .64) return 'WARM';
  if (features.energy > .7) return 'DENSE';
  return 'LUMINOUS';
}

function drawSpectrum(values, features) {
  const context = ui.spectrum.getContext('2d');
  const width = ui.spectrum.width, height = ui.spectrum.height;
  context.clearRect(0, 0, width, height);
  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, 'rgba(133, 125, 255, .72)');
  gradient.addColorStop(.52, 'rgba(105, 255, 210, .95)');
  gradient.addColorStop(1, 'rgba(255, 184, 228, .72)');
  context.fillStyle = gradient;
  const gap = 3, barWidth = Math.max(2, width / values.length - gap);
  values.forEach((value, index) => {
    const eased = Math.pow(Math.max(.02, value), .72);
    const barHeight = Math.max(2, eased * (height - 8));
    const x = index * (width / values.length);
    context.globalAlpha = .35 + eased * .65;
    context.beginPath();
    context.roundRect(x, (height - barHeight) / 2, barWidth, barHeight, barWidth / 2);
    context.fill();
  });
  context.globalAlpha = .18 + features.energy * .2;
  context.fillRect(0, height / 2, width, 1);
  context.globalAlpha = 1;
}

function directorMessage(section) {
  return {
    INTRO: 'The horizon opens slowly while the forest learns the track.',
    BUILD: 'Energy is gathering. Light, motion and altitude are rising.',
    DROP: 'The biome is blooming at full intensity.',
    BREAK: 'The world exhales: fog deepens and movement retreats.',
    FLOW: 'The environment follows the track’s steady musical current.',
    OUTRO: 'The forest releases the final echoes into the sky.',
    DREAMING: 'The world is breathing on its own. Add music to generate a custom journey.'
  }[section];
}

function animate(nowMs) {
  const now = nowMs / 1000;
  const dt = Math.min(.05, (nowMs - lastFrame) / 1000);
  lastFrame = nowMs;
  const sensitivity = +ui.sensitivity.value / 100;
  const features = audioEngine.loaded ? audioEngine.getFeatures(sensitivity) : demoFeatures(now);
  const section = audioEngine.loaded ? audioEngine.getSection(audioEngine.currentTime) : 'DREAMING';

  if (section !== activeSection) {
    activeSection = section;
    ui.section.textContent = section;
    ui.directorCopy.textContent = directorMessage(section);
    document.body.dataset.section = section.toLowerCase();
    ui.sectionTransition.textContent = section;
    ui.sectionTransition.classList.remove('visible');
    void ui.sectionTransition.offsetWidth;
    ui.sectionTransition.classList.add('visible');
  }
  for (const [name, [bar, value]] of Object.entries(ui.meters)) {
    const amount = Math.max(0, Math.min(1, features[name]));
    bar.style.width = `${amount * 100}%`;
    value.textContent = String(Math.round(amount * 100));
  }
  if (audioEngine.loaded && !isScrubbing) {
    ui.seek.value = String(Math.round((audioEngine.currentTime / Math.max(.01, audioEngine.duration)) * 1000));
    ui.current.textContent = formatTime(audioEngine.currentTime);
  }
  if (audioEngine.loaded) markActiveSegment(audioEngine.currentTime);
  ui.texture.textContent = textureName(features);
  document.documentElement.style.setProperty('--music-energy', Math.min(1, features.energy).toFixed(3));
  document.documentElement.style.setProperty('--music-pulse', Math.min(1, features.beatStrength || 0).toFixed(3));
  if (features.kick) {
    ui.pulseFlash.classList.remove('active');
    void ui.pulseFlash.offsetWidth;
    ui.pulseFlash.classList.add('active');
  }
  if (nowMs - lastSpectrumDraw > 32) {
    const spectrum = audioEngine.loaded ? audioEngine.getSpectrum(42) : Array.from({ length: 42 }, (_, index) => .06 + Math.max(0, Math.sin(now * 1.7 + index * .42)) * .1);
    drawSpectrum(spectrum, features);
    lastSpectrumDraw = nowMs;
  }
  world?.update(dt, now, features, section);
  requestAnimationFrame(animate);
}

if (world) {
  ui.dna.textContent = world.dna;
  requestAnimationFrame(animate);
}
