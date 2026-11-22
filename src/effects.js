import * as THREE from "three";
import { heightAt } from "./terrain.js";

// Particelle (pool di sprite additivi), numeri di danno fluttuanti (DOM) e cerchi di avviso per gli attacchi a area.
export class Effects {
  constructor(scene, assets, camera){
    this.scene = scene; this.assets = assets; this.camera = camera;
    this.live = []; this.free = []; this.texts = []; this.rings = [];
    this.layer = typeof document !== "undefined" ? document.getElementById("fx") : null;
    this.v = new THREE.Vector3();
    this.ringGeo = new THREE.CircleGeometry(1, 40);
  }
  async init(){
    const tex = await this.assets.loadTexture("effects/particles/glow_spark.png");
    for (let i = 0; i < 120; i++){
      const m = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const s = new THREE.Sprite(m); s.visible = false; this.scene.add(s);
      this.free.push({ s, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.2, g: 0 });
    }
  }
  burst(x, y, z, color = 0xffddaa, n = 10, speed = 4, life = 0.4, size = 0.3, gravity = 6){
    for (let i = 0; i < n && this.free.length; i++){
      const p = this.free.pop(), a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u), sp = speed * (0.4 + Math.random() * 0.6);
      p.vx = Math.cos(a) * r * sp; p.vy = u * sp * 0.8 + speed * 0.3; p.vz = Math.sin(a) * r * sp;
      p.life = p.max = life * (0.6 + Math.random() * 0.6); p.size = size * (0.6 + Math.random() * 0.8); p.g = gravity;
      p.s.position.set(x, y, z); p.s.material.color.setHex(color); p.s.material.opacity = 1; p.s.scale.setScalar(p.size); p.s.visible = true;
      this.live.push(p);
    }
  }
  // Numero/testo fluttuante agganciato a una posizione del mondo. cls: "", "crit", "hurt", "heal", "info"
  text(x, y, z, str, cls = ""){
    if (!this.layer) return;
    const el = document.createElement("div"); el.className = "ft " + cls; el.textContent = str; this.layer.appendChild(el);
    this.texts.push({ el, x: x + (Math.random() - 0.5) * 0.6, y, z, t: 0, life: 1.0 });
    if (this.texts.length > 40){ const o = this.texts.shift(); o.el.remove(); }
  }
  // Cerchio rosso che si riempie durante la carica di un attacco ad area.
  telegraph(x, z, radius, dur, color = 0xff2a2a){
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.ringGeo, mat); m.rotation.x = -Math.PI / 2; m.position.set(x, heightAt(x, z) + 0.35, z); m.scale.setScalar(0.1);
    this.scene.add(m); const r = { m, mat, t: 0, dur, radius }; this.rings.push(r); return r;
  }
  update(dt){
    for (let i = this.live.length - 1; i >= 0; i--){
      const p = this.live[i]; p.life -= dt;
      if (p.life <= 0){ p.s.visible = false; this.live.splice(i, 1); this.free.push(p); continue; }
      p.vy -= p.g * dt; p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      const k = p.life / p.max; p.s.material.opacity = k; p.s.scale.setScalar(p.size * (0.5 + k * 0.5));
    }
    for (let i = this.rings.length - 1; i >= 0; i--){
      const r = this.rings[i]; r.t += dt; const u = Math.min(1, r.t / r.dur);
      r.m.scale.setScalar(Math.max(0.1, r.radius * (0.15 + 0.85 * u))); r.mat.opacity = 0.25 + 0.3 * u;
      if (r.t >= r.dur + 0.1){ this.scene.remove(r.m); r.mat.dispose(); this.rings.splice(i, 1); }
    }
    for (let i = this.texts.length - 1; i >= 0; i--){
      const t = this.texts[i]; t.t += dt;
      if (t.t >= t.life){ t.el.remove(); this.texts.splice(i, 1); continue; }
      this.v.set(t.x, t.y + t.t * 1.2, t.z).project(this.camera);
      if (this.v.z > 1 || this.v.z < -1){ t.el.style.display = "none"; continue; }
      t.el.style.display = "block";
      t.el.style.left = ((this.v.x * 0.5 + 0.5) * innerWidth) + "px"; t.el.style.top = ((-this.v.y * 0.5 + 0.5) * innerHeight) + "px";
      t.el.style.opacity = String(Math.min(1, (t.life - t.t) * 2.5));
    }
  }
}
