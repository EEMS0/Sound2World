const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'webm']);

export function formatTime(seconds = 0) {
  if (!Number.isFinite(seconds)) return '0:00';
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${minutes}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
}

function percentile(values, amount) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * amount)))] || 0;
}

function median(values) {
  return percentile(values, .5);
}

function waitForMetadata(audio) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The browser took too long to read this audio file.')), 15000);
    const cleanup = () => {
      clearTimeout(timer);
      audio.removeEventListener('loadedmetadata', success);
      audio.removeEventListener('error', failure);
    };
    const success = () => { cleanup(); resolve(); };
    const failure = () => { cleanup(); reject(new Error('This audio format is not supported by your browser.')); };
    audio.addEventListener('loadedmetadata', success, { once: true });
    audio.addEventListener('error', failure, { once: true });
    audio.load();
  });
}

export class AudioEngine {
  constructor(audio, callbacks = {}) {
    this.audio = audio;
    this.callbacks = callbacks;
    this.context = null;
    this.source = null;
    this.analyser = null;
    this.frequencyData = null;
    this.objectUrl = null;
    this.analysis = null;
    this.loaded = false;
    this.bassBaseline = .12;
    this.lastKick = 0;
  }

  get duration() { return Number.isFinite(this.audio.duration) ? this.audio.duration : 0; }
  get currentTime() { return this.audio.currentTime || 0; }
  set currentTime(value) { this.audio.currentTime = Math.max(0, Math.min(this.duration, value)); }

  validate(file) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!file.size) throw new Error('That file is empty. Choose a music file with audio data.');
    if (file.size > 500 * 1024 * 1024) throw new Error('That file is over 500 MB. Choose a smaller audio file.');
    if (!file.type.startsWith('audio/') && !AUDIO_EXTENSIONS.has(extension)) {
      throw new Error('Choose an MP3, WAV, M4A, AAC, OGG or FLAC audio file.');
    }
  }

  async loadFile(file) {
    this.validate(file);
    this.audio.pause();
    this.loaded = false;
    this.analysis = null;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.audio.src = this.objectUrl;
    this.callbacks.onStatus?.('Reading audio', .08);
    await waitForMetadata(this.audio);
    this.loaded = true;

    const fallback = this.makeFallbackAnalysis(this.duration);
    this.analysis = fallback;
    this.callbacks.onStatus?.('Mapping musical structure', .2);
    try {
      this.analysis = await this.analyseFile(file, (progress) => this.callbacks.onStatus?.('Mapping musical structure', .2 + progress * .75));
    } catch (error) {
      console.warn('Detailed analysis unavailable; using duration-based director.', error);
    }
    this.callbacks.onAnalysis?.(this.analysis);
    this.callbacks.onStatus?.('World ready', 1);
    return {
      name: file.name.replace(/\.[^.]+$/, ''),
      duration: this.duration,
      typeLabel: (file.name.split('.').pop() || 'audio').toUpperCase()
    };
  }

  async ensureGraph() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('Web Audio is not available in this browser.');
      this.context = new AudioContextClass();
      this.source = this.context.createMediaElementSource(this.audio);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = .78;
      this.source.connect(this.analyser);
      this.analyser.connect(this.context.destination);
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  async togglePlayback() {
    await this.ensureGraph();
    if (this.audio.paused) {
      await this.audio.play();
      return true;
    }
    this.audio.pause();
    return false;
  }

  getFeatures(sensitivity = 1) {
    if (!this.analyser || this.audio.paused) return { bass: 0, mid: 0, high: 0, energy: 0, kick: 0 };
    this.analyser.getByteFrequencyData(this.frequencyData);
    const nyquist = this.context.sampleRate / 2;
    const indexForHz = (hz) => Math.max(0, Math.min(this.frequencyData.length - 1, Math.round((hz / nyquist) * this.frequencyData.length)));
    const averageBand = (fromHz, toHz) => {
      const start = indexForHz(fromHz), end = Math.max(start + 1, indexForHz(toHz));
      let sum = 0;
      for (let index = start; index < end; index++) sum += this.frequencyData[index];
      return (sum / ((end - start) * 255)) * sensitivity;
    };
    const bass = Math.min(1, averageBand(32, 180));
    const mid = Math.min(1, averageBand(180, 2600));
    const high = Math.min(1, averageBand(2600, 12000));
    const energy = Math.min(1, bass * .48 + mid * .34 + high * .18);
    this.bassBaseline = this.bassBaseline * .965 + bass * .035;
    const now = performance.now() / 1000;
    const kick = bass > this.bassBaseline * 1.32 + .045 && now - this.lastKick > .22 ? 1 : 0;
    if (kick) this.lastKick = now;
    return { bass, mid, high, energy, kick };
  }

  getSection(time) {
    const segment = this.analysis?.segments.find((item) => time >= item.start && time < item.end);
    return segment?.label || (time >= this.duration - .1 ? 'OUTRO' : 'FLOW');
  }

  clear() {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.analysis = null;
    this.loaded = false;
  }

  makeFallbackAnalysis(duration) {
    const cuts = [0, .1, .3, .55, .73, .9, 1];
    const labels = ['INTRO', 'BUILD', 'DROP', 'BREAK', 'FLOW', 'OUTRO'];
    return {
      duration,
      bpm: null,
      segments: labels.map((label, index) => ({ label, start: cuts[index] * duration, end: cuts[index + 1] * duration }))
    };
  }

  async analyseFile(file, onProgress) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const decodeContext = new AudioContextClass();
    const audioBuffer = await decodeContext.decodeAudioData(await file.arrayBuffer());
    const channel = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const windowSeconds = .5;
    const windowSize = Math.max(1, Math.floor(sampleRate * windowSeconds));
    const energies = [];
    const transients = [];
    let previous = 0;
    for (let start = 0, frame = 0; start < channel.length; start += windowSize, frame++) {
      let sum = 0;
      const end = Math.min(channel.length, start + windowSize);
      const step = Math.max(1, Math.floor((end - start) / 6000));
      let samples = 0;
      for (let index = start; index < end; index += step) { sum += channel[index] * channel[index]; samples++; }
      const rms = Math.sqrt(sum / Math.max(1, samples));
      energies.push(rms);
      transients.push(Math.max(0, rms - previous));
      previous = previous * .55 + rms * .45;
      if (frame % 20 === 0) {
        onProgress(Math.min(.9, start / channel.length));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    await decodeContext.close();

    const ceiling = percentile(energies, .93) || 1;
    const normalised = energies.map((value) => Math.min(1, value / ceiling));
    const low = percentile(normalised, .3), high = percentile(normalised, .68);
    const labels = normalised.map((energy, index) => {
      const progress = index / Math.max(1, normalised.length - 1);
      const behind = normalised.slice(Math.max(0, index - 8), index);
      const previousAverage = behind.length ? behind.reduce((a, b) => a + b, 0) / behind.length : energy;
      const slope = energy - previousAverage;
      if (progress < .075) return 'INTRO';
      if (progress > .92) return 'OUTRO';
      if (energy < low * .94) return 'BREAK';
      if (energy > high && (slope > .055 || energy > .9)) return 'DROP';
      if (slope > .04 || (energy > low && energy < high && normalised[Math.min(index + 4, normalised.length - 1)] > energy + .05)) return 'BUILD';
      return 'FLOW';
    });
    const segments = [];
    for (let index = 0; index < labels.length; index++) {
      const label = labels[index];
      const start = index * windowSeconds;
      const last = segments[segments.length - 1];
      if (!last || last.label !== label) segments.push({ label, start, end: Math.min(audioBuffer.duration, start + windowSeconds) });
      else last.end = Math.min(audioBuffer.duration, start + windowSeconds);
    }
    for (let index = 1; index < segments.length - 1; index++) {
      if (segments[index].end - segments[index].start < 1.5) {
        segments[index].label = segments[index - 1].label === segments[index + 1].label ? segments[index - 1].label : segments[index + 1].label;
      }
    }
    const merged = [];
    for (const segment of segments) {
      const last = merged[merged.length - 1];
      if (last?.label === segment.label) last.end = segment.end;
      else merged.push({ ...segment });
    }
    const transientCutoff = percentile(transients, .82);
    const peakTimes = transients.map((value, index) => ({ value, time: index * windowSeconds })).filter((peak) => peak.value >= transientCutoff).map((peak) => peak.time);
    const intervals = peakTimes.slice(1).map((time, index) => time - peakTimes[index]).filter((gap) => gap >= .3 && gap <= 1);
    let bpm = intervals.length ? Math.round(60 / median(intervals)) : null;
    if (bpm && bpm < 80) bpm *= 2;
    if (bpm && bpm > 190) bpm = Math.round(bpm / 2);
    onProgress(1);
    return { duration: audioBuffer.duration, bpm, segments: merged.length ? merged : this.makeFallbackAnalysis(audioBuffer.duration).segments };
  }
}
