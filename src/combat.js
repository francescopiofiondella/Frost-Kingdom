import * as THREE from "three";
import { heightAt } from "./terrain.js";

// Risoluzione dei colpi, proiettili, danni, critici, effetti di stato, hitstop e shake.
export class Combat {
  constructor(game){
    this.g = game; this.proj = []; this.hitstop = 0; this.critChance = 0.08;
    this.arrowGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5); this.arrowGeo.rotateX(Math.PI / 2);
    this.arrowMat = new THREE.MeshBasicMaterial({ color: 0xc9a46a });
    this.tex = {};
  }
  async init(){
    const a = this.g.assets;
    this.tex.fire = await a.loadTexture("effects/fire/fire_particle.png");
    this.tex.frost = await a.loadTexture("effects/magic/frost_orb.png");
    this.tex.arcane = await a.loadTexture("effects/particles/glow_spark.png");
  }

  // ---------- colpi del giocatore ----------
  update(dt){
    const h = this.g.player.takePendingHit();
    if (h) this.resolveSwing(h);
    this.updateProjectiles(dt);
  }

  resolveSwing(h){
    if (h.proj){ this.fireFromPlayer(h); return; }
    let hits = 0;
    for (const e of this.g.enemies.active){
      if (e.dead) continue;
      const dx = e.x - h.x, dz = e.z - h.z, d = Math.hypot(dx, dz);
      if (d > h.range + e.def.radius || Math.abs(e.y - h.y) > 2.6) continue;
      const close = d < e.def.radius + 0.7;
      if (!close && (dx * h.dx + dz * h.dz) / d < Math.cos(h.arc / 2)) continue;
      this.damageEnemy(e, h.dmg, { from: h, knock: h.heavy ? 8 : 4, heavy: h.heavy, effect: h.effect, counter: h.counter });
      hits++;
    }
    if (hits){ this.hitstop = h.heavy || h.counter ? 0.09 : 0.05; this.g.rig.shake = Math.max(this.g.rig.shake, h.heavy ? 0.35 : 0.15); }
  }

  damageEnemy(e, base, o = {}){
    if (e.dead) return 0;
    let crit = Math.random() < this.critChance + (this.g.player.critBonus || 0);
    let dmg = base * (0.92 + Math.random() * 0.16);
    if (e.state === "stagger") dmg *= 1.5;
    if (o.counter) crit = true;
    if (crit) dmg *= 2;
    dmg = Math.max(1, Math.round(dmg));
    e.takeDamage(dmg, o.from, o.knock || 0, o);
    const fx = this.g.effects;
    fx.text(e.x, e.y + e.def.h + 0.3, e.z, (crit ? "CRITICO " : "") + dmg, crit ? "crit" : "");
    fx.burst(e.x, e.y + e.def.h * 0.55, e.z, crit ? 0xffe066 : 0xffcc99, crit ? 16 : 9, 4.5, 0.4, 0.28);
    const ef = o.effect;
    if (ef && !e.dead && Math.random() < (ef.chance ?? 1)) this.applyEffect(e, ef.type, base);
    return dmg;
  }
  applyEffect(e, type, base){
    const fx = this.g.effects;
    if (type === "frost"){ e.slow = 3; e.slowF = 0.45; fx.burst(e.x, e.y + 1, e.z, 0x9fe0ff, 10, 3, 0.6, 0.3, 1); fx.text(e.x, e.y + e.def.h + 0.8, e.z, "Gelo", "info"); }
    else if (type === "burn"){ e.burn = 4; e.burnDps = Math.max(2, base * 0.15); fx.burst(e.x, e.y + 1, e.z, 0xff7a2a, 10, 3, 0.6, 0.3, -2); fx.text(e.x, e.y + e.def.h + 0.8, e.z, "Fiamme", "info"); }
    else if (type === "bleed"){ e.bleed = 5; e.bleedDps = Math.max(2, base * 0.1); fx.burst(e.x, e.y + 1, e.z, 0xcc2222, 8, 2.5, 0.5, 0.25); fx.text(e.x, e.y + e.def.h + 0.8, e.z, "Sanguina", "info"); }
  }

  // ---------- colpi subiti dal giocatore ----------
  hitPlayer(e, dmg){
    const P = this.g.player, fx = this.g.effects;
    const dealt = P.takeDamage(dmg, { x: e.x, z: e.z });
    if (P.lastGuard.perfect){
      e.stagger(1.3); P.counterT = 1.3; this.hitstop = 0.1; this.g.rig.shake = Math.max(this.g.rig.shake, 0.25);
      fx.text(P.position.x, P.position.y + 2.3, P.position.z, "PARATA!", "parry");
      fx.burst(P.position.x, P.position.y + 1.2, P.position.z, 0xaee0ff, 18, 6, 0.4, 0.3);
    } else if (P.lastGuard.blocked){
      fx.text(P.position.x, P.position.y + 2.2, P.position.z, "Bloccato " + Math.round(dealt), "info");
      fx.burst(P.position.x, P.position.y + 1.2, P.position.z, 0xffffff, 8, 4, 0.3, 0.25);
    } else if (dealt > 0){
      fx.text(P.position.x, P.position.y + 2.2, P.position.z, "-" + Math.round(dealt), "hurt");
      fx.burst(P.position.x, P.position.y + 1.2, P.position.z, 0xff4444, 10, 4, 0.4, 0.28);
      this.g.rig.shake = Math.max(this.g.rig.shake, 0.3); this.g.ui.flash();
    }
    return dealt;
  }

  // ---------- proiettili ----------
  _spriteProj(tex, color, size){
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.set(size, size, 1); return s;
  }
  spawn(kind, pos, dir, o){
    let mesh;
    if (kind === "arrow") mesh = new THREE.Mesh(this.arrowGeo, this.arrowMat);
    else if (kind === "fireball") mesh = this._spriteProj(this.tex.fire, 0xffaa55, 1.4);
    else if (kind === "frostbolt") mesh = this._spriteProj(this.tex.frost, 0xaaddff, 1.1);
    else mesh = this._spriteProj(this.tex.arcane, 0xcc99ff, 1.1);
    mesh.position.set(pos.x, pos.y, pos.z);
    if (kind === "arrow") mesh.lookAt(pos.x + dir.x, pos.y + dir.y, pos.z + dir.z);
    this.g.scene.add(mesh);
    this.proj.push(Object.assign({ kind, mesh, vx: dir.x * o.speed, vy: dir.y * o.speed, vz: dir.z * o.speed, life: o.life ?? 3, gravity: 0, owner: "player", dmg: 10 }, o));
  }
  fireFromPlayer(h){
    const P = this.g.player, cam = this.g.camera, W = P.weapon;
    const origin = { x: P.position.x + h.dx * 0.6, y: P.position.y + 1.4, z: P.position.z + h.dz * 0.6 };
    const look = new THREE.Vector3(); cam.getWorldDirection(look);
    // punto di mira: primo nemico (con piccolo aiuto) o primo punto di terreno lungo la linea della telecamera
    let tp = null;
    for (let d = 2; d <= 60 && !tp; d += 1){
      const x = cam.position.x + look.x * d, y = cam.position.y + look.y * d, z = cam.position.z + look.z * d;
      for (const e of this.g.enemies.active){
        if (!e.dead && Math.hypot(e.x - x, e.z - z) < e.def.radius + 0.6 && y > e.y - 0.4 && y < e.y + e.def.h + 0.6){ tp = new THREE.Vector3(e.x, e.y + e.def.h * 0.55, e.z); break; }
      }
      if (!tp && y < heightAt(x, z) + 0.2) tp = new THREE.Vector3(x, heightAt(x, z) + 0.2, z);
    }
    if (!tp) tp = cam.position.clone().addScaledVector(look, 60);
    const dir = tp.sub(new THREE.Vector3(origin.x, origin.y, origin.z)).normalize();
    if (h.proj === "arrow"){
      const spread = h.aiming ? 0.005 : 0.05;
      dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread; dir.normalize();
      this.spawn("arrow", origin, dir, { speed: 42, gravity: 5, dmg: h.dmg * (h.aiming ? 1.35 : 1), owner: "player", effect: W.effect });
    } else {
      const kind = W.effect && W.effect.type === "burn" ? "fireball" : W.effect && W.effect.type === "frost" ? "frostbolt" : "arcane";
      this.spawn(kind, origin, dir, { speed: 26, dmg: h.dmg, owner: "player", effect: W.effect, life: 2.5 });
    }
  }
  fireFromEnemy(e, dmg, speed = 14){
    const P = this.g.player;
    const o = { x: e.x, y: e.y + e.def.h * 0.75, z: e.z };
    const tx = P.position.x + P.vel.x * 0.25, tz = P.position.z + P.vel.z * 0.25, ty = P.position.y + 1.2;
    const d = new THREE.Vector3(tx - o.x, ty - o.y, tz - o.z).normalize();
    this.spawn("fireball", o, d, { speed, dmg, owner: "enemy", from: e, life: 4 });
  }

  updateProjectiles(dt){
    const g = this.g, P = g.player;
    for (let i = this.proj.length - 1; i >= 0; i--){
      const p = this.proj[i]; p.life -= dt; let dead = p.life <= 0, hitInfo = null;
      const dist = Math.hypot(p.vx, p.vy, p.vz) * dt, n = Math.max(1, Math.ceil(dist / 0.4)), sdt = dt / n, pos = p.mesh.position;
      for (let k = 0; k < n && !dead; k++){
        p.vy -= p.gravity * sdt; pos.x += p.vx * sdt; pos.y += p.vy * sdt; pos.z += p.vz * sdt;
        if (pos.y < heightAt(pos.x, pos.z) || g.collision.blocked(pos.x, pos.z, pos.y, 0.1)){ dead = true; break; }
        if (p.owner === "player"){
          for (const e of g.enemies.active){
            if (e.dead) continue;
            if (Math.hypot(e.x - pos.x, e.z - pos.z) < e.def.radius + 0.3 && pos.y > e.y - 0.2 && pos.y < e.y + e.def.h + 0.2){ hitInfo = e; break; }
          }
          if (hitInfo) dead = true;
        } else if (Math.hypot(P.position.x - pos.x, P.position.z - pos.z) < P.radius + 0.35 && pos.y > P.position.y && pos.y < P.position.y + P.height){
          hitInfo = P; dead = true;
        }
      }
      if (hitInfo && hitInfo !== P) this.damageEnemy(hitInfo, p.dmg, { from: { x: pos.x - p.vx * 0.05, z: pos.z - p.vz * 0.05 }, knock: 2.5, effect: p.effect });
      else if (hitInfo === P) this.hitPlayer(p.from || { x: pos.x, z: pos.z, y: pos.y, def: { h: 1 }, stagger(){} }, p.dmg);
      if (p.kind === "arrow" && !dead) p.mesh.lookAt(pos.x + p.vx, pos.y + p.vy, pos.z + p.vz);
      if (dead){
        g.effects.burst(pos.x, pos.y, pos.z, p.kind === "fireball" ? 0xff8833 : p.kind === "frostbolt" ? 0x99ddff : 0xddccaa, 10, 4, 0.35, 0.3);
        g.scene.remove(p.mesh); if (p.mesh.material && p.kind === "arrow") { /* materiale condiviso */ } else if (p.mesh.material) p.mesh.material.dispose();
        this.proj.splice(i, 1);
      }
    }
  }
}
