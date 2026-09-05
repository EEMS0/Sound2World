import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { worldDNA, parseDNA, seeded } from "../src/world-dna.js";
import { THEMES } from "../src/theme-system.js";
import { Director } from "../src/director.js";
import { AudioEngine, formatTime } from "../src/audio-engine.js";
import { createDemoTrack } from "../src/demo-track.js";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}

await check("World DNA round-trip preserves every seed bit and theme", () => {
  for (const seed of [0, 1, 0xffffffff, 0x7f920a31])
    for (const theme of THEMES) {
      const identity = worldDNA(seed, theme.code),
        parsed = parseDNA(identity.id, THEMES);
      assert.equal(parsed.seed, seed);
      assert.equal(THEMES[parsed.themeIndex].code, theme.code);
      assert.deepEqual(identity, worldDNA(parsed.seed, theme.code));
    }
  assert.throws(() => parseDNA("SW1-MISSING-12345678", THEMES));
  const a = seeded(22),
    b = seeded(22);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});
await check(
  "Director anticipates, releases, settles, and suppresses seek/drop spam",
  () => {
    const d = new Director();
    let result;
    for (let i = 0; i < 180; i++)
      result = d.update(1 / 60, "BUILD", { next: "DROP", remaining: 2 });
    assert.ok(result.anticipation > 0.5);
    result = d.update(1 / 60, "DROP");
    assert.equal(result.drop, true);
    assert.ok(result.release > 0.9);
    for (let i = 0; i < 60; i++) result = d.update(1 / 60, "DROP");
    assert.equal(result.drop, false);
    d.update(1 / 60, "FLOW");
    assert.equal(d.update(1 / 60, "DROP").drop, false);
    for (let i = 0; i < 600; i++) result = d.update(1 / 60, "BREAK");
    assert.ok(result.release < 0.02);
    assert.ok(result.motion < 0.15);
    assert.equal(d.update(1 / 60, "DROP", { seeking: true }).drop, false);
  },
);

const threeURL = pathToFileURL(
  new URL("../vendor/three/three.module.js", import.meta.url).pathname.replace(
    /^\/([A-Za-z]:)/,
    "$1",
  ),
).href;
const cameraSource = (
  await readFile(new URL("../src/camera-rig.js", import.meta.url), "utf8")
).replace(/from ["']three["']/, `from '${threeURL}'`);
const { CameraRig, canPlantTree } = await import(
  "data:text/javascript;base64," + Buffer.from(cameraSource).toString("base64")
);
const THREE = await import(threeURL);
globalThis.addEventListener = () => {};
await check(
  "Cinematic orbit stays inside the protected canopy boundary at every angle",
  () => {
    const rig = new CameraRig(
      new THREE.PerspectiveCamera(),
      { addEventListener() {} },
      () => 0.2,
    );
    rig.motion = 1;
    const director = { camera: 1, release: 1, anticipation: 1 };
    for (let frame = 0; frame < 60000; frame++) {
      rig.update(1 / 60, frame / 60, {}, director, []);
      assert.ok(
        Math.hypot(rig.camera.position.x, rig.camera.position.z) < 25.3,
      );
      assert.ok(rig.camera.position.y >= 2.9);
    }
    // Actual lobe extent is at most 1.9 times the crown size.
    for (let radius = 0; radius < 90; radius += 0.25)
      for (let width = 2.6; width <= 4.8; width += 0.2) {
        if (canPlantTree(radius, 0, width))
          assert.ok(radius - width * 1.9 > 29.5);
      }
  },
);
await check(
  "Explore collision ejects a camera at a trunk centre; gentle mode stops drift",
  () => {
    const camera = new THREE.PerspectiveCamera(),
      rig = new CameraRig(camera, { addEventListener() {} }, () => 2);
    rig.mode = "explore";
    camera.position.set(4, 3, 4);
    rig.update(0.05, 1, {}, { anticipation: 0, release: 0 }, [
      { x: 4, z: 4, radius: 1.3 },
    ]);
    assert.ok(
      Math.hypot(camera.position.x - 4, camera.position.z - 4) >= 1.2999,
    );
    assert.ok(camera.position.y >= 4.7);
    rig.home();
    rig.motion = 0;
    for (let i = 0; i < 600; i++)
      rig.update(
        1 / 60,
        i / 60,
        {},
        { camera: 1, release: 1, anticipation: 1 },
        [],
      );
    assert.ok(Math.abs(camera.position.x) < 0.001);
    assert.ok(Math.abs(camera.position.z - 21) < 0.001);
  },
);
class FakeAudio extends EventTarget {
  constructor() {
    super();
    this.duration = 48;
    this.currentTime = 0;
    this.paused = true;
  }
  pause() {
    this.paused = true;
  }
  load() {
    queueMicrotask(() => this.dispatchEvent(new Event("loadedmetadata")));
  }
  removeAttribute() {}
}
await check(
  "Audio validation catches empty, oversized, and unsupported files",
  () => {
    const engine = new AudioEngine(new FakeAudio());
    assert.throws(() =>
      engine.validate({ name: "empty.wav", size: 0, type: "audio/wav" }),
    );
    assert.throws(() =>
      engine.validate({
        name: "too-big.wav",
        size: 501 * 1024 * 1024,
        type: "audio/wav",
      }),
    );
    assert.throws(() =>
      engine.validate({ name: "photo.png", size: 100, type: "image/png" }),
    );
    engine.validate({ name: "song.mp3", size: 100, type: "" });
    assert.equal(formatTime(125), "2:05");
  },
);
await check(
  "Rapid audio replacement cannot publish stale analysis or leak object URLs",
  async () => {
    const seen = [],
      engine = new AudioEngine(new FakeAudio(), {
        onAnalysis: (a) => seen.push(a.id),
      });
    engine.analyseFile = async (file) => {
      await new Promise((r) =>
        setTimeout(r, file.name.startsWith("old") ? 40 : 5),
      );
      return { id: file.name, duration: 48, bpm: 120, segments: [] };
    };
    const old = engine
      .loadFile(new File(["valid"], "old.wav", { type: "audio/wav" }))
      .catch((e) => e.name);
    await new Promise((r) => setTimeout(r, 1));
    const latest = engine.loadFile(
      new File(["valid"], "latest.wav", { type: "audio/wav" }),
    );
    await latest;
    assert.equal(await old, "AbortError");
    assert.deepEqual(seen, ["latest.wav"]);
    assert.equal(engine.loaded, true);
    engine.clear();
    assert.equal(engine.objectUrl, null);
    assert.equal(engine.loaded, false);
  },
);
await check(
  "Original demo maps tempo and sections, with restrained fallback when decoding fails",
  async () => {
    const file = await createDemoTrack();
    globalThis.window = {
      OfflineAudioContext: class {
        async decodeAudioData(buffer) {
          const data = new DataView(buffer),
            rate = data.getUint32(24, true),
            count = (buffer.byteLength - 44) / 2,
            channel = new Float32Array(count);
          for (let i = 0; i < count; i++)
            channel[i] = data.getInt16(44 + i * 2, true) / 32768;
          return {
            duration: count / rate,
            sampleRate: rate,
            getChannelData: () => channel,
          };
        }
      },
    };
    const engine = new AudioEngine(new FakeAudio());
    const analysis = await engine.analyseFile(file, () => {});
    assert.ok(
      analysis.bpm >= 118 && analysis.bpm <= 122,
      JSON.stringify(analysis),
    );
    assert.equal(analysis.duration, 48);
    assert.ok(analysis.segments.some((s) => s.label === "BREAK"));
    assert.ok(
      analysis.segments.some((s) => s.label === "DROP" || s.label === "CLIMAX"),
    );
    for (let i = 1; i < analysis.segments.length; i++)
      assert.equal(analysis.segments[i].start, analysis.segments[i - 1].end);
    assert.deepEqual(
      engine.makeFallbackAnalysis(48).segments.map((s) => s.label),
      ["INTRO", "FLOW", "OUTRO"],
    );
    console.log(
      "Demo sections: " +
        analysis.segments
          .map((s) => s.label + " " + s.start + "–" + s.end)
          .join(", "),
    );
  },
);
console.log(`${passed} core regression checks passed.`);
