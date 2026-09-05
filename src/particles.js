import * as THREE from "three";
export class ParticleField {
  constructor(texture, colour, random) {
    this.count = 420;
    this.cursor = 0;
    this.positions = new Float32Array(this.count * 3);
    this.velocity = new Float32Array(this.count * 3);
    this.life = new Float32Array(this.count);
    this.positions.fill(-999);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3),
    );
    this.material = new THREE.PointsMaterial({
      map: texture,
      color: colour,
      size: 0.16,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Points(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.random = random;
  }
  burst(power, origin, count = 90) {
    for (let i = 0; i < Math.min(count, this.count); i++) {
      const slot = this.cursor++ % this.count,
        j = slot * 3,
        a = this.random() * 6.28,
        speed = (1 + this.random() * 5) * power;
      this.positions[j] = origin.x;
      this.positions[j + 1] = origin.y;
      this.positions[j + 2] = origin.z;
      this.velocity[j] = Math.cos(a) * speed;
      this.velocity[j + 1] = (this.random() - 0.2) * speed;
      this.velocity[j + 2] = Math.sin(a) * speed;
      this.life[slot] = 1.5 + this.random() * 2;
    }
  }
  update(dt) {
    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      if (this.life[i] > 0) {
        this.life[i] -= dt;
        for (let axis = 0; axis < 3; axis++) {
          this.positions[j + axis] += this.velocity[j + axis] * dt;
          this.velocity[j + axis] *= Math.exp(-dt * 0.5);
        }
        this.velocity[j + 1] -= dt * 0.2;
      } else this.positions[j + 1] = -999;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }
}
