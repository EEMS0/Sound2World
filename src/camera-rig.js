import * as THREE from "three";

// Protected clearing and orbit: tall silhouettes start beyond every cinematic camera position.
export const CLEARING_RADIUS = 34;
export function canPlantTree(x, z, crownRadius = 3) {
  return (
    Math.hypot(x, z) > CLEARING_RADIUS + crownRadius &&
    !(z > 0 && Math.abs(x) < 7)
  );
}

export class CameraRig {
  constructor(camera, canvas, heightAt) {
    this.camera = camera;
    this.heightAt = heightAt;
    this.mode = "cinematic";
    this.motion = 0.55;
    this.keys = {};
    this.yaw = 0;
    this.pitch = -0.09;
    this.orbit = 0;
    this.dragging = false;
    this.enabled = true;
    this.reducedMotion = false;
    this.desired = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    addEventListener("keydown", (event) => {
      if (
        /INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName) ||
        !this.enabled
      )
        return;
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(event.code)
      )
        event.preventDefault();
      this.keys[event.code] = true;
    });
    addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
    });
    addEventListener("blur", () => {
      this.keys = {};
      this.dragging = false;
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (this.mode !== "explore" || !this.enabled) return;
      this.dragging = true;
      this.pointer = [e.clientX, e.clientY];
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      this.yaw -= (e.clientX - this.pointer[0]) * 0.003;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - (e.clientY - this.pointer[1]) * 0.0024,
        -1.1,
        1.1,
      );
      this.pointer = [e.clientX, e.clientY];
    });
    const release = () => {
      this.dragging = false;
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
  }
  toggle() {
    this.mode = this.mode === "cinematic" ? "explore" : "cinematic";
    if (this.mode === "explore") {
      this.camera.getWorldDirection(this.forward);
      this.yaw = Math.atan2(-this.forward.x, -this.forward.z);
      this.pitch = Math.asin(THREE.MathUtils.clamp(this.forward.y, -1, 1));
    } else
      this.orbit = Math.atan2(this.camera.position.x, this.camera.position.z);
    this.keys = {};
    return this.mode === "cinematic";
  }
  home() {
    this.camera.position.set(0, 5.6, 21);
    this.orbit = 0;
    this.mode = "cinematic";
  }
  update(dt, time, music, director, colliders) {
    const camera = this.camera;
    if (this.mode === "cinematic") {
      this.orbit += dt * 0.018 * this.motion * (0.4 + director.camera);
      const radius =
        21 +
        (Math.sin(time * 0.065) * 1.8 + director.release * 2.4) * this.motion;
      this.desired.set(
        Math.sin(this.orbit) * radius,
        5.5 +
          (Math.sin(time * 0.09) * 0.5 + director.release * 0.8) * this.motion,
        Math.cos(this.orbit) * radius,
      );
      camera.position.lerp(this.desired, 1 - Math.exp(-dt / 1.5));
      this.target.set(0, this.heightAt(0, 0) + 3.2, 0);
      camera.lookAt(this.target);
    } else if (this.enabled) {
      const speed =
        (this.keys.ShiftLeft || this.keys.ShiftRight ? 12 : 5.5) * dt;
      this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      if (this.keys.KeyW || this.keys.ArrowUp)
        camera.position.addScaledVector(this.forward, speed);
      if (this.keys.KeyS || this.keys.ArrowDown)
        camera.position.addScaledVector(this.forward, -speed);
      if (this.keys.KeyA || this.keys.ArrowLeft)
        camera.position.addScaledVector(this.right, -speed);
      if (this.keys.KeyD || this.keys.ArrowRight)
        camera.position.addScaledVector(this.right, speed);
      for (const tree of colliders) {
        const dx = camera.position.x - tree.x,
          dz = camera.position.z - tree.z,
          distance = Math.hypot(dx, dz);
        if (distance < tree.radius) {
          camera.position.x =
            tree.x + (distance > 0.001 ? dx / distance : 1) * tree.radius;
          camera.position.z =
            tree.z + (distance > 0.001 ? dz / distance : 0) * tree.radius;
        }
      }
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -76, 76);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, -76, 76);
      camera.position.y +=
        (this.heightAt(camera.position.x, camera.position.z) +
          3.2 -
          camera.position.y) *
        (1 - Math.exp(-dt / 0.22));
      camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    }
    camera.position.y = Math.max(
      camera.position.y,
      this.heightAt(camera.position.x, camera.position.z) + 2.7,
    );
    const fov =
      62 -
      director.anticipation * 3 * this.motion +
      director.release * 4 * this.motion;
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt / 0.45));
    camera.updateProjectionMatrix();
  }
}
