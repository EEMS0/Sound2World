import * as THREE from "three";
import { THEMES } from "./theme-system.js?v=1.0.0";
const clamp = (value,minimum=0,maximum=1) => Math.min(maximum,Math.max(minimum,value));

export function makeTerrain() {
    const theme = THEMES[this.themeIndex];
    const geometry = new THREE.PlaneGeometry(180, 180, 120, 120);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      positions.setY(
        index,
        this.heightAt(positions.getX(index), positions.getZ(index)),
      );
    }
    geometry.computeVertexNormals();
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.06,
      emissive: theme.groundGlow,
      emissiveIntensity: 0.38,
    });
    this.terrainUniforms = {
      time: { value: 0 },
      amplitude: { value: 0 },
      pulse: { value: 0 },
    };
    this.terrainMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTerrainTime = this.terrainUniforms.time;
      shader.uniforms.uTerrainAmplitude = this.terrainUniforms.amplitude;
      shader.uniforms.uTerrainPulse = this.terrainUniforms.pulse;
      shader.vertexShader =
        "uniform float uTerrainTime; uniform float uTerrainAmplitude; uniform float uTerrainPulse;\n" +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float radius=length(position.xz);
        transformed.y += (sin(radius*.45-uTerrainTime*1.4)*uTerrainAmplitude + sin(radius*.5-uTerrainTime*8.0)*uTerrainPulse) * smoothstep(4.0,12.0,radius) * .22;`,
      );
    };
    this.terrain = new THREE.Mesh(geometry, this.terrainMaterial);
    this.worldRoot.add(this.terrain);
    this.updateTerrainColours();
  }

export function updateTerrainColours() {
    if (!this.terrain) return;
    const theme = THEMES[this.themeIndex];
    const low = new THREE.Color(theme.ground);
    const high = new THREE.Color(theme.groundHigh);
    const positions = this.terrain.geometry.attributes.position;
    const colours = new Float32Array(positions.count * 3);
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index),
        z = positions.getZ(index);
      const elevation = clamp((positions.getY(index) + 2.5) / 5.8);
      const moss =
        (Math.sin(x * 0.65 + Math.sin(z * 0.3) * 2) * Math.cos(z * 0.48) + 1) *
        0.5;
      const colour = low.clone().lerp(high, elevation * 0.4 + moss * 0.28);
      colours[index * 3] = colour.r;
      colours[index * 3 + 1] = colour.g;
      colours[index * 3 + 2] = colour.b;
    }
    this.terrain.geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(colours, 3),
    );
  }

export function makeGrass() {
    const theme = THEMES[this.themeIndex];
    const geometry = new THREE.ConeGeometry(0.07, 0.82, 3, 1);
    geometry.translate(0, 0.41, 0);
    this.grassMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWind: { value: 0.1 },
        uPulse: { value: 0 },
        uColour: { value: new THREE.Color(theme.crown) },
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
      `,
    });
    const count = this.theme.kind === "forest" ? 2600 : 300;
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
      euler.set(0, this.random() * Math.PI * 2, (this.random() - 0.5) * 0.13);
      quaternion.setFromEuler(euler);
      const size = 0.45 + this.random() * 1.35;
      scale.set(size, size * (0.7 + this.random() * 0.8), size);
      matrix.compose(position, quaternion, scale);
      this.grass.setMatrixAt(index, matrix);
    }
    this.grass.instanceMatrix.needsUpdate = true;
    this.worldRoot.add(this.grass);
  }

export function makeEnergyPaths() {
    const theme = THEMES[this.themeIndex];
    for (let pathIndex = 0; pathIndex < 9; pathIndex++) {
      const angle =
        (pathIndex / 9) * Math.PI * 2 + (this.random() - 0.5) * 0.25;
      const points = [];
      for (let index = 0; index < 68; index++) {
        const radius = 1.7 + index * 1.03;
        const wander =
          Math.sin(index * 0.22 + pathIndex * 1.8) * (1.1 + radius * 0.016);
        const x =
          Math.cos(angle) * radius + Math.cos(angle + Math.PI / 2) * wander;
        const z =
          Math.sin(angle) * radius + Math.sin(angle + Math.PI / 2) * wander;
        points.push(new THREE.Vector3(x, this.heightAt(x, z) + 0.095, z));
      }
      const material = new THREE.LineBasicMaterial({
        color: pathIndex % 3 === 0 ? theme.secondary : theme.accent,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        material,
      );
      this.energyPaths.push({ line, material, phase: pathIndex * 0.7 });
      this.worldRoot.add(line);
    }
  }
