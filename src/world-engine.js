import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { THEMES, PRESETS } from "./theme-system.js?v=1.0.0";
import { seeded, worldDNA, parseDNA } from "./world-dna.js?v=1.0.0";
import { Director } from "./director.js?v=1.0.0";
import { CameraRig } from "./camera-rig.js?v=1.0.0";
import {
  makeForest,
  makeUnderstory,
  makeStructures,
  makeMountains,
} from "./environment.js?v=1.0.0";
import { ParticleField } from "./particles.js?v=1.0.0";
import { makeSky, makeMoon, makeStars } from "./sky-system.js?v=1.0.0";
import { makeTerrain, updateTerrainColours, makeGrass, makeEnergyPaths } from "./terrain-system.js?v=1.0.0";
import { makeWorldHeart } from "./world-heart.js?v=1.0.0";

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

function radialTexture(size = 128, hardCore = false) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  const centre = size / 2;
  const gradient = context.createRadialGradient(
    centre,
    centre,
    0,
    centre,
    centre,
    centre,
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(hardCore ? 0.16 : 0.05, "rgba(255,255,255,.95)");
  gradient.addColorStop(hardCore ? 0.46 : 0.3, "rgba(255,255,255,.32)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function response(current, target, delta, attack = 0.12, release = 0.55) {
  const seconds = target > current ? attack : release;
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-delta / seconds));
}

export class WorldEngine {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.themeIndex = 0;
    this.seed = Math.floor(Math.random() * 0xffffffff);
    this.random = seeded(this.seed);
    this.cameraMode = "cinematic";
    this.lastKickAt = 0;
    this.section = "DREAMING";
    this.beatEnvelope = 0;
    this.music = {
      bass: 0,
      mid: 0,
      high: 0,
      energy: 0,
      transient: 0,
      beatStrength: 0,
      centroid: 0.4,
      warmth: 0.5,
    };
    this.director = new Director().state;
    this.choreographer = new Director();
    this.preferences = { ...PRESETS.DREAM };
    this.quality = "AUTO";
    this.qualityLevel = "HIGH";
    this.fps = 60;
    this.frameWindow = 0;
    this.frameCount = 0;
    this.slowWindows = 0;
    this.fastWindows = 0;
    this.pointTexture = radialTexture(96);
    this.moonTexture = radialTexture(256, true);
    this.setupRenderer();
    this.setupScene();
    this.rig = new CameraRig(this.camera, this.renderer.domElement, (x, z) =>
      this.heightAt(x, z),
    );
    this.regenerate(false);
    addEventListener("resize", () => this.resize());
  }

  get dna() {
    return worldDNA(this.seed, THEMES[this.themeIndex].code).id;
  }

  get theme() {
    return THEMES[this.themeIndex];
  }
  loadDNA(value) {
    Object.assign(this, parseDNA(value, THEMES));
    this.regenerate(false);
    return this.dna;
  }
  setTheme(index) {
    this.themeIndex = index % THEMES.length;
    this.regenerate(false);
    return this.theme;
  }
  setPreferences(values) {
    Object.assign(this.preferences, values);
    this.rig.motion = this.preferences.camera;
  }
  setQuality(quality) {
    this.quality = quality;
    this.qualityLevel =
      quality === "AUTO" ? (innerWidth < 700 ? "MEDIUM" : "HIGH") : quality;
    this.applyQuality();
  }
  applyQuality() {
    const ratio = { LOW: 0.8, MEDIUM: 1.1, HIGH: 1.6 }[this.qualityLevel];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, ratio));
    this.composer.setPixelRatio(Math.min(devicePixelRatio, ratio));
    this.bloom.enabled = this.qualityLevel !== "LOW";
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.shadowMap.enabled = false;
    this.renderer.info.autoReset = false;
    this.container.append(this.renderer.domElement);
    this.renderer.domElement.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.contextLost = true;
      this.callbacks.onFatal?.();
    });
    this.renderer.domElement.addEventListener("webglcontextrestored", () =>
      location.reload(),
    );
  }

  setupScene() {
    const theme = THEMES[this.themeIndex];
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(theme.sky);
    this.scene.fog = new THREE.FogExp2(theme.fog, 0.0135);
    this.camera = new THREE.PerspectiveCamera(
      66,
      innerWidth / innerHeight,
      0.1,
      460,
    );
    this.camera.position.set(0, 5.6, 21);

    this.hemiLight = new THREE.HemisphereLight(theme.light, 0x020304, 0.92);
    this.scene.add(this.hemiLight);
    this.keyLight = new THREE.DirectionalLight(theme.light, 2.1);
    this.keyLight.position.set(24, 34, 8);
    this.scene.add(this.keyLight);
    this.rimLight = new THREE.PointLight(theme.accent, 26, 65, 1.55);
    this.rimLight.position.set(-18, 13, -18);
    this.scene.add(this.rimLight);

    this.makeSky();
    this.makeMoon();
    this.makeStars();
    this.makeShockwaves();

    this.worldRoot = new THREE.Group();
    this.scene.add(this.worldRoot);
    const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
      type: THREE.HalfFloatType,
      samples: this.renderer.capabilities.isWebGL2 ? 4 : 0,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight),
      0.64,
      0.58,
      0.56,
    );
    this.composer.addPass(this.bloom);
    // Offscreen render targets are linear. Convert exactly once, after bloom.
    this.composer.addPass(
      new ShaderPass({
        uniforms: { tDiffuse: { value: null } },
        vertexShader:
          "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
        fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main(){
          gl_FragColor=texture2D(tDiffuse,vUv);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      }),
    );
  }

  makeSky() { return makeSky.call(this); }
  makeMoon() { return makeMoon.call(this); }
  makeStars() { return makeStars.call(this); }

  makeShockwaves() {
    this.shockwaves = [];
    for (let index = 0; index < 5; index++) {
      const material = new THREE.MeshBasicMaterial({
        color: THEMES[this.themeIndex].accent,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.94, 1, 96),
        material,
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.72;
      // Energy pulses are a luminous overlay: terrain must never erase one side.
      ring.renderOrder = 8;
      ring.visible = false;
      this.scene.add(ring);
      this.shockwaves.push({ ring, age: 99, power: 1 });
    }
  }

  disposeGroup(group) {
    group.traverse((object) => {
      if (object.isInstancedMesh) object.dispose();
      object.geometry?.dispose?.();
      if (Array.isArray(object.material))
        object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
    });
    group.clear();
  }

  regenerate(changeSeed = true) {
    if (changeSeed) this.seed = Math.floor(Math.random() * 0xffffffff);
    this.random = seeded(this.seed);
    this.identity = worldDNA(this.seed, this.theme.code);
    this.disposeGroup(this.worldRoot);
    this.reactiveObjects = [];
    this.mistSprites = [];
    this.energyPaths = [];
    this.colliders = [];
    this.makeTerrain();
    this.makeGrass();
    this.makeEnergyPaths();
    if (this.theme.kind === "forest") makeForest(this, this.theme);
    else {
      this.treeCrownMaterial = null;
      this.foliageUniforms = null;
    }
    makeUnderstory(this, this.theme);
    makeStructures(this, this.theme);
    makeMountains(this, this.theme);
    this.mushroomMaterials = [];
    if (this.theme.kind === "forest") this.makeMushrooms();
    this.makeCrystals();
    this.makeWorldHeart();
    this.makeFireflies();
    this.makeMist();
    this.burstParticles = new ParticleField(
      this.pointTexture,
      this.theme.accent,
      this.random,
    );
    this.worldRoot.add(this.burstParticles.mesh);
    for (const wave of this.shockwaves)
      wave.ring.position.y = this.heightAt(0, 0) + 0.24;
    this.applyTheme();
    this.rig?.home();
    this.cameraMode = "cinematic";
    return this.dna;
  }

  heightAt(x, z) {
    const r = Math.hypot(x, z),
      phase = this.identity?.phase || 0;
    const detail =
      Math.sin(x * 0.19 + phase) * Math.cos(z * 0.15 - phase) * 0.28;
    const ridges =
      Math.sin(x * 0.068 + phase) * Math.cos(z * 0.08) * 2.4 +
      Math.sin((x + z) * 0.035) * 2;
    const clearing = THREE.MathUtils.smoothstep(r, 7, 32);
    const shape =
      this.theme.kind === "shards"
        ? Math.abs(ridges) * 1.8
        : this.theme.kind === "city"
          ? Math.round(ridges) * 0.6
          : ridges;
    return 0.2 + (shape + detail) * clearing * (this.identity?.terrain || 1);
  }

  glowMaterial(color, intensity = 1.15, options = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: options.roughness ?? 0.42,
      metalness: options.metalness ?? 0.04,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1,
    });
  }

  makeTerrain() { return makeTerrain.call(this); }
  updateTerrainColours() { return updateTerrainColours.call(this); }
  makeGrass() { return makeGrass.call(this); }
  makeEnergyPaths() { return makeEnergyPaths.call(this); }

  makeMushrooms() {
    const theme = THEMES[this.themeIndex];
    this.mushroomMaterials = [
      this.glowMaterial(theme.accent, 1.15),
      this.glowMaterial(theme.petal, 1.12),
      this.glowMaterial(theme.sun, 1.05),
    ];
    this.mushroomStemMaterial = new THREE.MeshStandardMaterial({
      color: 0xdad8bd,
      roughness: 0.8,
    });
    const stemGeometry = new THREE.CylinderGeometry(0.11, 0.24, 1.3, 8);
    const capGeometry = new THREE.SphereGeometry(0.82, 16, 8);
    this.mushrooms = new THREE.Group();
    for (let index = 0; index < 72; index++) {
      const radius = 9 + Math.sqrt(this.random()) * 43;
      const angle = this.random() * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const baseScale = 0.35 + this.random() * 0.7;
      const group = new THREE.Group();
      group.position.set(x, this.heightAt(x, z), z);
      group.scale.setScalar(baseScale);
      const stem = new THREE.Mesh(stemGeometry, this.mushroomStemMaterial);
      stem.position.y = 0.64;
      const cap = new THREE.Mesh(
        capGeometry,
        this.mushroomMaterials[index % this.mushroomMaterials.length],
      );
      cap.scale.y = 0.4;
      cap.position.y = 1.32;
      group.add(stem, cap);
      this.mushrooms.add(group);
      this.reactiveObjects.push({
        group,
        cap,
        baseY: group.position.y,
        phase: this.random() * Math.PI * 2,
        kind: "mushroom",
        baseScale,
      });
    }
    this.worldRoot.add(this.mushrooms);
  }

  makeCrystals() {
    const theme = THEMES[this.themeIndex];
    this.crystalMaterial = this.glowMaterial(theme.secondary, 1.42, {
      roughness: 0.22,
      metalness: 0.3,
    });
    const geometry = new THREE.OctahedronGeometry(1, 0);
    this.crystals = new THREE.Group();
    for (let index = 0; index < 34; index++) {
      const radius = 8 + Math.sqrt(this.random()) * 57;
      const angle = this.random() * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const size = 0.35 + this.random() * 0.7;
      const crystal = new THREE.Mesh(geometry, this.crystalMaterial);
      crystal.position.set(x, this.heightAt(x, z) + 0.8 + size, z);
      crystal.scale.set(size, size * (1.65 + this.random() * 1.9), size);
      crystal.rotation.set(
        this.random(),
        this.random() * Math.PI,
        this.random() * 0.4,
      );
      this.crystals.add(crystal);
      this.reactiveObjects.push({
        group: crystal,
        baseY: crystal.position.y,
        phase: this.random() * Math.PI * 2,
        kind: "crystal",
        baseScale: crystal.scale.y,
      });
    }
    this.worldRoot.add(this.crystals);
  }

  makeWorldHeart() { return makeWorldHeart.call(this); }

  makeFireflies() {
    const theme = THEMES[this.themeIndex];
    const positions = [];
    for (let index = 0; index < 1350; index++) {
      const radius = 3 + Math.sqrt(this.random()) * 67;
      const angle = this.random() * Math.PI * 2;
      positions.push(
        Math.cos(angle) * radius,
        1 + this.random() * 20,
        Math.sin(angle) * radius,
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    this.fireflyMaterial = new THREE.PointsMaterial({
      map: this.pointTexture,
      color: theme.accent,
      size: 0.22,
      transparent: true,
      opacity: 0.72,
      alphaTest: 0.01,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.fireflies = new THREE.Points(geometry, this.fireflyMaterial);
    this.worldRoot.add(this.fireflies);
  }

  makeMist() {
    const theme = THEMES[this.themeIndex];
    this.mist = new THREE.Group();
    for (let index = 0; index < 32; index++) {
      const material = new THREE.SpriteMaterial({
        map: this.moonTexture,
        color: theme.fog,
        transparent: true,
        opacity: 0.055,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      const radius = 8 + this.random() * 62;
      const angle = this.random() * Math.PI * 2;
      sprite.position.set(
        Math.cos(angle) * radius,
        0.8 + this.random() * 4,
        Math.sin(angle) * radius,
      );
      const width = 9 + this.random() * 18;
      sprite.scale.set(width, width * (0.18 + this.random() * 0.1), 1);
      this.mist.add(sprite);
      this.mistSprites.push({
        sprite,
        material,
        phase: this.random() * Math.PI * 2,
        baseOpacity: 0.025 + this.random() * 0.045,
      });
    }
    this.worldRoot.add(this.mist);
  }

  toggleCamera() {
    const cinematic = this.rig.toggle();
    this.cameraMode = this.rig.mode;
    return cinematic;
  }

  cycleTheme() {
    return this.setTheme(this.themeIndex + 1);
  }

  applyTheme() {
    const theme = THEMES[this.themeIndex];
    this.scene.background.set(theme.sky);
    this.scene.fog.color.set(theme.fog);
    this.skyMaterial.uniforms.uTop.value.set(theme.sky);
    this.skyMaterial.uniforms.uHorizon.value.set(theme.horizon);
    this.skyMaterial.uniforms.uAura.value.set(theme.accent);
    this.moonMaterial.color.set(theme.moon);
    this.starMaterial.color.set(theme.light);
    this.terrainMaterial?.emissive.set(theme.groundGlow);
    this.updateTerrainColours();
    this.grassMaterial?.uniforms.uColour.value.set(theme.crown);
    this.treeCrownMaterial?.color.set(theme.crown);
    this.treeCrownMaterial?.emissive.set(theme.crown);
    this.fireflyMaterial?.color.set(theme.accent);
    this.crystalMaterial?.color.set(theme.secondary);
    this.crystalMaterial?.emissive.set(theme.secondary);
    this.mushroomMaterials?.forEach((material, index) => {
      const colour = [theme.accent, theme.petal, theme.sun][index];
      material.color.set(colour);
      material.emissive.set(colour);
    });
    this.heartMaterial?.color.set(theme.accent);
    this.heartMaterial?.emissive.set(theme.accent);
    this.heartCoreMaterial?.color.set(theme.sun);
    this.vortexMaterial?.color.set(theme.accent);
    this.heartLight?.color.set(theme.accent);
    this.heartRings?.forEach((ring, index) =>
      ring.material.color.set(index === 1 ? theme.secondary : theme.accent),
    );
    this.energyPaths?.forEach((path, index) =>
      path.material.color.set(index % 3 === 0 ? theme.secondary : theme.accent),
    );
    this.mistSprites?.forEach(({ material }) => material.color.set(theme.fog));
    this.keyLight.color.set(theme.light);
    this.hemiLight.color.set(theme.light);
    this.rimLight.color.set(theme.secondary);
    for (const wave of this.shockwaves)
      wave.ring.material.color.set(theme.accent);
  }

  triggerShockwave(power = 1) {
    const wave = this.shockwaves.reduce((oldest, current) =>
      current.age > oldest.age ? current : oldest,
    );
    wave.age = 0;
    wave.power = power;
    wave.ring.visible = true;
    wave.ring.scale.setScalar(1);
    wave.ring.material.opacity = 0.45 + power * 0.38;
  }

  smoothMusic(delta, features) {
    for (const name of [
      "bass",
      "mid",
      "high",
      "energy",
      "transient",
      "centroid",
      "warmth",
    ]) {
      const target = Number.isFinite(features[name])
        ? features[name]
        : this.music[name];
      this.music[name] = response(
        this.music[name],
        target,
        delta,
        name === "transient" ? 0.035 : 0.09,
        name === "transient" ? 0.24 : 0.48,
      );
    }
    const beat = Number.isFinite(features.beatStrength)
      ? features.beatStrength
      : 0;
    this.beatEnvelope = Math.max(
      this.beatEnvelope * Math.exp(-delta / 0.2),
      beat,
      features.kick ? 1 : 0,
    );
    this.music.beatStrength = this.beatEnvelope;
  }

  update(delta, time, features, section, context = {}) {
    if (this.contextLost) return;
    if (section !== this.section) {
      this.section = section;
    }
    const reacted = { ...features };
    for (const key of ["bass", "mid", "high", "transient", "beatStrength"])
      reacted[key] = clamp((features[key] || 0) * this.preferences.reaction);
    this.smoothMusic(delta, reacted);
    this.director = this.choreographer.update(delta, section, context);
    if (this.director.drop) {
      this.triggerShockwave(this.preferences.drop);
      this.burstParticles.burst(
        1.7 * this.preferences.drop,
        this.heart.position,
        Math.floor(320 * this.preferences.particles),
      );
    }
    const music = this.music;
    if (features.kick && time - this.lastKickAt > 0.17) {
      this.lastKickAt = time;
      if (music.beatStrength > 0.35)
        this.triggerShockwave(0.18 + music.transient * 0.2);
      if (music.high > 0.5)
        this.burstParticles.burst(
          0.5,
          this.heart.position,
          Math.floor(12 * this.preferences.particles),
        );
    }

    const intensity = clamp(
      (music.energy * 0.6 + this.director.intensity * 0.35) *
        this.preferences.intensity,
      0,
      1.3,
    );
    const pulse = clamp(
      this.beatEnvelope * 0.65 +
        this.director.release * this.preferences.drop * 0.55,
      0,
      1.3,
    );
    this.terrainMaterial.emissiveIntensity =
      0.14 + music.bass * 0.18 + intensity * 0.12;
    this.bloom.strength =
      (0.3 +
        music.high * 0.18 +
        this.director.bloom * 0.22 +
        this.director.release * 0.2) *
      this.preferences.bloom;
    this.bloom.radius = 0.48 + music.centroid * 0.2;
    this.keyLight.intensity =
      2.1 + intensity * 0.65 + this.director.release * 0.45;
    this.hemiLight.intensity = 1.2 + intensity * 0.3;
    this.rimLight.intensity =
      15 + music.mid * 24 + this.director.intensity * 16;
    this.scene.fog.density = THREE.MathUtils.lerp(
      this.scene.fog.density,
      (0.009 +
        this.director.fog * 0.003 +
        this.director.anticipation * 0.003 -
        intensity * 0.001) *
        this.preferences.fog,
      1 - Math.exp(-delta / 0.85),
    );
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(
      this.renderer.toneMappingExposure,
      1.02 + intensity * 0.08,
      1 - Math.exp(-delta / 0.7),
    );
    this.terrainUniforms.time.value = time;
    this.terrainUniforms.amplitude.value =
      music.bass * this.preferences.terrain;
    this.terrainUniforms.pulse.value =
      this.director.release * this.preferences.drop;
    if (this.foliageUniforms) {
      this.foliageUniforms.time.value = time;
      this.foliageUniforms.wind.value = 0.025 + music.high * 0.055;
    }
    this.burstParticles.update(delta);

    this.skyMaterial.uniforms.uTime.value = time;
    this.skyMaterial.uniforms.uEnergy.value = intensity;
    this.skyMaterial.uniforms.uPulse.value = pulse;
    this.skyMaterial.uniforms.uHigh.value = music.high;
    this.moonMaterial.opacity =
      0.48 + (1 - intensity) * 0.18 + music.high * 0.16;
    this.moon.scale.setScalar(24 + pulse * 1.4);
    this.stars.rotation.y += delta * (0.0018 + music.high * 0.005);
    this.starMaterial.opacity =
      0.4 + music.high * 0.27 + (1 - intensity) * 0.12;
    this.starMaterial.size = 0.58 + music.transient * 0.28;

    this.grassMaterial.uniforms.uTime.value = time;
    this.grassMaterial.uniforms.uWind.value =
      0.08 + music.high * 0.48 + this.director.motion * 0.27;
    this.grassMaterial.uniforms.uPulse.value = pulse;
    this.fireflies.rotation.y -=
      delta * (0.009 + music.high * 0.065 + this.director.motion * 0.02);
    this.fireflies.position.y = Math.sin(time * 0.22) * 0.18;
    this.fireflyMaterial.size = 0.09 + music.high * 0.08;
    this.fireflyMaterial.opacity = 0.32 + intensity * 0.2;
    this.fireflies.geometry.setDrawRange(
      0,
      Math.floor(
        1350 *
          this.preferences.particles *
          (this.qualityLevel === "LOW" ? 0.5 : 1),
      ),
    );

    for (const path of this.energyPaths) {
      path.material.opacity =
        0.07 +
        music.mid * 0.28 +
        pulse * 0.23 * (0.55 + Math.sin(time * 2.1 + path.phase) * 0.35);
    }
    for (const item of this.reactiveObjects) {
      if (item.kind === "tree") {
        item.group.position.y =
          item.baseY + Math.sin(time * 0.38 + item.phase) * 0.035;
        item.crownGroup.rotation.z =
          Math.sin(time * (0.32 + this.director.motion * 0.16) + item.phase) *
          (0.012 + music.high * 0.026);
        const crownPulse = 1 + music.bass * 0.035 + pulse * 0.025;
        item.crownGroup.scale.set(
          crownPulse,
          1 + music.bass * 0.045 + pulse * 0.035,
          crownPulse,
        );
      } else if (item.kind === "mushroom") {
        item.group.position.y =
          item.baseY + Math.sin(time * 0.5 + item.phase) * 0.045;
        const scale = item.baseScale * (1 + music.bass * 0.11 + pulse * 0.1);
        item.group.scale.set(scale, scale * (1 + music.bass * 0.08), scale);
      } else {
        item.group.position.y =
          item.baseY +
          Math.sin(time * 0.72 + item.phase) * (0.14 + music.mid * 0.12);
        item.group.rotation.y += delta * (0.12 + music.high * 0.72);
      }
    }
    if (this.treeCrownMaterial)
      this.treeCrownMaterial.emissiveIntensity =
        0.08 + intensity * 0.15 + music.mid * 0.06;
    this.crystalMaterial.emissiveIntensity =
      0.5 + music.high * 0.65 + pulse * 0.25;
    this.mushroomMaterials.forEach((material, index) => {
      material.emissiveIntensity =
        0.45 + music.mid * 0.35 + music.high * 0.18 + pulse * 0.15;
    });

    const heartScale =
      1 + music.bass * 0.14 + pulse * 0.18 + this.director.heart * 0.05;
    this.heartShell.scale.setScalar(heartScale);
    this.heartCore.scale.setScalar(1 + pulse * 0.23 + music.mid * 0.1);
    this.heartShell.rotation.x += delta * (0.08 + music.high * 0.18);
    this.heartShell.rotation.y += delta * (0.13 + music.mid * 0.28);
    this.heartMaterial.emissiveIntensity =
      0.32 + this.director.heart * 0.4 + music.mid * 0.25 + pulse * 0.25;
    this.heartCoreMaterial.opacity =
      0.48 + this.director.heart * 0.18 + pulse * 0.12;
    this.heartLight.intensity =
      7 + this.director.heart * 17 + music.energy * 11 + pulse * 11;
    this.heartRings.forEach((ring, index) => {
      ring.rotation.x += delta * (0.08 + index * 0.04) * (index % 2 ? -1 : 1);
      ring.rotation.y +=
        delta *
        (0.12 + music.high * 0.3 + index * 0.035) *
        (index === 1 ? -1 : 1);
      ring.material.opacity = 0.2 + this.director.heart * 0.24 + pulse * 0.13;
      const ringScale = 1 + pulse * (0.04 + index * 0.016);
      ring.scale.setScalar(ringScale);
    });
    this.vortex.rotation.y -=
      delta * (0.12 + this.director.motion * 0.58 + music.high * 0.45);
    this.vortex.rotation.x = Math.sin(time * 0.12) * 0.08;
    this.vortex.scale.setScalar(
      1 - this.director.anticipation * 0.35 + this.director.release * 0.65,
    );
    this.vortexMaterial.size = 0.11 + music.high * 0.14 + pulse * 0.07;
    this.vortexMaterial.opacity =
      0.28 + this.director.heart * 0.34 + music.high * 0.16;

    for (const mist of this.mistSprites) {
      mist.sprite.position.x +=
        Math.sin(time * 0.05 + mist.phase) * delta * 0.04;
      mist.sprite.position.y +=
        Math.sin(time * 0.13 + mist.phase) * delta * 0.018;
      mist.material.opacity =
        mist.baseOpacity *
        (this.director.fog * 0.82 + 0.24) *
        (1 - music.high * 0.28);
    }
    for (const wave of this.shockwaves) {
      if (!wave.ring.visible) continue;
      wave.age += delta;
      const scale = 1 + wave.age * (18 + wave.power * 9);
      wave.ring.scale.setScalar(scale);
      wave.ring.material.opacity = Math.max(
        0,
        (0.09 + wave.power * 0.14) * (1 - wave.age / 1.6),
      );
      if (wave.age > 1.6) wave.ring.visible = false;
    }

    this.updateCamera(delta, time, section);
    this.renderer.info.reset();
    this.composer.render();
    if (this.capture) {
      const capture = this.capture;
      this.capture = null;
      capture();
    }
    this.frameWindow += context.frameDelta || delta;
    this.frameCount++;
    if (this.frameWindow > 3) {
      this.fps = Math.round(this.frameCount / this.frameWindow);
      this.frameWindow = 0;
      this.frameCount = 0;
      if (this.quality === "AUTO" && !document.hidden) {
        this.slowWindows = this.fps < 38 ? this.slowWindows + 1 : 0;
        this.fastWindows = this.fps > 56 ? this.fastWindows + 1 : 0;
        if (this.slowWindows >= 2 && this.qualityLevel !== "LOW") {
          this.qualityLevel = this.qualityLevel === "HIGH" ? "MEDIUM" : "LOW";
          this.applyQuality();
          this.slowWindows = 0;
        }
        if (this.fastWindows >= 8 && this.qualityLevel !== "HIGH") {
          this.qualityLevel = this.qualityLevel === "LOW" ? "MEDIUM" : "HIGH";
          this.applyQuality();
          this.fastWindows = 0;
        }
      }
    }
  }

  updateCamera(delta, time) {
    this.rig.update(delta, time, this.music, this.director, this.colliders);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    this.bloom.resolution.set(innerWidth, innerHeight);
  }
}
