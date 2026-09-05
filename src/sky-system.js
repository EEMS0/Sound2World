import * as THREE from "three";
import { THEMES } from "./theme-system.js?v=1.0.0";

export function makeSky() {
    const theme = THEMES[this.themeIndex];
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.1 },
        uPulse: { value: 0 },
        uHigh: { value: 0.1 },
        uTop: { value: new THREE.Color(theme.sky) },
        uHorizon: { value: new THREE.Color(theme.horizon) },
        uAura: { value: new THREE.Color(theme.accent) },
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
      `,
    });
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(250, 44, 28),
      this.skyMaterial,
    );
    this.sky.renderOrder = -100;
    this.scene.add(this.sky);
  }

export function makeMoon() {
    const theme = THEMES[this.themeIndex];
    this.moonMaterial = new THREE.SpriteMaterial({
      map: this.moonTexture,
      color: theme.moon,
      transparent: true,
      opacity: 0.64,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.moon = new THREE.Sprite(this.moonMaterial);
    this.moon.position.set(-49, 45, -104);
    this.moon.scale.set(25, 25, 1);
    this.scene.add(this.moon);
  }

export function makeStars() {
    const positions = [];
    const sizes = [];
    for (let index = 0; index < 950; index++) {
      const radius = 92 + Math.random() * 120;
      const angle = Math.random() * Math.PI * 2;
      positions.push(
        Math.cos(angle) * radius,
        18 + Math.random() * 115,
        Math.sin(angle) * radius,
      );
      sizes.push(0.4 + Math.random() * 0.6);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
    this.starMaterial = new THREE.PointsMaterial({
      map: this.pointTexture,
      color: 0xc7fff0,
      size: 0.72,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.58,
      alphaTest: 0.01,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(geometry, this.starMaterial);
    this.scene.add(this.stars);
  }
