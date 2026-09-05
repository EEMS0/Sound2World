// Original procedural demo, generated on this device. No third-party audio assets.
export async function createDemoTrack() {
  const rate = 22050,
    duration = 48,
    length = rate * duration,
    samples = new Float32Array(length);
  const notes = [130.81, 155.56, 196, 233.08];
  let noiseSeed = 7321;
  for (let i = 0; i < length; i++) {
    const t = i / rate,
      beat = t % 0.5,
      bar = Math.floor(t / 4) % 4;
    const envelope =
      t < 8
        ? 0.3
        : t < 16
          ? 0.3 + ((t - 8) / 8) * 0.45
          : t < 28
            ? 1
            : t < 36
              ? 0.23
              : t < 44
                ? 1
                : (48 - t) / 4;
    const drums = t >= 8 && !(t >= 28 && t < 34);
    const kick = drums
      ? Math.sin(2 * Math.PI * (46 * beat + 7 * (1 - Math.exp(-beat * 35)))) *
        Math.exp(-beat * 19) *
        0.48
      : 0;
    noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
    const noise = (noiseSeed / 4294967296) * 2 - 1;
    const hat = drums ? noise * Math.exp(-(t % 0.25) * 95) * 0.065 : 0;
    const snare =
      drums && Math.floor(t * 2) % 2 ? noise * Math.exp(-beat * 26) * 0.12 : 0;
    const chord = notes[bar],
      pad =
        (Math.sin(t * chord * 6.283) +
          Math.sin(t * chord * 1.5 * 6.283) * 0.4 +
          Math.sin(t * chord * 1.25 * 6.283) * 0.3) *
        0.09;
    const pluck =
      Math.sin(t * notes[Math.floor(t * 4) % 4] * 2 * 6.283) *
      Math.exp(-(t % 0.25) * 13) *
      0.055;
    samples[i] =
      Math.tanh((kick + hat + snare + pad + pluck) * envelope) *
      Math.min(1, t / 2, (duration - t) / 2);
    if (i % (rate * 6) === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const buffer = new ArrayBuffer(44 + length * 2),
    view = new DataView(buffer);
  const text = (offset, s) => {
    for (let i = 0; i < s.length; i++)
      view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++)
    view.setInt16(
      44 + i * 2,
      Math.max(-1, Math.min(1, samples[i])) * 32767,
      true,
    );
  return new File([buffer], "First Light — Sound2World.wav", {
    type: "audio/wav",
  });
}
