import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const THEMES = [
  { name: 'Moss', code: 'MOSS', sky: 0x061311, fog: 0x071714, ground: 0x12302a, groundGlow: 0x073129, crown: 0x34d399, accent: 0x9affdb, light: 0xb6ffe7 },
  { name: 'Aurora', code: 'AURA', sky: 0x07091d, fog: 0x0a0d2c, ground: 0x161b45, groundGlow: 0x151861, crown: 0x6574ff, accent: 0xc390ff, light: 0xb6c4ff },
  { name: 'Ember', code: 'EMBER', sky: 0x170705, fog: 0x210907, ground: 0x3a1711, groundGlow: 0x5c1208, crown: 0xff6648, accent: 0xffc062, light: 0xffd29c }
];

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let number = value;
    number = Math.imul(number ^ number >>> 15, number | 1);
    number ^= number + Math.imul(number ^ number >>> 7, number | 61);
    return ((number ^ number >>> 14) >>> 0) / 4294967296;
  };
}

export class WorldEngine {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.themeIndex = 0;
    this.seed = Math.floor(Math.random() * 0xffffffff);
    this.random = seeded(this.seed);
    this.cameraMode = 'explore';
    this.keys = {};
    this.yaw = 0;
    this.pitch = -.1;
    this.dragging = false;
    this.lastKickAt = 0;
    this.section = 'DREAMING';
    this.sectionPulse = 0;
    this.setupRenderer();
    this.setupScene();
    this.bindControls();
    this.regenerate(false);
    addEventListener('resize', () => this.resize());
  }

  get dna() { return `SW3:${THEMES[this.themeIndex].code}-${this.seed.toString(16).toUpperCase().padStart(8, '0').slice(0, 6)}`; }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.append(this.renderer.domElement);
  }

  setupScene() {
    const theme = THEMES[this.themeIndex];
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(theme.sky);
    this.scene.fog = new THREE.FogExp2(theme.fog, .013);
    this.camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, .1, 450);
    this.camera.position.set(0, 4.2, 14);
    this.scene.add(new THREE.HemisphereLight(theme.light, 0x030405, 1.15));
    this.keyLight = new THREE.DirectionalLight(theme.light, 2.3);
    this.keyLight.position.set(24, 34, 8);
    this.scene.add(this.keyLight);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .78, .7, .5);
    this.composer.addPass(this.bloom);
    this.worldRoot = new THREE.Group();
    this.scene.add(this.worldRoot);
    this.makeStars();
    this.makeShockwaves();
  }

  disposeGroup(group) {
    group.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
    });
    group.clear();
  }

  regenerate(changeSeed = true) {
    if (changeSeed) this.seed = Math.floor(Math.random() * 0xffffffff);
    this.random = seeded(this.seed);
    this.disposeGroup(this.worldRoot);
    this.reactiveObjects = [];
    this.makeTerrain();
    this.makeForest();
    this.makeMushrooms();
    this.makeCrystals();
    this.makeFireflies();
    this.applyTheme();
    return this.dna;
  }

  heightAt(x, z) {
    return Math.sin(x * .105) * .72 + Math.cos(z * .09) * .58 + Math.sin((x + z) * .038) * 1.38 + Math.sin(Math.hypot(x, z) * .12) * .3;
  }

  glowMaterial(color, intensity = 1.15) {
    return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: .42, metalness: .04 });
  }

  makeTerrain() {
    const theme = THEMES[this.themeIndex];
    const geometry = new THREE.PlaneGeometry(180, 180, 110, 110);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index), z = positions.getZ(index);
      positions.setY(index, this.heightAt(x, z));
    }
    geometry.computeVertexNormals();
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      color: theme.ground, roughness: .91, metalness: .08, emissive: theme.groundGlow, emissiveIntensity: .42
    });
    this.terrain = new THREE.Mesh(geometry, this.terrainMaterial);
    this.worldRoot.add(this.terrain);
  }

  makeForest() {
    const theme = THEMES[this.themeIndex];
    for (let index = 0; index < 82; index++) {
      const x = (this.random() - .5) * 105, z = (this.random() - .5) * 105;
      if (Math.hypot(x, z) < 9 || Math.hypot(x, z - 14) < 8) continue;
      const height = 4 + this.random() * 8;
      const group = new THREE.Group();
      group.position.set(x, this.heightAt(x, z), z);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.16, .42, height, 7), new THREE.MeshStandardMaterial({ color: 0x172420, roughness: 1 }));
      trunk.position.y = height / 2;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(2 + this.random() * 2.2, 5 + this.random() * 4, 9), this.glowMaterial(theme.crown, .72));
      crown.position.y = height + .9;
      crown.scale.y = .82;
      group.add(trunk, crown);
      this.worldRoot.add(group);
      this.reactiveObjects.push({ group, crown, baseY: group.position.y, phase: this.random() * Math.PI * 2, kind: 'tree' });
    }
  }

  makeMushrooms() {
    const theme = THEMES[this.themeIndex];
    this.mushrooms = new THREE.Group();
    for (let index = 0; index < 58; index++) {
      const x = (this.random() - .5) * 74, z = (this.random() - .5) * 74;
      const scale = .55 + this.random() * .85;
      const group = new THREE.Group();
      group.position.set(x, this.heightAt(x, z), z);
      group.scale.setScalar(scale);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.11, .24, 1.3, 8), new THREE.MeshStandardMaterial({ color: 0xdad8bd, roughness: .8 }));
      stem.position.y = .64;
      const capColor = index % 3 === 0 ? theme.accent : (index % 2 ? 0xff72bd : 0xffc667);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(.82, 14, 7), this.glowMaterial(capColor, 1.08));
      cap.scale.y = .4;
      cap.position.y = 1.32;
      group.add(stem, cap);
      this.mushrooms.add(group);
      this.reactiveObjects.push({ group, crown: cap, baseY: group.position.y, phase: this.random() * Math.PI * 2, kind: 'mushroom', baseScale: scale });
    }
    this.worldRoot.add(this.mushrooms);
  }

  makeCrystals() {
    const theme = THEMES[this.themeIndex];
    this.crystals = new THREE.Group();
    for (let index = 0; index < 28; index++) {
      const x = (this.random() - .5) * 90, z = (this.random() - .5) * 90;
      if (Math.hypot(x, z) < 7) continue;
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(.45 + this.random() * .7, 0), this.glowMaterial(theme.accent, 1.4));
      crystal.position.set(x, this.heightAt(x, z) + 1.1, z);
      crystal.scale.y = 1.5 + this.random() * 2;
      crystal.rotation.set(this.random(), this.random() * Math.PI, this.random() * .4);
      this.crystals.add(crystal);
      this.reactiveObjects.push({ group: crystal, crown: crystal, baseY: crystal.position.y, phase: this.random() * Math.PI * 2, kind: 'crystal', baseScale: crystal.scale.y });
    }
    this.worldRoot.add(this.crystals);
  }

  makeFireflies() {
    const theme = THEMES[this.themeIndex];
    const positions = [];
    for (let index = 0; index < 950; index++) positions.push((this.random() - .5) * 90, 1 + this.random() * 18, (this.random() - .5) * 90);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.fireflyMaterial = new THREE.PointsMaterial({ color: theme.accent, size: .15, transparent: true, opacity: .82, depthWrite: false, blending: THREE.AdditiveBlending });
    this.fireflies = new THREE.Points(geometry, this.fireflyMaterial);
    this.worldRoot.add(this.fireflies);
  }

  makeStars() {
    const positions = [];
    for (let index = 0; index < 700; index++) {
      const radius = 90 + Math.random() * 100, angle = Math.random() * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, 25 + Math.random() * 85, Math.sin(angle) * radius);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xc7fff0, size: .35, transparent: true, opacity: .65, depthWrite: false }));
    this.scene.add(this.stars);
  }

  makeShockwaves() {
    this.shockwaves = [];
    for (let index = 0; index < 4; index++) {
      const material = new THREE.MeshBasicMaterial({ color: THEMES[this.themeIndex].accent, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const ring = new THREE.Mesh(new THREE.RingGeometry(.93, 1, 64), material);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = .15;
      ring.visible = false;
      this.scene.add(ring);
      this.shockwaves.push({ ring, age: 99 });
    }
  }

  bindControls() {
    addEventListener('keydown', (event) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) event.preventDefault();
      this.keys[event.code] = true;
    });
    addEventListener('keyup', (event) => { this.keys[event.code] = false; });
    this.renderer.domElement.addEventListener('pointerdown', (event) => {
      if (this.cameraMode !== 'explore') return;
      this.dragging = true;
      this.pointer = { x: event.clientX, y: event.clientY };
      this.renderer.domElement.setPointerCapture?.(event.pointerId);
    });
    addEventListener('pointerup', () => { this.dragging = false; });
    addEventListener('pointermove', (event) => {
      if (!this.dragging || this.cameraMode !== 'explore') return;
      this.yaw -= (event.clientX - this.pointer.x) * .003;
      this.pitch = THREE.MathUtils.clamp(this.pitch - (event.clientY - this.pointer.y) * .0024, -1.15, 1.15);
      this.pointer = { x: event.clientX, y: event.clientY };
    });
  }

  toggleCamera() {
    this.cameraMode = this.cameraMode === 'explore' ? 'cinematic' : 'explore';
    if (this.cameraMode === 'explore') {
      const direction = new THREE.Vector3();
      this.camera.getWorldDirection(direction);
      this.yaw = Math.atan2(-direction.x, -direction.z);
      this.pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
    }
    return this.cameraMode === 'cinematic';
  }

  cycleTheme() {
    this.themeIndex = (this.themeIndex + 1) % THEMES.length;
    this.applyTheme();
    return THEMES[this.themeIndex];
  }

  applyTheme() {
    const theme = THEMES[this.themeIndex];
    this.scene.background.set(theme.sky);
    this.scene.fog.color.set(theme.fog);
    this.terrainMaterial?.color.set(theme.ground);
    this.terrainMaterial?.emissive.set(theme.groundGlow);
    this.fireflyMaterial?.color.set(theme.accent);
    this.keyLight.color.set(theme.light);
    for (const item of this.reactiveObjects || []) {
      if (item.kind === 'tree') { item.crown.material.color.set(theme.crown); item.crown.material.emissive.set(theme.crown); }
      if (item.kind === 'crystal') { item.crown.material.color.set(theme.accent); item.crown.material.emissive.set(theme.accent); }
    }
    for (const wave of this.shockwaves) wave.ring.material.color.set(theme.accent);
  }

  triggerShockwave() {
    const wave = this.shockwaves.reduce((oldest, current) => current.age > oldest.age ? current : oldest);
    wave.age = 0;
    wave.ring.visible = true;
    wave.ring.scale.setScalar(1);
    wave.ring.material.opacity = .8;
  }

  update(dt, time, features, section) {
    if (section !== this.section) {
      this.section = section;
      this.sectionPulse = section === 'DROP' ? 1 : .45;
    }
    if (features.kick && time - this.lastKickAt > .18) {
      this.lastKickAt = time;
      this.triggerShockwave();
    }
    this.sectionPulse *= Math.pow(.05, dt);
    const sectionBoost = { DREAMING: .05, INTRO: .08, BUILD: .28, DROP: .7, BREAK: -.12, FLOW: .18, OUTRO: 0 }[section] ?? 0;
    const energy = THREE.MathUtils.clamp(features.energy + sectionBoost, 0, 1.6);
    this.terrainMaterial.emissiveIntensity = .34 + features.bass * 1.35 + this.sectionPulse * 1.5;
    this.bloom.strength = .62 + features.high * .92 + energy * .28 + this.sectionPulse * .58;
    this.keyLight.intensity = 1.45 + energy * 2.2 + this.sectionPulse * 2.5;
    this.scene.fog.density = THREE.MathUtils.lerp(this.scene.fog.density, section === 'BREAK' ? .02 : .012 - Math.min(.004, energy * .002), .025);
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(this.renderer.toneMappingExposure, 1 + energy * .18 + this.sectionPulse * .2, .06);
    this.fireflies.rotation.y -= dt * (.015 + features.high * .08);
    this.fireflyMaterial.size = .12 + features.high * .26 + this.sectionPulse * .2;
    this.fireflyMaterial.opacity = .55 + energy * .3;
    this.stars.rotation.y += dt * .003;

    for (const item of this.reactiveObjects) {
      item.group.position.y = item.baseY + Math.sin(time * (item.kind === 'crystal' ? .8 : .45) + item.phase) * (item.kind === 'crystal' ? .28 : .055) + features.bass * .15;
      if (item.kind === 'mushroom') {
        const scale = item.baseScale * (1 + features.bass * .17 + this.sectionPulse * .28);
        item.group.scale.set(scale, scale * (1 + features.bass * .13), scale);
      } else if (item.kind === 'crystal') {
        item.group.rotation.y += dt * (.25 + features.high);
        item.crown.material.emissiveIntensity = 1.15 + features.high * 2.6 + this.sectionPulse * 1.4;
      } else {
        item.crown.scale.y = .82 + features.bass * .1 + this.sectionPulse * .08;
        item.crown.material.emissiveIntensity = .48 + energy * 1.25;
      }
    }
    for (const wave of this.shockwaves) {
      if (!wave.ring.visible) continue;
      wave.age += dt;
      wave.ring.scale.setScalar(1 + wave.age * 20);
      wave.ring.material.opacity = Math.max(0, .7 - wave.age * .72);
      if (wave.age > 1) wave.ring.visible = false;
    }
    this.updateCamera(dt, time, features, section);
    this.composer.render();
  }

  updateCamera(dt, time, features, section) {
    if (this.cameraMode === 'cinematic') {
      const radius = 17 + Math.sin(time * .09) * 6;
      const target = new THREE.Vector3(Math.sin(time * .045) * 8, 3.2 + features.bass * 3, Math.cos(time * .04) * 8);
      const desired = new THREE.Vector3(Math.sin(time * .075) * radius, 6 + Math.sin(time * .12) * 3 + features.energy * 2, Math.cos(time * .075) * radius);
      this.camera.position.lerp(desired, 1 - Math.pow(.015, dt));
      this.camera.lookAt(target);
    } else {
      const speed = (this.keys.ShiftLeft || this.keys.ShiftRight ? 13 : 6.5) * dt;
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      if (this.keys.KeyW || this.keys.ArrowUp) this.camera.position.addScaledVector(forward, speed);
      if (this.keys.KeyS || this.keys.ArrowDown) this.camera.position.addScaledVector(forward, -speed);
      if (this.keys.KeyA || this.keys.ArrowLeft) this.camera.position.addScaledVector(right, -speed);
      if (this.keys.KeyD || this.keys.ArrowRight) this.camera.position.addScaledVector(right, speed);
      this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -75, 75);
      this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -75, 75);
      const ground = this.heightAt(this.camera.position.x, this.camera.position.z) + 3.1 + features.bass * .7;
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, ground, 1 - Math.pow(.0008, dt));
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
    const targetFov = 67 + (section === 'DROP' ? 5 : 0) + this.sectionPulse * 8;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, .08);
    this.camera.updateProjectionMatrix();
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
  }
}
