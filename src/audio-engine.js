const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "m4a",
  "aac",
  "ogg",
  "oga",
  "flac",
  "webm",
]);
const clamp = (value, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));
const average = (values) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

export function formatTime(seconds = 0) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${minutes}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, "0")}`;
}

function percentile(values, amount) {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    sorted[
      Math.min(
        sorted.length - 1,
        Math.max(0, Math.floor(sorted.length * amount)),
      )
    ] || 0
  );
}

function waitForMetadata(audio, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("The browser took too long to read this audio file."));
    }, 15000);
    const cleanup = () => {
      clearTimeout(timer);
      audio.removeEventListener("loadedmetadata", success);
      audio.removeEventListener("error", failure);
      signal?.removeEventListener("abort", abort);
    };
    const success = () => {
      cleanup();
      resolve();
    };
    const failure = () => {
      cleanup();
      reject(new Error("This audio format is not supported by your browser."));
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Replaced by another track.", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    audio.addEventListener("loadedmetadata", success, { once: true });
    audio.addEventListener("error", failure, { once: true });
    audio.load();
  });
}

function smoothingAlpha(delta, seconds) {
  return 1 - Math.exp(-delta / Math.max(0.001, seconds));
}

export class AudioEngine {
  constructor(audio, callbacks = {}) {
    this.audio = audio;
    this.callbacks = callbacks;
    this.context = null;
    this.source = null;
    this.analyser = null;
    this.frequencyData = null;
    this.previousSpectrum = null;
    this.objectUrl = null;
    this.analysis = null;
    this.loaded = false;
    this.lastFeatureTime = performance.now() / 1000;
    this.lastKick = 0;
    this.previousBass = 0;
    this.beatEnvelope = 0;
    this.onsetHistory = [];
    this.displaySpectrum = new Float32Array(42);
    this.features = this.emptyFeatures();
    this.bandStates = this.makeBandStates();
    this.loadVersion = 0;
    this.longEnergy = 0;
  }

  get duration() {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
  }
  get currentTime() {
    return this.audio.currentTime || 0;
  }
  set currentTime(value) {
    this.audio.currentTime = Math.max(0, Math.min(this.duration, value));
    this.resetReactiveState();
  }

  emptyFeatures() {
    return {
      bass: 0,
      lowMid: 0,
      mid: 0,
      highMid: 0,
      high: 0,
      energy: 0,
      transient: 0,
      beatStrength: 0,
      beatConfidence: 0,
      dynamicRange: 0,
      energyDelta: 0,
      energyTrend: 0,
      centroid: 0.35,
      warmth: 0.5,
      kick: 0,
    };
  }

  makeBandStates() {
    return Object.fromEntries(
      ["bass", "mid", "high", "transient"].map((name) => [
        name,
        { floor: 0.012, peak: 0.24, value: 0 },
      ]),
    );
  }

  resetReactiveState() {
    this.longEnergy = 0;
    this.lastFeatureTime = performance.now() / 1000;
    this.lastKick = 0;
    this.previousBass = 0;
    this.beatEnvelope = 0;
    this.onsetHistory.length = 0;
    this.features = this.emptyFeatures();
    this.bandStates = this.makeBandStates();
    this.previousSpectrum?.fill(0);
    this.displaySpectrum.fill(0);
  }

  validate(file) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!file.size)
      throw new Error(
        "That file is empty. Choose a music file with audio data.",
      );
    if (file.size > 500 * 1024 * 1024)
      throw new Error("That file is over 500 MB. Choose a smaller audio file.");
    if (!file.type.startsWith("audio/") && !AUDIO_EXTENSIONS.has(extension)) {
      throw new Error("Choose an MP3, WAV, M4A, AAC, OGG or FLAC audio file.");
    }
  }

  async loadFile(file) {
    this.validate(file);
    const version = ++this.loadVersion;
    this.loadController?.abort();
    this.loadController = new AbortController();
    const signal = this.loadController.signal;
    this.audio.pause();
    this.loaded = false;
    this.analysis = null;
    this.resetReactiveState();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.audio.src = this.objectUrl;
    this.callbacks.onStatus?.("Reading audio", 0.08);
    await waitForMetadata(this.audio, signal);
    if (version !== this.loadVersion)
      throw new DOMException("Superseded", "AbortError");

    this.analysis = this.makeFallbackAnalysis(this.duration);
    this.callbacks.onStatus?.("Mapping musical structure", 0.2);
    try {
      const result =
        file.size < 120 * 1024 * 1024
          ? await this.analyseFile(
              file,
              (progress) => {
                if (version === this.loadVersion)
                  this.callbacks.onStatus?.(
                    progress < 0.55 ? "Mapping energy" : "Discovering sections",
                    0.2 + progress * 0.7,
                  );
              },
              signal,
            )
          : this.analysis;
      if (version !== this.loadVersion)
        throw new DOMException("Superseded", "AbortError");
      this.analysis = result;
    } catch (error) {
      if (error.name === "AbortError") throw error;
      this.analysis.approximate = true;
    }
    this.loaded = true;
    this.callbacks.onAnalysis?.(this.analysis);
    this.callbacks.onStatus?.("World ready", 1);
    return {
      name: file.name.replace(/\.[^.]+$/, ""),
      duration: this.duration,
      bpm: this.analysis?.bpm || null,
      typeLabel: (file.name.split(".").pop() || "audio").toUpperCase(),
    };
  }

  async ensureGraph() {
    if (!this.context) {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass)
        throw new Error("Web Audio is not available in this browser.");
      this.context = new AudioContextClass();
      this.source = this.context.createMediaElementSource(this.audio);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.62;
      this.analyser.minDecibels = -92;
      this.analyser.maxDecibels = -12;
      this.source.connect(this.analyser);
      this.analyser.connect(this.context.destination);
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
      this.previousSpectrum = new Float32Array(this.analyser.frequencyBinCount);
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  async togglePlayback() {
    await this.ensureGraph();
    if (this.audio.paused) {
      this.lastFeatureTime = performance.now() / 1000;
      await this.audio.play();
      return true;
    }
    this.audio.pause();
    return false;
  }

  bandAverage(fromHz, toHz) {
    const nyquist = this.context.sampleRate / 2;
    const indexForHz = (hz) =>
      clamp(
        Math.round((hz / nyquist) * this.frequencyData.length),
        0,
        this.frequencyData.length - 1,
      );
    const start = indexForHz(fromHz);
    const end = Math.max(start + 1, indexForHz(toHz));
    let sum = 0;
    let weight = 0;
    for (let index = start; index < end; index++) {
      const value = this.frequencyData[index] / 255;
      const localWeight =
        1 -
        Math.abs((index - (start + end) * 0.5) / Math.max(1, end - start)) *
          0.25;
      sum += value * localWeight;
      weight += localWeight;
    }
    return sum / Math.max(1, weight);
  }

  adaptBand(name, rawValue, delta) {
    const state = this.bandStates[name];
    const floorRate = rawValue < state.floor ? 0.55 : 5.5;
    state.floor += (rawValue - state.floor) * smoothingAlpha(delta, floorRate);
    if (rawValue > state.peak)
      state.peak += (rawValue - state.peak) * smoothingAlpha(delta, 0.055);
    else
      state.peak +=
        (Math.max(0.11, rawValue) - state.peak) * smoothingAlpha(delta, 4.8);
    const usableRange = Math.max(0.075, state.peak - state.floor * 0.68);
    const normalised = clamp((rawValue - state.floor * 0.68) / usableRange);
    const shaped = Math.pow(normalised, 0.78);
    const response = shaped > state.value ? 0.065 : 0.32;
    state.value += (shaped - state.value) * smoothingAlpha(delta, response);
    return clamp(state.value);
  }

  decayFeatures(delta) {
    const decay = Math.exp(-delta / 0.34);
    for (const name of [
      "bass",
      "mid",
      "high",
      "energy",
      "transient",
      "beatStrength",
    ])
      this.features[name] *= decay;
    this.features.kick = 0;
    this.beatEnvelope *= Math.exp(-delta / 0.18);
    for (let index = 0; index < this.displaySpectrum.length; index++)
      this.displaySpectrum[index] *= decay;
    return { ...this.features };
  }

  getFeatures(sensitivity = 1) {
    const now = performance.now() / 1000;
    const delta = clamp(now - this.lastFeatureTime, 1 / 240, 0.12);
    this.lastFeatureTime = now;
    if (!this.analyser || this.audio.paused) return this.decayFeatures(delta);

    this.analyser.getByteFrequencyData(this.frequencyData);
    const bassRaw = clamp(this.bandAverage(34, 190) * sensitivity);
    const midRaw = clamp(this.bandAverage(190, 2800) * sensitivity);
    const highRaw = clamp(
      this.bandAverage(2800, Math.min(15000, this.context.sampleRate * 0.46)) *
        sensitivity,
    );

    let flux = 0;
    let fluxBins = 0;
    let weightedFrequency = 0;
    let spectralMass = 0;
    const nyquist = this.context.sampleRate / 2;
    const minimumBin = Math.max(
      1,
      Math.floor((42 / nyquist) * this.frequencyData.length),
    );
    const maximumBin = Math.min(
      this.frequencyData.length - 1,
      Math.ceil((15000 / nyquist) * this.frequencyData.length),
    );
    for (let index = minimumBin; index <= maximumBin; index++) {
      const value = this.frequencyData[index] / 255;
      flux += Math.max(0, value - this.previousSpectrum[index]);
      this.previousSpectrum[index] = value;
      weightedFrequency += (index / this.frequencyData.length) * value;
      spectralMass += value;
      fluxBins++;
    }
    const fluxRaw = clamp(
      (flux / Math.max(1, fluxBins)) * 10 +
        Math.max(0, bassRaw - this.previousBass) * 1.6,
    );
    this.previousBass = bassRaw;

    const bass = this.adaptBand("bass", bassRaw, delta);
    const mid = this.adaptBand("mid", midRaw, delta);
    const high = this.adaptBand("high", highRaw, delta);
    const transient = this.adaptBand("transient", fluxRaw, delta);
    const targetEnergy = clamp(bass * 0.42 + mid * 0.38 + high * 0.2);
    const energyResponse = targetEnergy > this.features.energy ? 0.085 : 0.48;
    const gate = clamp((bassRaw + midRaw + highRaw) / 0.12);
    const energy =
      this.features.energy +
      (targetEnergy * gate - this.features.energy) *
        smoothingAlpha(delta, energyResponse);
    this.longEnergy += (energy - this.longEnergy) * smoothingAlpha(delta, 5);

    const onset = clamp(bass * 0.62 + transient * 0.38);
    this.onsetHistory.push(onset);
    if (this.onsetHistory.length > 90) this.onsetHistory.shift();
    const history = this.onsetHistory.slice(0, -3);
    const mean = average(history);
    const deviation = Math.sqrt(
      average(history.map((value) => (value - mean) ** 2)),
    );
    const threshold = mean + Math.max(0.055, deviation * 1.2);
    const score = clamp((onset - threshold) / Math.max(0.09, 1 - threshold));
    const kick =
      score > 0.26 && transient > 0.14 && now - this.lastKick > 0.18 ? 1 : 0;
    if (kick) {
      this.lastKick = now;
      this.beatEnvelope = Math.max(this.beatEnvelope, 0.58 + score * 0.42);
    } else {
      this.beatEnvelope *= Math.exp(-delta / 0.16);
    }

    const centroidLinear = spectralMass
      ? weightedFrequency / spectralMass
      : 0.15;
    const centroid = clamp(Math.log2(1 + centroidLinear * 31) / 5);
    const warmth = clamp(0.5 + (bass - high) * 0.52 + (mid - high) * 0.12);
    this.features = {
      bass: bass * gate,
      lowMid: clamp(this.bandAverage(190, 600)) * gate,
      mid: mid * gate,
      highMid: clamp(this.bandAverage(1400, 4000)) * gate,
      high: high * gate,
      energy: clamp(energy),
      transient: Math.max(transient, this.beatEnvelope * 0.55),
      beatStrength: this.beatEnvelope,
      beatConfidence: clamp(score * 0.7 + (this.analysis?.bpm ? 0.2 : 0)),
      dynamicRange: clamp(deviation * 4),
      energyDelta: energy - this.features.energy,
      energyTrend: energy - this.longEnergy,
      centroid,
      warmth,
      kick,
    };
    return { ...this.features };
  }

  getSpectrum(count = 42) {
    if (this.displaySpectrum.length !== count)
      this.displaySpectrum = new Float32Array(count);
    if (!this.frequencyData || !this.context || this.audio.paused)
      return this.displaySpectrum;
    const nyquist = this.context.sampleRate / 2;
    const minimum = 38;
    const maximum = Math.min(16000, nyquist * 0.92);
    for (let group = 0; group < count; group++) {
      const startHz = minimum * Math.pow(maximum / minimum, group / count);
      const endHz = minimum * Math.pow(maximum / minimum, (group + 1) / count);
      const start = clamp(
        Math.floor((startHz / nyquist) * this.frequencyData.length),
        0,
        this.frequencyData.length - 1,
      );
      const end = Math.max(
        start + 1,
        clamp(
          Math.ceil((endHz / nyquist) * this.frequencyData.length),
          1,
          this.frequencyData.length,
        ),
      );
      let sum = 0;
      for (let index = start; index < end; index++)
        sum += this.frequencyData[index] / 255;
      const target = Math.pow(sum / Math.max(1, end - start), 0.72);
      const response = target > this.displaySpectrum[group] ? 0.48 : 0.16;
      this.displaySpectrum[group] +=
        (target - this.displaySpectrum[group]) * response;
    }
    return this.displaySpectrum;
  }

  getSection(time) {
    const segment = this.analysis?.segments.find(
      (item) => time >= item.start && time < item.end,
    );
    return segment?.label || (time >= this.duration - 0.1 ? "OUTRO" : "FLOW");
  }

  getSectionContext(time) {
    const segments = this.analysis?.segments || [];
    const i = segments.findIndex((s) => time >= s.start && time < s.end),
      segment = segments[i];
    return {
      next: segments[i + 1]?.label,
      remaining: segment ? segment.end - time : 0,
      confidence:
        segment?.confidence ?? (this.analysis?.approximate ? 0.25 : 0.65),
    };
  }

  clear() {
    this.loadVersion++;
    this.loadController?.abort();
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.analysis = null;
    this.loaded = false;
    this.resetReactiveState();
  }

  makeFallbackAnalysis(duration) {
    const cuts = [0, 0.1, 0.9, 1];
    const labels = ["INTRO", "FLOW", "OUTRO"];
    return {
      duration,
      bpm: null,
      approximate: true,
      segments: labels.map((label, index) => ({
        label,
        start: cuts[index] * duration,
        end: cuts[index + 1] * duration,
      })),
    };
  }

  estimateTempo(envelope, frameRate) {
    if (envelope.length < frameRate * 5) return null;
    const centre = percentile(envelope, 0.55);
    const onsets = envelope.map((value) => Math.max(0, value - centre));
    let best = { bpm: null, score: 0 };
    const scores = [];
    const minimumLag = Math.max(1, Math.floor((frameRate * 60) / 190));
    const maximumLag = Math.ceil((frameRate * 60) / 70);
    for (let lag = minimumLag; lag <= maximumLag; lag++) {
      const bpm = Math.round((frameRate * 60) / lag);
      let score = 0;
      let energy = 0;
      for (let index = lag; index < onsets.length; index++) {
        score += onsets[index] * onsets[index - lag];
        energy += onsets[index] * onsets[index];
      }
      score /= Math.sqrt(Math.max(0.000001, energy));
      scores.push(score);
      if (score > best.score) best = { bpm, score };
    }
    const typical = percentile(scores, 0.62);
    if (!best.bpm || best.score < typical * 1.08 || best.score < 0.01)
      return null;
    return best.bpm;
  }

  async analyseFile(file, onProgress, signal) {
    const OfflineContext =
      window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const decodeContext = new OfflineContext(1, 1, 44100);
    const audioBuffer = await decodeContext.decodeAudioData(
      await file.arrayBuffer(),
    );
    if (signal?.aborted) throw new DOMException("Superseded", "AbortError");
    const channel = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;

    const energyWindowSeconds = 0.5;
    const energyWindow = Math.max(
      1,
      Math.floor(sampleRate * energyWindowSeconds),
    );
    const energies = [];
    for (
      let start = 0, frame = 0;
      start < channel.length;
      start += energyWindow, frame++
    ) {
      const end = Math.min(channel.length, start + energyWindow);
      const step = Math.max(1, Math.floor((end - start) / 5000));
      let sum = 0;
      let samples = 0;
      for (let index = start; index < end; index += step) {
        sum += channel[index] * channel[index];
        samples++;
      }
      energies.push(Math.sqrt(sum / Math.max(1, samples)));
      if (frame % 24 === 0) {
        if (signal?.aborted) throw new DOMException("Superseded", "AbortError");
        onProgress(Math.min(0.55, (start / channel.length) * 0.55));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const frameSeconds = 0.02;
    const hop = Math.max(1, Math.floor(sampleRate * frameSeconds));
    const onsetEnvelope = [];
    let running = 0;
    let previous = 0;
    for (
      let start = 0, frame = 0;
      start < channel.length;
      start += hop, frame++
    ) {
      const end = Math.min(channel.length, start + hop * 2);
      const step = Math.max(1, Math.floor((end - start) / 320));
      let sum = 0;
      let samples = 0;
      for (let index = start; index < end; index += step) {
        sum += channel[index] * channel[index];
        samples++;
      }
      const rms = Math.sqrt(sum / Math.max(1, samples));
      running = running * 0.93 + rms * 0.07;
      const onset = Math.max(0, rms - previous * 0.7 - running * 0.3);
      onsetEnvelope.push(onset);
      previous = previous * 0.58 + rms * 0.42;
      if (frame % 220 === 0) {
        if (signal?.aborted) throw new DOMException("Superseded", "AbortError");
        onProgress(0.55 + Math.min(0.35, (start / channel.length) * 0.35));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const ceiling = percentile(energies, 0.93) || 1;
    const rawNormalised = energies.map((value) => clamp(value / ceiling));
    const normalised = rawNormalised.map((value, index) => {
      const values = rawNormalised.slice(
        Math.max(0, index - 2),
        Math.min(rawNormalised.length, index + 3),
      );
      return value * 0.52 + average(values) * 0.48;
    });
    const low = percentile(normalised, 0.3);
    const high = percentile(normalised, 0.7);
    const labels = normalised.map((energy, index) => {
      const progress = index / Math.max(1, normalised.length - 1);
      const behind = normalised.slice(Math.max(0, index - 8), index);
      const ahead = normalised.slice(
        index + 1,
        Math.min(normalised.length, index + 6),
      );
      const previousAverage = behind.length ? average(behind) : energy;
      const futureAverage = ahead.length ? average(ahead) : energy;
      const slope = energy - previousAverage;
      if (progress < 0.07) return "INTRO";
      if (progress > 0.925) return "OUTRO";
      if (energy < low * 0.95) return "BREAK";
      if (energy > high && slope > 0.075) return "DROP";
      if (energy > 0.92 && previousAverage > 0.85) return "CLIMAX";
      if (futureAverage > energy + 0.045 || slope > 0.035) return "BUILD";
      return "FLOW";
    });

    const segments = [];
    for (let index = 0; index < labels.length; index++) {
      const label = labels[index];
      const start = index * energyWindowSeconds;
      const last = segments[segments.length - 1];
      if (!last || last.label !== label)
        segments.push({
          label,
          start,
          end: Math.min(duration, start + energyWindowSeconds),
        });
      else last.end = Math.min(duration, start + energyWindowSeconds);
    }
    for (let index = 1; index < segments.length - 1; index++) {
      if (segments[index].end - segments[index].start < 3) {
        segments[index].label =
          segments[index - 1].label === segments[index + 1].label
            ? segments[index - 1].label
            : segments[index + 1].label;
      }
    }
    const merged = [];
    for (const segment of segments) {
      const last = merged[merged.length - 1];
      if (last?.label === segment.label) last.end = segment.end;
      else merged.push({ ...segment });
    }

    const bpm = this.estimateTempo(onsetEnvelope, 1 / frameSeconds);
    onProgress(1);
    return {
      duration,
      bpm,
      segments: merged.length
        ? merged
        : this.makeFallbackAnalysis(duration).segments,
    };
  }
}
