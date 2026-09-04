import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const THEMES = [
  {
    name: 'Moss', code: 'MOSS', sky: 0x010807, horizon: 0x0b2b25, fog: 0x071714,
    ground: 0x102822, groundHigh: 0x245244, groundGlow: 0x06352c, crown: 0x28bd86,
    accent: 0x83ffe0, secondary: 0x877dff, petal: 0xff79c8, sun: 0xffcf70,
    light: 0xc3ffeb, moon: 0xc9fff2
  },
  {
    name: 'Aurora', code: 'AURA', sky: 0x030414, horizon: 0x14143c, fog: 0x0a0d2c,
    ground: 0x13173a, groundHigh: 0x29316f, groundGlow: 0x171863, crown: 0x6574ff,
    accent: 0xc5a0ff, secondary: 0x55e8ff, petal: 0xff89d7, sun: 0x9dfff1,
    light: 0xd3d8ff, moon: 0xe8ddff
  },
  {
    name: 'Ember', code: 'EMBER', sky: 0x100302, horizon: 0x3d0b09, fog: 0x210907,
    ground: 0x32130f, groundHigh: 0x6d2a18, groundGlow: 0x631608, crown: 0xe84f35,
    accent: 0xffc462, secondary: 0xff5f7a, petal: 0xff7f50, sun: 0xffe09a,
    light: 0xffd5a8, moon: 0xffe5b5
  }
];

const SECTION_PROFILES = {
  DREAMING: { intensity: .13, motion: .18, bloom: .18, fog: 1, heart: .22, camera: .2 },
  INTRO: { intensity: .22, motion: .2, bloom: .25, fog: .92, heart: .28, camera: .24 },
  BUILD: { intensity: .62, motion: .72, bloom: .62, fog: .68, heart: .76, camera: .68 },
  DROP: { intensity: 1, motion: 1, bloom: 1, fog: .46, heart: 1, camera: 1 },
  BREAK: { intensity: .16, motion: .12, bloom: .2, fog: 1.28, heart: .18, camera: .1 },
  FLOW: { intensity: .52, motion: .48, bloom: .5, fog: .72, heart: .55, camera: .42 },
  OUTRO: { intensity: .2, motion: .15, bloom: .2, fog: 1.1, heart: .2, camera: .18 }
};

const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));

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

function radialTexture(size = 128, hardCore = false) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const centre = size / 2;
  const gradient = context.createRadialGradient(centre, centre, 0, centre, centre, centre);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(hardCore ? .16 : .05, 'rgba(255,255,255,.95)');
  gradient.addColorStop(hardCore ? .46 : .3, 'rgba(255,255,255,.32)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function response(current, target, delta, attack = .12, release = .55) {
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
    this.cameraMode = 'explore';
    this.keys = {};
    this.yaw = 0;
    this.pitch = -.1;
    this.dragging = false;
    this.lastKickAt = 0;
    this.section = 'DREAMING';
    this.sectionPulse = 0;
    this.beatEnvelope = 0;
    this.music = { bass: 0, mid: 0, high: 0, energy: 0, transient: 0, beatStrength: 0, centroid: .4, warmth: .5 };
    this.director = { ...SECTION_PROFILES.DREAMING };
    this.pointTexture = radialTexture(96);
    this.moonTexture = radialTexture(256, true);
    this.tempColor = new THREE.Color();
    this.setupRenderer();
    this.setupScene();
    this.bindControls();
    this.regenerate(false);
    addEventListener('resize', () => this.resize());
  }

  get dna() {
    return `SW4:${THEMES[this.themeIndex].code}-${this.seed.toString(16).toUpperCase().padStart(8, '0').slice(0, 6)}`;
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.shadowMap.enabled = false;
    this.container.append(this.renderer.domElement);
  }

  setupScene() {
    const theme = THEMES[this.themeIndex];
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(theme.sky);
    this.scene.fog = new THREE.FogExp2(theme.fog, .0135);
    this.camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, .1, 460);
    this.camera.position.set(0, 4.2, 14);

    this.hemiLight = new THREE.HemisphereLight(theme.light, 0x020304, .92);
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
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .64, .58, .56);
    this.composer.addPass(this.bloom);
  }

  makeSky() {
    const theme = THEMES[this.themeIndex];
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: .1 },
        uPulse: { value: 0 },
        uHigh: { value: .1 },
        uTop: { value: new THREE.Color(theme.sky) },
        uHorizon: { value: new THREE.Color(theme.horizon) },
        uAura: { value: new THREE.Color(theme.accent) }
      },
      vertexShader: `
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vPosition;
        uniform float uTime;
        uniform float uEnergy;
        uniform float uPulse;
        uniform float uHigh;
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uAura;
        void main() {
          vec3 direction = normalize(vPosition);
          float height = direction.y * .5 + .5;
          float horizonMix = smoothstep(.08, .84, height);
          vec3 colour = mix(uHorizon, uTop, horizonMix);
          float angle = atan(direction.z, direction.x);
          float ribbonA = sin(angle * 3.2 + direction.y * 15.0 + uTime * .075 + sin(angle * 5.0 - uTime * .04));
          float ribbonB = sin(angle * 5.4 - direction.y * 21.0 - uTime * .052);
          float ribbons = smoothstep(.64, .98, ribbonA * .66 + ribbonB * .34);
          ribbons *= smoothstep(.28, .62, height) * (1.0 - smoothstep(.76, .98, height));
          float horizonGlow = pow(1.0 - abs(direction.y + .05), 7.0);
          colour += uAura * ribbons * (.035 + uEnergy * .18 + uHigh * .08);
          colour += uAura * horizonGlow * (.035 + uEnergy * .075 + uPulse * .08);
          gl_FragColor = vec4(colour, 1.0);
        }
      `
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(250, 44, 28), this.skyMaterial);
    this.sky.renderOrder = -100;
    this.scene.add(this.sky);
  }

  makeMoon() {
    const theme = THEMES[this.themeIndex];
    this.moonMaterial = new THREE.SpriteMaterial({
      map: this.moonTexture,
      color: theme.moon,
      transparent: true,
      opacity: .64,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.moon = new THREE.Sprite(this.moonMaterial);
    this.moon.position.set(-49, 45, -104);
    this.moon.scale.set(25, 25, 1);
    this.scene.add(this.moon);
  }

  makeStars() {
    const positions = [];
    const sizes = [];
    for (let index = 0; index < 950; index++) {
      const radius = 92 + Math.random() * 120;
      const angle = Math.random() * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, 18 + Math.random() * 115, Math.sin(angle) * radius);
      sizes.push(.4 + Math.random() * .6);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    this.starMaterial = new THREE.PointsMaterial({
      map: this.pointTexture,
      color: 0xc7fff0,
      size: .72,
      sizeAttenuation: true,
      transparent: true,
      opacity: .58,
      alphaTest: .01,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.stars = new THREE.Points(geometry, this.starMaterial);
    this.scene.add(this.stars);
  }

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
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(.94, 1, 96), material);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = .72;
      // Energy pulses are a luminous overlay: terrain must never erase one side.
      ring.renderOrder = 8;
      ring.visible = false;
      this.scene.add(ring);
      this.shockwaves.push({ ring, age: 99, power: 1 });
    }
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
    this.mistSprites = [];
    this.energyPaths = [];
    this.makeTerrain();
    this.makeGrass();
    this.makeEnergyPaths();
    this.makeForest();
    this.makeMushrooms();
    this.makeCrystals();
    this.makeWorldHeart();
    this.makeFireflies();
    this.makeMist();
    for (const wave of this.shockwaves) wave.ring.position.y = this.heightAt(0, 0) + .24;
    this.applyTheme();
    return this.dna;
  }

  heightAt(x, z) {
    return Math.sin(x * .105) * .72 + Math.cos(z * .09) * .58 + Math.sin((x + z) * .038) * 1.38 + Math.sin(Math.hypot(x, z) * .12) * .3;
  }

  glowMaterial(color, intensity = 1.15, options = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: options.roughness ?? .42,
      metalness: options.metalness ?? .04,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1
    });
  }

  makeTerrain() {
    const theme = THEMES[this.themeIndex];
    const geometry = new THREE.PlaneGeometry(180, 180, 120, 120);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      positions.setY(index, this.heightAt(positions.getX(index), positions.getZ(index)));
    }
    geometry.computeVertexNormals();
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: .9,
      metalness: .06,
      emissive: theme.groundGlow,
      emissiveIntensity: .38
    });
    this.terrain = new THREE.Mesh(geometry, this.terrainMaterial);
    this.worldRoot.add(this.terrain);
    this.updateTerrainColours();
  }

  updateTerrainColours() {
    if (!this.terrain) return;
    const theme = THEMES[this.themeIndex];
    const low = new THREE.Color(theme.ground);
    const high = new THREE.Color(theme.groundHigh);
    const positions = this.terrain.geometry.attributes.position;
    const colours = new Float32Array(positions.count * 3);
    for (let index = 0; index < positions.count; index++) {
      const elevation = clamp((positions.getY(index) + 2.5) / 5.8);
      const colour = low.clone().lerp(high, elevation * .56);
      colours[index * 3] = colour.r;
      colours[index * 3 + 1] = colour.g;
      colours[index * 3 + 2] = colour.b;
    }
    this.terrain.geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  }

  makeGrass() {
    const theme = THEMES[this.themeIndex];
    const geometry = new THREE.ConeGeometry(.07, .82, 3, 1);
    geometry.translate(0, .41, 0);
    this.grassMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWind: { value: .1 },
        uPulse: { value: 0 },
        uColour: { value: new THREE.Color(theme.crown) }
      },
      vertexShader: `
        uniform float uTime;
        uniform float uWind;
        uniform float uPulse;
        varying float vHeight;
        void main() {
          vec3 transformed = position;
          float tip = clamp(position.y / .82, 0.0, 1.0);
          #ifdef USE_INSTANCING
            vec3 origin = vec3(instanceMatrix[3].xyz);
            transformed.x += sin(origin.x * .23 + origin.z * .17 + uTime * 1.25) * tip * (.08 + uWind * .2);
            transformed.z += cos(origin.z * .19 - origin.x * .13 + uTime) * tip * (.05 + uWind * .13);
            transformed.y *= 1.0 + uPulse * .12 * tip;
            vec4 worldPosition = instanceMatrix * vec4(transformed, 1.0);
          #else
            vec4 worldPosition = vec4(transformed, 1.0);
          #endif
          vHeight = tip;
          gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform vec3 uColour;
        uniform float uPulse;
        varying float vHeight;
        void main() {
          vec3 colour = uColour * (.24 + vHeight * .62 + uPulse * .34);
          gl_FragColor = vec4(colour, 1.0);
        }
      `
    });
    const count = 1150;
    this.grass = new THREE.InstancedMesh(geometry, this.grassMaterial, count);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    for (let index = 0; index < count; index++) {
      const radius = 6 + Math.sqrt(this.random()) * 75;
      const angle = this.random() * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      position.set(x, this.heightAt(x, z), z);
      euler.set(0, this.random() * Math.PI * 2, (this.random() - .5) * .13);
      quaternion.setFromEuler(euler);
      const size = .45 + this.random() * 1.35;
      scale.set(size, size * (.7 + this.random() * .8), size);
      matrix.compose(position, quaternion, scale);
      this.grass.setMatrixAt(index, matrix);
    }
    this.grass.instanceMatrix.needsUpdate = true;
    this.worldRoot.add(this.grass);
  }

  makeEnergyPaths() {
    const theme = THEMES[this.themeIndex];
    for (let pathIndex = 0; pathIndex < 9; pathIndex++) {
      const angle = pathIndex / 9 * Math.PI * 2 + (this.random() - .5) * .25;
      const points = [];
      for (let index = 0; index < 68; index++) {
        const radius = 1.7 + index * 1.03;
        const wander = Math.sin(index * .22 + pathIndex * 1.8) * (1.1 + radius * .016);
        const x = Math.cos(angle) * radius + Math.cos(angle + Math.PI / 2) * wander;
        const z = Math.sin(angle) * radius + Math.sin(angle + Math.PI / 2) * wander;
        points.push(new THREE.Vector3(x, this.heightAt(x, z) + .095, z));
      }
      const material = new THREE.LineBasicMaterial({
        color: pathIndex % 3 === 0 ? theme.secondary : theme.accent,
        transparent: true,
        opacity: .16,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
      this.energyPaths.push({ line, material, phase: pathIndex * .7 });
      this.worldRoot.add(line);
    }
  }

  makeForest() {
    const theme = THEMES[this.themeIndex];
    this.treeCrownMaterial = this.glowMaterial(theme.crown, .58, { roughness: .72 });
    this.trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x13221d, roughness: 1 });
    const trunkGeometry = new THREE.CylinderGeometry(.2, .48, 1, 7);
    const crownGeometry = new THREE.ConeGeometry(1, 1, 9);
    for (let index = 0; index < 104; index++) {
      const radius = 10 + Math.sqrt(this.random()) * 70;
      const angle = this.random() * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (Math.hypot(x, z - 14) < 8) continue;
      const height = 4.5 + this.random() * 8.5;
      const width = 1.55 + this.random() * 1.75;
      const group = new THREE.Group();
      group.position.set(x, this.heightAt(x, z), z);
      group.rotation.y = this.random() * Math.PI * 2;
      const trunk = new THREE.Mesh(trunkGeometry, this.trunkMaterial);
      trunk.position.y = height / 2;
      trunk.scale.set(.7 + height * .035, height, .7 + height * .035);
      const crownGroup = new THREE.Group();
      for (let layer = 0; layer < 3; layer++) {
        const crown = new THREE.Mesh(crownGeometry, this.treeCrownMaterial);
        const layerWidth = width * (1 - layer * .17);
        const layerHeight = 4.3 + (2 - layer) * .45 + this.random() * .75;
        crown.scale.set(layerWidth, layerHeight, layerWidth);
        crown.position.y = height * .62 + layer * 2.05;
        crown.rotation.y = layer * 1.15 + this.random();
        crownGroup.add(crown);
      }
      group.add(trunk, crownGroup);
      this.worldRoot.add(group);
      this.reactiveObjects.push({ group, crownGroup, baseY: group.position.y, phase: this.random() * Math.PI * 2, kind: 'tree' });
    }
  }

  makeMushrooms() {
    const theme = THEMES[this.themeIndex];
    this.mushroomMaterials = [
      this.glowMaterial(theme.accent, 1.15),
      this.glowMaterial(theme.petal, 1.12),
      this.glowMaterial(theme.sun, 1.05)
    ];
    this.mushroomStemMaterial = new THREE.MeshStandardMaterial({ color: 0xdad8bd, roughness: .8 });
    const stemGeometry = new THREE.CylinderGeometry(.11, .24, 1.3, 8);
    const capGeometry = new THREE.SphereGeometry(.82, 16, 8);
    this.mushrooms = new THREE.Group();
    for (let index = 0; index < 72; index++) {
      const radius = 5 + Math.sqrt(this.random()) * 48;
      const angle = this.random() * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const baseScale = .48 + this.random() * 1.05;
      const group = new THREE.Group();
      group.position.set(x, this.heightAt(x, z), z);
      group.scale.setScalar(baseScale);
      const stem = new THREE.Mesh(stemGeometry, this.mushroomStemMaterial);
      stem.position.y = .64;
      const cap = new THREE.Mesh(capGeometry, this.mushroomMaterials[index % this.mushroomMaterials.length]);
      cap.scale.y = .4;
      cap.position.y = 1.32;
      group.add(stem, cap);
      this.mushrooms.add(group);
      this.reactiveObjects.push({ group, cap, baseY: group.position.y, phase: this.random() * Math.PI * 2, kind: 'mushroom', baseScale });
    }
    this.worldRoot.add(this.mushrooms);
  }

  makeCrystals() {
    const theme = THEMES[this.themeIndex];
    this.crystalMaterial = this.glowMaterial(theme.secondary, 1.42, { roughness: .22, metalness: .3 });
    const geometry = new THREE.OctahedronGeometry(1, 0);
    this.crystals = new THREE.Group();
    for (let index = 0; index < 34; index++) {
      const radius = 8 + Math.sqrt(this.random()) * 57;
      const angle = this.random() * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const size = .35 + this.random() * .7;
      const crystal = new THREE.Mesh(geometry, this.crystalMaterial);
      crystal.position.set(x, this.heightAt(x, z) + .8 + size, z);
      crystal.scale.set(size, size * (1.65 + this.random() * 1.9), size);
      crystal.rotation.set(this.random(), this.random() * Math.PI, this.random() * .4);
      this.crystals.add(crystal);
      this.reactiveObjects.push({ group: crystal, baseY: crystal.position.y, phase: this.random() * Math.PI * 2, kind: 'crystal', baseScale: crystal.scale.y });
    }
    this.worldRoot.add(this.crystals);
  }

  makeWorldHeart() {
    const theme = THEMES[this.themeIndex];
    this.heart = new THREE.Group();
    this.heart.position.set(0, this.heightAt(0, 0) + 2.45, 0);
    this.heart.scale.setScalar(.84);
    this.heartMaterial = new THREE.MeshPhysicalMaterial({
      color: theme.accent,
      emissive: theme.accent,
      emissiveIntensity: .86,
      roughness: .25,
      metalness: .12,
      transparent: true,
      opacity: .58
    });
    this.heartShell = new THREE.Mesh(new THREE.IcosahedronGeometry(.94, 2), this.heartMaterial);
    this.heartCoreMaterial = new THREE.MeshBasicMaterial({ color: theme.sun, transparent: true, opacity: .74 });
    this.heartCore = new THREE.Mesh(new THREE.IcosahedronGeometry(.34, 2), this.heartCoreMaterial);
    this.heart.add(this.heartShell, this.heartCore);

    this.heartRings = [];
    for (let index = 0; index < 3; index++) {
      const material = new THREE.MeshBasicMaterial({
        color: index === 1 ? theme.secondary : theme.accent,
        transparent: true,
        opacity: .48 - index * .08,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.38 + index * .38, .022 + index * .007, 8, 96), material);
      ring.rotation.set(index * .75 + .3, index * .92, index * .4);
      this.heartRings.push(ring);
      this.heart.add(ring);
    }

    const positions = [];
    for (let index = 0; index < 360; index++) {
      const radius = 2.1 + this.random() * 5.7;
      const angle = this.random() * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, (this.random() - .5) * 4.2, Math.sin(angle) * radius);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.vortexMaterial = new THREE.PointsMaterial({
      map: this.pointTexture,
      color: theme.accent,
      size: .18,
      transparent: true,
      opacity: .55,
      alphaTest: .015,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.vortex = new THREE.Points(geometry, this.vortexMaterial);
    this.heart.add(this.vortex);
    this.heartLight = new THREE.PointLight(theme.accent, 16, 34, 1.5);
    this.heart.add(this.heartLight);
    this.worldRoot.add(this.heart);
  }

  makeFireflies() {
    const theme = THEMES[this.themeIndex];
    const positions = [];
    for (let index = 0; index < 1350; index++) {
      const radius = 3 + Math.sqrt(this.random()) * 67;
      const angle = this.random() * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, 1 + this.random() * 20, Math.sin(angle) * radius);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.fireflyMaterial = new THREE.PointsMaterial({
      map: this.pointTexture,
      color: theme.accent,
      size: .22,
      transparent: true,
      opacity: .72,
      alphaTest: .01,
      depthWrite: false,
      blending: THREE.AdditiveBlending
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
        opacity: .055,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(material);
      const radius = 8 + this.random() * 62;
      const angle = this.random() * Math.PI * 2;
      sprite.position.set(Math.cos(angle) * radius, .8 + this.random() * 4, Math.sin(angle) * radius);
      const width = 9 + this.random() * 18;
      sprite.scale.set(width, width * (.18 + this.random() * .1), 1);
      this.mist.add(sprite);
      this.mistSprites.push({ sprite, material, phase: this.random() * Math.PI * 2, baseOpacity: .025 + this.random() * .045 });
    }
    this.worldRoot.add(this.mist);
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
    this.heartRings?.forEach((ring, index) => ring.material.color.set(index === 1 ? theme.secondary : theme.accent));
    this.energyPaths?.forEach((path, index) => path.material.color.set(index % 3 === 0 ? theme.secondary : theme.accent));
    this.mistSprites?.forEach(({ material }) => material.color.set(theme.fog));
    this.keyLight.color.set(theme.light);
    this.hemiLight.color.set(theme.light);
    this.rimLight.color.set(theme.secondary);
    for (const wave of this.shockwaves) wave.ring.material.color.set(theme.accent);
  }

  triggerShockwave(power = 1) {
    const wave = this.shockwaves.reduce((oldest, current) => current.age > oldest.age ? current : oldest);
    wave.age = 0;
    wave.power = power;
    wave.ring.visible = true;
    wave.ring.scale.setScalar(1);
    wave.ring.material.opacity = .45 + power * .38;
  }

  updateDirector(delta, section) {
    const target = SECTION_PROFILES[section] || SECTION_PROFILES.FLOW;
    const speed = section === 'DROP' ? .23 : .72;
    const amount = 1 - Math.exp(-delta / speed);
    for (const key of Object.keys(target)) this.director[key] = THREE.MathUtils.lerp(this.director[key], target[key], amount);
  }

  smoothMusic(delta, features) {
    for (const name of ['bass', 'mid', 'high', 'energy', 'transient', 'centroid', 'warmth']) {
      const target = Number.isFinite(features[name]) ? features[name] : this.music[name];
      this.music[name] = response(this.music[name], target, delta, name === 'transient' ? .035 : .09, name === 'transient' ? .24 : .48);
    }
    const beat = Number.isFinite(features.beatStrength) ? features.beatStrength : 0;
    this.beatEnvelope = Math.max(this.beatEnvelope * Math.exp(-delta / .2), beat, features.kick ? 1 : 0);
    this.music.beatStrength = this.beatEnvelope;
  }

  update(delta, time, features, section) {
    if (section !== this.section) {
      this.section = section;
      this.sectionPulse = section === 'DROP' ? 1 : .42;
    }
    this.smoothMusic(delta, features);
    this.updateDirector(delta, section);
    const music = this.music;
    if (features.kick && time - this.lastKickAt > .17) {
      this.lastKickAt = time;
      this.triggerShockwave(.55 + music.transient * .45);
    }
    this.sectionPulse *= Math.exp(-delta / .52);

    const intensity = clamp(music.energy * .72 + this.director.intensity * .46, 0, 1.3);
    const pulse = clamp(this.beatEnvelope + this.sectionPulse * .72, 0, 1.5);
    this.terrainMaterial.emissiveIntensity = .28 + music.bass * .9 + intensity * .32 + pulse * .3;
    this.bloom.strength = .43 + music.high * .48 + this.director.bloom * .34 + pulse * .2;
    this.bloom.radius = .48 + music.centroid * .2;
    this.keyLight.intensity = 1.35 + intensity * 2 + pulse * 1.15;
    this.hemiLight.intensity = .7 + intensity * .55;
    this.rimLight.intensity = 15 + music.mid * 24 + this.director.intensity * 16;
    this.scene.fog.density = THREE.MathUtils.lerp(this.scene.fog.density, .0105 + this.director.fog * .0053 - intensity * .0022, 1 - Math.exp(-delta / .85));
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(this.renderer.toneMappingExposure, .96 + intensity * .17 + pulse * .07, 1 - Math.exp(-delta / .38));

    this.skyMaterial.uniforms.uTime.value = time;
    this.skyMaterial.uniforms.uEnergy.value = intensity;
    this.skyMaterial.uniforms.uPulse.value = pulse;
    this.skyMaterial.uniforms.uHigh.value = music.high;
    this.moonMaterial.opacity = .48 + (1 - intensity) * .18 + music.high * .16;
    this.moon.scale.setScalar(24 + pulse * 1.4);
    this.stars.rotation.y += delta * (.0018 + music.high * .005);
    this.starMaterial.opacity = .4 + music.high * .27 + (1 - intensity) * .12;
    this.starMaterial.size = .58 + music.transient * .28;

    this.grassMaterial.uniforms.uTime.value = time;
    this.grassMaterial.uniforms.uWind.value = .08 + music.high * .48 + this.director.motion * .27;
    this.grassMaterial.uniforms.uPulse.value = pulse;
    this.fireflies.rotation.y -= delta * (.009 + music.high * .065 + this.director.motion * .02);
    this.fireflies.position.y = Math.sin(time * .22) * .18;
    this.fireflyMaterial.size = .14 + music.high * .2 + pulse * .08;
    this.fireflyMaterial.opacity = .46 + intensity * .3 + music.transient * .12;

    for (const path of this.energyPaths) {
      path.material.opacity = .07 + music.mid * .28 + pulse * .23 * (.55 + Math.sin(time * 2.1 + path.phase) * .35);
    }
    for (const item of this.reactiveObjects) {
      if (item.kind === 'tree') {
        item.group.position.y = item.baseY + Math.sin(time * .38 + item.phase) * .035;
        item.crownGroup.rotation.z = Math.sin(time * (.32 + this.director.motion * .16) + item.phase) * (.012 + music.high * .026);
        const crownPulse = 1 + music.bass * .035 + pulse * .025;
        item.crownGroup.scale.set(crownPulse, 1 + music.bass * .045 + pulse * .035, crownPulse);
      } else if (item.kind === 'mushroom') {
        item.group.position.y = item.baseY + Math.sin(time * .5 + item.phase) * .045;
        const scale = item.baseScale * (1 + music.bass * .11 + pulse * .1);
        item.group.scale.set(scale, scale * (1 + music.bass * .08), scale);
      } else {
        item.group.position.y = item.baseY + Math.sin(time * .72 + item.phase) * (.14 + music.mid * .12);
        item.group.rotation.y += delta * (.12 + music.high * .72);
      }
    }
    this.treeCrownMaterial.emissiveIntensity = .38 + intensity * .78 + music.mid * .36;
    this.crystalMaterial.emissiveIntensity = 1 + music.high * 2.1 + pulse * .75;
    this.mushroomMaterials.forEach((material, index) => {
      material.emissiveIntensity = .82 + music.mid * .72 + music.high * .38 + pulse * (.28 + index * .08);
    });

    const heartScale = 1 + music.bass * .14 + pulse * .18 + this.director.heart * .05;
    this.heartShell.scale.setScalar(heartScale);
    this.heartCore.scale.setScalar(1 + pulse * .23 + music.mid * .1);
    this.heartShell.rotation.x += delta * (.08 + music.high * .18);
    this.heartShell.rotation.y += delta * (.13 + music.mid * .28);
    this.heartMaterial.emissiveIntensity = .58 + this.director.heart * .7 + music.mid * .62 + pulse * .55;
    this.heartCoreMaterial.opacity = .48 + this.director.heart * .18 + pulse * .12;
    this.heartLight.intensity = 7 + this.director.heart * 17 + music.energy * 11 + pulse * 11;
    this.heartRings.forEach((ring, index) => {
      ring.rotation.x += delta * (.08 + index * .04) * (index % 2 ? -1 : 1);
      ring.rotation.y += delta * (.12 + music.high * .3 + index * .035) * (index === 1 ? -1 : 1);
      ring.material.opacity = .2 + this.director.heart * .24 + pulse * .13;
      const ringScale = 1 + pulse * (.04 + index * .016);
      ring.scale.setScalar(ringScale);
    });
    this.vortex.rotation.y -= delta * (.12 + this.director.motion * .58 + music.high * .45);
    this.vortex.rotation.x = Math.sin(time * .12) * .08;
    this.vortexMaterial.size = .11 + music.high * .14 + pulse * .07;
    this.vortexMaterial.opacity = .28 + this.director.heart * .34 + music.high * .16;

    for (const mist of this.mistSprites) {
      mist.sprite.position.x += Math.sin(time * .05 + mist.phase) * delta * .04;
      mist.sprite.position.y += Math.sin(time * .13 + mist.phase) * delta * .018;
      mist.material.opacity = mist.baseOpacity * (this.director.fog * .82 + .24) * (1 - music.high * .28);
    }
    for (const wave of this.shockwaves) {
      if (!wave.ring.visible) continue;
      wave.age += delta;
      const scale = 1 + wave.age * (18 + wave.power * 9);
      wave.ring.scale.setScalar(scale);
      wave.ring.material.opacity = Math.max(0, (.68 + wave.power * .18) * (1 - wave.age / 1.15));
      if (wave.age > 1.15) wave.ring.visible = false;
    }

    this.updateCamera(delta, time, section);
    this.composer.render();
  }

  updateCamera(delta, time, section) {
    const music = this.music;
    if (this.cameraMode === 'cinematic') {
      const movement = .65 + this.director.camera * .7;
      const radius = 17 + Math.sin(time * .075) * 5.5 + this.director.camera * 3;
      const target = new THREE.Vector3(
        Math.sin(time * .038) * 6,
        3 + music.bass * 1.5 + this.director.heart,
        Math.cos(time * .034) * 6
      );
      const desired = new THREE.Vector3(
        Math.sin(time * .057 * movement) * radius,
        5.4 + Math.sin(time * .1) * 2.2 + music.energy * 1.35,
        Math.cos(time * .057 * movement) * radius
      );
      this.camera.position.lerp(desired, 1 - Math.exp(-delta / 1.05));
      this.camera.lookAt(target);
    } else {
      const speed = (this.keys.ShiftLeft || this.keys.ShiftRight ? 13 : 6.5) * delta;
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      if (this.keys.KeyW || this.keys.ArrowUp) this.camera.position.addScaledVector(forward, speed);
      if (this.keys.KeyS || this.keys.ArrowDown) this.camera.position.addScaledVector(forward, -speed);
      if (this.keys.KeyA || this.keys.ArrowLeft) this.camera.position.addScaledVector(right, -speed);
      if (this.keys.KeyD || this.keys.ArrowRight) this.camera.position.addScaledVector(right, speed);
      this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -75, 75);
      this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -75, 75);
      const ground = this.heightAt(this.camera.position.x, this.camera.position.z) + 3.05 + music.bass * .22;
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, ground, 1 - Math.exp(-delta / .34));
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
    const targetFov = 66 + this.director.camera * 1.4 + this.beatEnvelope * 2.8 + (section === 'BREAK' ? -1.2 : 0);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-delta / .2));
    this.camera.updateProjectionMatrix();
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    this.bloom.resolution.set(innerWidth, innerHeight);
  }
}
