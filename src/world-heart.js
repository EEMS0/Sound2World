import * as THREE from "three";
import { THEMES } from "./theme-system.js?v=1.0.0";

export function makeWorldHeart() {
    const theme = THEMES[this.themeIndex];
    this.heart = new THREE.Group();
    this.heart.position.set(0, this.heightAt(0, 0) + 3.6, 0);
    this.heart.scale.setScalar(1.2);
    this.heartMaterial = new THREE.MeshPhysicalMaterial({
      color: theme.accent,
      emissive: theme.accent,
      emissiveIntensity: 0.86,
      roughness: 0.25,
      metalness: 0.12,
      transparent: true,
      opacity: 0.78,
    });
    this.heartShell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.94, 2),
      this.heartMaterial,
    );
    this.heartCoreMaterial = new THREE.MeshBasicMaterial({
      color: theme.sun,
      transparent: true,
      opacity: 0.74,
    });
    this.heartCore = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.34, 2),
      this.heartCoreMaterial,
    );
    this.heart.add(this.heartShell, this.heartCore);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.pointTexture,
        color: theme.accent,
        transparent: true,
        opacity: 0.17,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.scale.set(8, 8, 1);
    this.heart.add(halo);
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(2.9, 3.7, 0.45, 64),
      new THREE.MeshStandardMaterial({
        color: theme.groundHigh,
        roughness: 0.82,
        metalness: 0.25,
      }),
    );
    pedestal.position.set(0, this.heightAt(0, 0) + 0.18, 0);
    this.worldRoot.add(pedestal);
    const altar = new THREE.Mesh(
      new THREE.TorusGeometry(3.1, 0.028, 8, 128),
      new THREE.MeshBasicMaterial({
        color: theme.accent,
        transparent: true,
        opacity: 0.5,
      }),
    );
    altar.rotation.x = -Math.PI / 2;
    altar.position.y = this.heightAt(0, 0) + 0.46;
    this.worldRoot.add(altar);

    this.heartRings = [];
    for (let index = 0; index < 3; index++) {
      const material = new THREE.MeshBasicMaterial({
        color: index === 1 ? theme.secondary : theme.accent,
        transparent: true,
        opacity: 0.48 - index * 0.08,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(
          1.38 + index * 0.38,
          0.022 + index * 0.007,
          8,
          96,
        ),
        material,
      );
      ring.rotation.set(index * 0.75 + 0.3, index * 0.92, index * 0.4);
      this.heartRings.push(ring);
      this.heart.add(ring);
    }

    const positions = [];
    for (let index = 0; index < 360; index++) {
      const radius = 2.1 + this.random() * 5.7;
      const angle = this.random() * Math.PI * 2;
      positions.push(
        Math.cos(angle) * radius,
        (this.random() - 0.5) * 4.2,
        Math.sin(angle) * radius,
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    this.vortexMaterial = new THREE.PointsMaterial({
      map: this.pointTexture,
      color: theme.accent,
      size: 0.18,
      transparent: true,
      opacity: 0.55,
      alphaTest: 0.015,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.vortex = new THREE.Points(geometry, this.vortexMaterial);
    this.heart.add(this.vortex);
    this.heartLight = new THREE.PointLight(theme.accent, 16, 34, 1.5);
    this.heart.add(this.heartLight);
    this.worldRoot.add(this.heart);
  }
