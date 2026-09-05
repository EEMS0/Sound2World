import { AudioEngine, formatTime } from "./audio-engine.js?v=1.0.0";
import { WorldEngine } from "./world-engine.js?v=1.0.0";
import { THEMES, PRESETS } from "./theme-system.js?v=1.0.0";
import { createDemoTrack } from "./demo-track.js?v=1.0.0";

const $ = (id) => document.getElementById(id);
const state = {
  screen: "landing",
  load: 0,
  transition: 0,
  section: "DREAMING",
  seekUntil: 0,
  preset: "DREAM",
  lastUI: 0,
};
let world,
  toastTimer,
  lastFrame = performance.now(),
  worldTime = 0;
const audio = $("audio");
const engine = new AudioEngine(audio, {
  onStatus: updateAnalysis,
  onAnalysis: renderTimeline,
});
try {
  world = new WorldEngine($("world"), {
    onFatal: () => {
      $("fatalError").hidden = false;
    },
  });
  world.setQuality("AUTO");
} catch (error) {
  console.error(error);
  $("fatalError").hidden = false;
}

function toast(message, kind = "info") {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").dataset.kind = kind;
  $("toast").classList.add("visible");
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 4200);
}
function status(message) {
  $("engineStatus").querySelector("span").textContent = message;
}
function screen(name) {
  state.screen = name;
  document.body.dataset.screen = name;
  document.body.classList.remove("hud-hidden");
  for (const value of ["landing", "analysis", "reveal"])
    $(value + "Screen").hidden = value !== name;
  if (world) {
    world.rig.enabled = name === "world";
    if (name !== "world") {
      world.rig.mode = "cinematic";
      world.cameraMode = "cinematic";
    }
  }
  settings(false);
  syncCamera();
  if (name !== "world") {
    $("debugOverlay").hidden = true;
    $("debugToggle").checked = false;
  }
}
function settings(open) {
  $("settingsPanel").hidden = !open;
  $("settingsButton").setAttribute("aria-expanded", String(open));
  if (world) {
    world.rig.enabled = state.screen === "world" && !open;
    world.rig.keys = {};
  }
  if (open) $("closeSettings").focus();
}
function updateAnalysis(message, progress = 0) {
  $("analysisLabel").textContent = message;
  $("analysisPercent").textContent = Math.round(progress * 100) + "%";
  $("analysisProgress").style.width = progress * 100 + "%";
  [...$("analysisStages").children].forEach((li, i) =>
    li.classList.toggle("done", progress > i * 0.25),
  );
}
function renderTimeline(analysis) {
  $("timeline").replaceChildren();
  for (const section of analysis.segments) {
    const item = document.createElement("i");
    item.className = "section-" + section.label.toLowerCase();
    item.style.flex = String(
      (section.end - section.start) / Math.max(0.001, analysis.duration),
    );
    item.dataset.start = section.start;
    item.dataset.end = section.end;
    $("timeline").append(item);
  }
  $("bpmBadge").textContent = analysis.bpm
    ? analysis.bpm + " BPM"
    : "FREE TIME";
}
function syncIdentity() {
  if (!world) return;
  for (const id of ["dna", "revealDNA"]) $(id).textContent = world.dna;
  $("dnaInput").value = world.dna;
  for (const id of ["worldName", "hudWorldName"])
    $(id).textContent = world.identity.name;
  $("themeName").textContent = world.theme.name.toUpperCase();
  $("themeDescription").textContent = $("revealDescription").textContent =
    world.theme.description;
  [...$("themeOptions").children].forEach((button, index) =>
    button.setAttribute("aria-pressed", String(index === world.themeIndex)),
  );
}
function syncCamera() {
  const cinematic = world?.rig.mode === "cinematic";
  $("cameraButton").querySelector("span").textContent = cinematic
    ? "Cinematic"
    : "Explore";
  $("modeHint").textContent = cinematic
    ? "CINEMATIC JOURNEY · PRESS C TO EXPLORE"
    : "DRAG TO LOOK · WASD TO MOVE · SHIFT TO SPRINT · C FOR CINEMATIC";
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function dimension(action) {
  const version = ++state.transition;
  $("dimensionVeil").classList.add("active");
  await delay(470);
  if (version !== state.transition) return;
  try {
    action();
    syncIdentity();
    syncCamera();
  } catch (error) {
    toast(error.message, "error");
  }
  await delay(120);
  if (version === state.transition)
    $("dimensionVeil").classList.remove("active");
}
async function loadFile(file) {
  if (!file) return;
  try {
    engine.validate(file);
  } catch (error) {
    toast(error.message, "error");
    $("fileInput").value = "";
    return;
  }
  const version = ++state.load;
  screen("analysis");
  $("analysisTrack").textContent = file.name;
  status("Listening to the shape of your song");
  updateAnalysis("Reading waveform", 0.02);
  try {
    const info = await engine.loadFile(file);
    if (version !== state.load) return;
    $("trackName").textContent = info.name;
    $("trackDetails").textContent =
      info.typeLabel +
      " · " +
      formatTime(info.duration) +
      " · " +
      (engine.analysis.approximate
        ? "Live interpretation"
        : "Rhythm & energy mapped");
    $("totalTime").textContent = formatTime(info.duration);
    $("currentTime").textContent = "0:00";
    $("seek").disabled = false;
    $("seek").value = "0";
    updateAnalysis("Waking the World Heart", 0.95);
    syncIdentity();
    world?.rig.home();
    await delay(350);
    if (version !== state.load) return;
    updateAnalysis("Your world is ready", 1);
    screen("reveal");
    status("Your world is ready");
  } catch (error) {
    if (error.name === "AbortError" || version !== state.load) return;
    screen("landing");
    status("Try another track");
    toast(
      error.message ||
        "This track could not be opened. Try a different audio format.",
      "error",
    );
  } finally {
    if (version === state.load) $("fileInput").value = "";
  }
}
async function play() {
  if (!engine.loaded) {
    $("fileInput").click();
    return;
  }
  try {
    await engine.togglePlayback();
  } catch (error) {
    toast(error.message || "Tap play again to allow audio.", "error");
  }
}
$("fileInput").addEventListener("change", (event) =>
  loadFile(event.target.files?.[0]),
);
for (const id of ["chooseButton", "replaceButton"])
  $(id).onclick = () => $("fileInput").click();
$("demoButton").onclick = async () => {
  $("demoButton").disabled = true;
  const version = state.load;
  try {
    const file = await createDemoTrack();
    if (version === state.load) await loadFile(file);
  } catch {
    toast("The demo could not start. You can still choose a track.", "error");
  } finally {
    $("demoButton").disabled = false;
  }
};
$("cancelAnalysis").onclick = () => {
  state.load++;
  engine.clear();
  screen("landing");
  status("A world is waiting");
};
$("enterButton").onclick = () => {
  screen("world");
  play();
};
$("exploreDemo").onclick = () => {
  screen("world");
  world?.rig.home();
  syncCamera();
  status("The world is dreaming");
};
$("homeButton").onclick = () => {
  state.load++;
  engine.loadController?.abort();
  audio.pause();
  screen("landing");
  status("A world is waiting");
};
$("playButton").onclick = play;
audio.addEventListener("play", () => {
  $("playButton").textContent = "Ⅱ";
  $("playButton").setAttribute("aria-label", "Pause");
  status("The Heart is listening");
});
audio.addEventListener("pause", () => {
  $("playButton").textContent = "▶";
  $("playButton").setAttribute("aria-label", "Play");
  status("Paused · take your time");
});
audio.addEventListener("ended", () => {
  status("Journey complete");
  toast("Every song opens another world. Try a new track.");
});
audio.addEventListener("error", () => {
  if (engine.loaded)
    toast("Playback was interrupted. Please choose the track again.", "error");
});
$("seek").oninput = () => {
  if (engine.loaded) {
    engine.currentTime = (+$("seek").value / 1000) * engine.duration;
    state.seekUntil = performance.now() + 900;
  }
};
$("restartButton").onclick = () => {
  if (engine.loaded) {
    engine.currentTime = 0;
    state.seekUntil = performance.now() + 900;
  }
};
$("volume").oninput = () => {
  audio.volume = +$("volume").value / 100;
  audio.muted = false;
  syncMute();
};
audio.volume = 0.75;
function syncMute() {
  $("muteButton").textContent = audio.muted ? "∅" : "♫";
  $("muteButton").setAttribute("aria-label", audio.muted ? "Unmute" : "Mute");
}
$("muteButton").onclick = () => {
  audio.muted = !audio.muted;
  syncMute();
};
$("settingsButton").onclick = () => settings($("settingsPanel").hidden);
$("closeSettings").onclick = () => {
  settings(false);
  $("settingsButton").focus();
};
$("cameraButton").onclick = () => {
  world?.toggleCamera();
  syncCamera();
};
$("returnHeart").onclick = () => {
  world?.rig.home();
  syncCamera();
  toast("Back at the Heart.");
};
$("snapshotButton").onclick = () => {
  if (!world) return;
  world.capture = () =>
    world.renderer.domElement.toBlob((blob) => {
      if (!blob) {
        toast("The snapshot could not be saved.", "error");
        return;
      }
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = "Sound2World-" + world.dna + ".png";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast("World snapshot saved.");
    }, "image/png");
};
$("immersiveButton").onclick = () => {
  document.body.classList.toggle("hud-hidden");
  settings(false);
};
$("fullscreenButton").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast("Fullscreen is unavailable in this window.");
  }
};
$("howButton").onclick = () => $("howDialog").showModal();
$("closeHow").onclick = () => $("howDialog").close();
$("regenerateButton").onclick = () => dimension(() => world?.regenerate());
$("loadDNA").onclick = () => {
  const value = $("dnaInput").value;
  dimension(() => world?.loadDNA(value));
};
$("copyDNA").onclick = async () => {
  try {
    await navigator.clipboard.writeText(world.dna);
    toast("World DNA copied. Keep it to return here.");
  } catch {
    settings(true);
    $("dnaInput").select();
    toast("Select and copy the World DNA.");
  }
};
THEMES.forEach((theme, index) => {
  const button = document.createElement("button");
  button.className = "theme-option";
  button.textContent = theme.name;
  button.style.setProperty(
    "--theme-color",
    "#" + theme.accent.toString(16).padStart(6, "0"),
  );
  button.onclick = () => dimension(() => world?.setTheme(index));
  $("themeOptions").append(button);
});
const controls = [
  ["intensity", "World intensity", 150],
  ["reaction", "Reaction strength", 150],
  ["terrain", "Terrain motion", 100],
  ["particles", "Particle density", 100],
  ["bloom", "Glow", 120],
  ["camera", "Camera motion", 100],
  ["fog", "Atmosphere", 150],
  ["drop", "Drop intensity", 150],
];
controls.forEach(([key, label, max]) => {
  const wrapper = document.createElement("label"),
    text = document.createElement("span"),
    output = document.createElement("output"),
    input = document.createElement("input");
  text.textContent = label;
  input.type = "range";
  input.min = 0;
  input.max = max;
  input.id = "control-" + key;
  input.value = PRESETS.DREAM[key] * 100;
  output.value = Math.round(+input.value) + "%";
  output.htmlFor = input.id;
  input.oninput = () => {
    output.value = input.value + "%";
    world?.setPreferences({ [key]: +input.value / 100 });
    state.preset = "CUSTOM";
    markPreset();
    if (key === "camera") $("gentleMotion").checked = false;
  };
  wrapper.append(text, output, input);
  $("reactionControls").append(wrapper);
});
Object.keys(PRESETS).forEach((name) => {
  const button = document.createElement("button");
  button.textContent = name;
  button.onclick = () => setPreset(name);
  $("presetOptions").append(button);
});
function markPreset() {
  [...$("presetOptions").children].forEach((button) =>
    button.setAttribute(
      "aria-pressed",
      String(button.textContent === state.preset),
    ),
  );
}
function setPreset(name) {
  state.preset = name;
  world?.setPreferences(PRESETS[name]);
  markPreset();
  controls.forEach(([key]) => {
    const input = $("control-" + key);
    input.value = PRESETS[name][key] * 100;
    input.previousElementSibling.value = Math.round(+input.value) + "%";
  });
  $("gentleMotion").checked = false;
}
$("gentleMotion").checked = matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
$("gentleMotion").onchange = () => {
  world?.setPreferences({
    camera: $("gentleMotion").checked ? 0 : +$("control-camera").value / 100,
  });
};
if ($("gentleMotion").checked) world?.setPreferences({ camera: 0 });
$("quality").onchange = () => world?.setQuality($("quality").value);
$("debugToggle").onchange = () => {
  $("debugOverlay").hidden = !$("debugToggle").checked;
};
let dragDepth = 0;
document.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer?.types.includes("Files")) return;
  e.preventDefault();
  dragDepth++;
  $("dropOverlay").hidden = false;
});
document.addEventListener("dragover", (e) => {
  if (e.dataTransfer?.types.includes("Files")) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
});
document.addEventListener("dragleave", (e) => {
  e.preventDefault();
  if (--dragDepth <= 0) {
    dragDepth = 0;
    $("dropOverlay").hidden = true;
  }
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  $("dropOverlay").hidden = true;
  loadFile(e.dataTransfer?.files?.[0]);
});
addEventListener("keydown", (e) => {
  if (
    /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName) ||
    $("howDialog").open
  )
    return;
  if (e.code === "Escape") {
    settings(false);
    document.body.classList.remove("hud-hidden");
  }
  if (state.screen !== "world") return;
  if (e.code === "Space") {
    e.preventDefault();
    play();
  }
  if (e.code === "KeyC") {
    $("cameraButton").click();
  }
  if (e.code === "KeyH") {
    $("immersiveButton").click();
  }
});
function dreaming(t) {
  const pulse = Math.pow(Math.max(0, Math.sin(t * 1.6)), 18) * 0.13;
  return {
    bass: 0.12 + pulse,
    mid: 0.13,
    high: 0.09,
    energy: 0.12,
    transient: pulse,
    beatStrength: pulse,
    centroid: 0.4,
    warmth: 0.65,
    kick: 0,
  };
}
function drawSignal(features) {
  const canvas = $("spectrumCanvas"),
    ctx = canvas.getContext("2d"),
    values = engine.getSpectrum(40);
  ctx.clearRect(0, 0, 320, 60);
  ctx.fillStyle = "#b6e4cd";
  values.forEach((v, i) => {
    ctx.globalAlpha = 0.3 + v * 0.7;
    ctx.fillRect(i * 8, 30 - v * 26, 3, Math.max(2, v * 52));
  });
  ctx.globalAlpha = 1;
}
function animate(now) {
  const frameDelta = Math.min(0.5, (now - lastFrame) / 1000),
    dt = Math.min(0.05, frameDelta);
  lastFrame = now;
  worldTime += dt;
  const features = engine.loaded ? engine.getFeatures() : dreaming(worldTime);
  const section = engine.loaded
    ? engine.getSection(engine.currentTime)
    : "DREAMING";
  const context = engine.loaded
    ? engine.getSectionContext(engine.currentTime)
    : {};
  context.seeking = now < state.seekUntil || audio.paused;
  context.frameDelta = frameDelta;
  world?.update(dt, worldTime, features, section, context);
  // Keep the Heart visible beside the opening copy, then centre it for the journey.
  if (world && state.screen === "landing" && innerWidth > 650) {
    world.camera.setViewOffset(
      innerWidth,
      innerHeight,
      -innerWidth * 0.16,
      0,
      innerWidth,
      innerHeight,
    );
  } else if (world?.camera.view?.enabled) world.camera.clearViewOffset();
  if (now - state.lastUI > 100) {
    if (section !== state.section) {
      state.section = section;
      $("sectionName").textContent = section;
      document.body.dataset.section = section.toLowerCase();
      if (state.screen === "world" && !audio.paused) {
        $("sectionTransition").textContent = section;
        $("sectionTransition").classList.remove("visible");
        void $("sectionTransition").offsetWidth;
        $("sectionTransition").classList.add("visible");
      }
    }
    $("currentTime").textContent = formatTime(engine.currentTime);
    if (engine.loaded)
      $("seek").value = Math.round(
        (engine.currentTime / Math.max(0.001, engine.duration)) * 1000,
      );
    for (const item of $("timeline").children)
      item.classList.toggle(
        "active",
        engine.currentTime >= +item.dataset.start &&
          engine.currentTime < +item.dataset.end,
      );
    $("textureName").textContent =
      features.energy > 0.7
        ? "AWAKENED"
        : features.energy > 0.25
          ? "LISTENING"
          : "BREATHING";
    if (!$("settingsPanel").hidden) {
      drawSignal(features);
      $("qualityReadout").textContent =
        (world?.fps || 0) +
        " FPS · " +
        world?.qualityLevel.toLowerCase() +
        " quality";
    }
    if (!$("debugOverlay").hidden)
      $("debugOverlay").textContent =
        "FPS " +
        world.fps +
        " · " +
        world.qualityLevel +
        "\n" +
        section +
        " · confidence " +
        Math.round((context.confidence || 0) * 100) +
        "%\nBASS " +
        features.bass.toFixed(2) +
        "  MID " +
        features.mid.toFixed(2) +
        "  HIGH " +
        features.high.toFixed(2) +
        "\nENERGY " +
        features.energy.toFixed(2) +
        "  BEAT " +
        features.beatStrength.toFixed(2) +
        "\nDRAW CALLS " +
        world.renderer.info.render.calls +
        "\n" +
        world.dna;
    state.lastUI = now;
  }
  requestAnimationFrame(animate);
}
syncIdentity();
markPreset();
screen("landing");
if (world) requestAnimationFrame(animate);
// Read-only diagnostics and explicit test hooks exist only on localhost with ?qa=1.
if (
  location.hostname === "127.0.0.1" &&
  new URLSearchParams(location.search).has("qa")
)
  window.s2w = { world, engine, state, loadFile, screen };
