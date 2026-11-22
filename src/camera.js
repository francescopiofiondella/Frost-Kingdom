import * as THREE from "three";
import { heightAt, WORLD_HALF } from "./terrain.js";

// Telecamera in terza persona: orbita, zoom, smorzamento, collisione con terreno e oggetti solidi.
export class ThirdPersonCamera {
  constructor(camera, input, collision){
    this.camera = camera; this.input = input; this.col = collision;
    this.yaw = 0; this.pitch = 0.35; this.distance = 7; this.minDist = 2.5; this.maxDist = 16;
    this.sens = 0.0023; this.baseFov = 60; this.fovBoost = 0; this.shake = 0; this.aim = 0; this.aimTarget = 0;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.init = false;
  }
  update(dt, target){
    const [dx, dy, wheel] = this.input.consumeLook();
    this.yaw -= dx * this.sens;
    this.pitch = Math.min(1.35, Math.max(-0.25, this.pitch + dy * this.sens));
    this.distance = Math.min(this.maxDist, Math.max(this.minDist, this.distance + wheel * 0.8));
    this.aim += (this.aimTarget - this.aim) * (1 - Math.exp(-dt * 10));
    const dist = this.distance * (1 - 0.4 * this.aim);
    const cp = Math.cos(this.pitch), dir = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    // accorcia la distanza se un solido si interpone tra bersaglio e telecamera
    let allowed = dist;
    if (this.col){
      for (let s = 1; s <= 14; s++){
        const d = dist * s / 14;
        const x = target.x + dir.x * d, y = target.y + dir.y * d, z = target.z + dir.z * d;
        if (this.col.blocked(x, z, y, 0.35)){ allowed = Math.max(this.minDist * 0.4, dist * (s - 1) / 14); break; }
      }
    }
    const want = target.clone().addScaledVector(dir, allowed);
    const lim = WORLD_HALF - 2;
    want.x = Math.max(-lim, Math.min(lim, want.x)); want.z = Math.max(-lim, Math.min(lim, want.z));
    want.y = Math.max(want.y, heightAt(want.x, want.z) + 0.8);
    if (!this.init){ this.pos.copy(want); this.look.copy(target); this.init = true; }
    this.pos.lerp(want, 1 - Math.exp(-dt * (allowed < dist ? 30 : 12)));
    this.look.lerp(target, 1 - Math.exp(-dt * 20));
    this.pos.y = Math.max(this.pos.y, heightAt(this.pos.x, this.pos.z) + 0.6);
    this.camera.position.copy(this.pos); this.camera.lookAt(this.look);
    if (this.shake > 0.002){ const k = this.shake; this.camera.position.x += (Math.random() - 0.5) * k; this.camera.position.y += (Math.random() - 0.5) * k; this.camera.position.z += (Math.random() - 0.5) * k; this.shake *= Math.exp(-dt * 10); } else this.shake = 0;
    const fov = this.baseFov + this.fovBoost - 14 * this.aim;
    if (Math.abs(this.camera.fov - fov) > 0.05){ this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-dt * 6)); this.camera.updateProjectionMatrix(); }
  }
}
