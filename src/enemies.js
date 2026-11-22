import * as THREE from "three";
import { heightAt, WATER_LEVEL, WORLD_HALF, POIS, mulberry32, regionAt } from "./terrain.js";

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

// h = altezza (m), radius = raggio di collisione, windup/recover/cd in secondi.
// attack: melee | lunge (scatto) | slam (area) | cast (proiettile).  drops: [item, probabilità, min, max]
export const TYPES = {
  wolf:     { name: "Lupo oscuro",     model: "creatures/wolves/dire_wolf.glb",         h: 1.1, hp: 40,  dmg: 8,  speed: 6.5, detect: 24, range: 1.8, radius: 0.55, attack: "lunge", windup: 0.45, recover: 0.5,  cd: 1.4, lunge: 10, flank: true, xp: 20, drops: [["gold", 0.6, 1, 4], ["pelt", 0.5, 1, 1]] },
  goblin:   { name: "Goblin",          model: "characters/enemies/goblin.glb",          h: 1.2, hp: 30,  dmg: 6,  speed: 4.6, detect: 18, range: 1.5, radius: 0.4,  attack: "melee", windup: 0.4,  recover: 0.45, cd: 1.1, xp: 15, drops: [["gold", 0.8, 2, 8], ["health_potion", 0.08, 1, 1]] },
  skeleton: { name: "Scheletro",       model: "creatures/skeletons/draugr_skeleton.glb",h: 1.9, hp: 55,  dmg: 11, speed: 3.6, detect: 16, range: 2.0, radius: 0.45, attack: "melee", windup: 0.55, recover: 0.6,  cd: 1.4, xp: 25, drops: [["bone", 0.7, 1, 2], ["gold", 0.5, 2, 10]] },
  troll:    { name: "Troll del gelo",  model: "creatures/trolls/ice_troll.glb",         h: 3.2, hp: 240, dmg: 30, speed: 3.0, detect: 20, range: 3.0, radius: 1.0,  attack: "slam",  windup: 1.0,  recover: 0.9,  cd: 2.4, aoe: 3.6, armor: true, xp: 140, drops: [["gold", 1, 20, 50], ["iron_ore", 0.6, 1, 3], ["health_potion", 0.35, 1, 1]] },
  orc:      { name: "Orco",            model: "characters/enemies/orc.glb",             h: 2.2, hp: 120, dmg: 17, speed: 4.2, detect: 20, range: 2.2, radius: 0.6,  attack: "melee", windup: 0.5,  recover: 0.55, cd: 1.2, xp: 65, drops: [["gold", 1, 8, 25], ["iron_ore", 0.3, 1, 2], ["health_potion", 0.2, 1, 1]] },
  spider:   { name: "Ragno gigante",   model: "creatures/monsters/giant_spider.glb",    h: 1.1, hp: 60,  dmg: 9,  speed: 5.6, detect: 20, range: 1.8, radius: 0.7,  attack: "lunge", windup: 0.35, recover: 0.5,  cd: 1.3, lunge: 8, xp: 35, drops: [["silk", 0.7, 1, 2], ["gold", 0.4, 1, 6]] },
  darkmage: { name: "Mago oscuro",     model: "characters/enemies/necromancer.glb",     h: 2.0, hp: 75,  dmg: 15, speed: 3.8, detect: 26, range: 18,  radius: 0.45, attack: "cast",  windup: 0.8,  recover: 0.5,  cd: 2.3, keepDist: [8, 15], xp: 85, drops: [["mana_potion", 0.4, 1, 1], ["gold", 1, 10, 30]] },
};

export const ITEMS = {
  gold:          { name: "Oro",                 color: 0xffd34d },
  health_potion: { name: "Pozione di vita",     color: 0xff4455, model: "items/potions/health_potion.glb", h: 0.4 },
  mana_potion:   { name: "Pozione di mana",     color: 0x4d88ff },
  iron_ore:      { name: "Minerale di ferro",   color: 0xb0b8c0, model: "items/resources/iron_ore.glb", h: 0.4 },
  pelt:          { name: "Pelliccia di lupo",   color: 0x9a7a55 },
  bone:          { name: "Osso",                color: 0xeeeeee },
  silk:          { name: "Seta di ragno",       color: 0xd8f0d8 },
};

// Gruppi di nemici per regione (posizioni approssimative: ogni punto viene aggiustato sul terreno).
const GROUPS = [
  ["wolf", 3, -130, 170, 14], ["wolf", 3, 110, 150, 14], ["goblin", 3, -20, 205, 12], ["skeleton", 2, 60, 5, 10], ["troll", 1, 160, 40, 4],
  ["goblin", 5, -250, -40, 14], ["wolf", 4, -320, 70, 16], ["spider", 3, -345, -55, 10], ["skeleton", 4, -290, 50, 12], ["darkmage", 1, -285, 30, 4], ["orc", 2, -230, 90, 8],
  ["orc", 3, 370, -30, 10], ["skeleton", 3, 300, 170, 10], ["darkmage", 2, 345, 55, 8], ["goblin", 3, 235, 185, 10],
  ["troll", 2, 30, -225, 10], ["orc", 3, -40, -245, 10], ["skeleton", 5, 0, -195, 12], ["darkmage", 2, 25, -265, 8], ["spider", 3, -30, -175, 10],
];
const SAFE = [[-45, 70, 55], [290, 100, 80], [340, 10, 50]]; // nessun nemico vicino a villaggio, città e castello
const ACTIVATE = 120, DEACTIVATE = 165;

export function buildSpawns(){
  const rng = mulberry32(4242), out = []; let gi = 0;
  for (const [type, n, cx, cz, spread] of GROUPS){
    for (let k = 0; k < n; k++){
      let x, z, ok = false;
      for (let t = 0; t < 20 && !ok; t++){
        x = cx + (rng() - 0.5) * 2 * spread; z = cz + (rng() - 0.5) * 2 * spread;
        ok = heightAt(x, z) > WATER_LEVEL + 0.8 && Math.abs(x) < WORLD_HALF - 30 && Math.abs(z) < WORLD_HALF - 30
          && !SAFE.some(([sx, sz, sr]) => Math.hypot(x - sx, z - sz) < sr);
      }
      if (ok) out.push({ id: `g${gi}_${k}`, type, x, z, group: gi });
    }
    gi++;
  }
  return out;
}

class Enemy {
  constructor(m, def, spawn){
    this.m = m; this.def = def; this.spawn = spawn; this.id = spawn.id; this.group = spawn.group;
    this.x = spawn.x; this.z = spawn.z; this.y = heightAt(this.x, this.z); this.home = { x: spawn.x, z: spawn.z };
    this.hp = def.hp; this.maxHp = def.hp; this.state = "idle"; this.t = 0; this.cd = Math.random(); this.facing = Math.random() * 6.28;
    this.dead = false; this.slow = 0; this.slowF = 1; this.burn = 0; this.burnDps = 0; this.bleed = 0; this.bleedDps = 0; this.dotT = 0;
    this.kx = 0; this.kz = 0; this.hurtT = 0; this.phase = Math.random() * 6; this.wanderT = 1 + Math.random() * 3; this.wander = null;
    this.avoid = 0; this.avoidT = 0; this.stuckT = 0; this.struck = false; this.dashT = 0; this.dashHit = false; this.side = Math.random() < 0.5 ? -1 : 1; this.ring = null; this.tD = 0;
    // grafica: pivot al centro del corpo
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    const md = m.models[spawn.type];
    this.mesh = new THREE.Mesh(md.geometry, md.material); this.mesh.scale.setScalar(def.h / md.height); this.mesh.position.y = -def.h / 2;
    this.mesh.castShadow = true; this.body.add(this.mesh);
    const w = Math.max(0.9, def.radius * 1.8);
    this.barBg = new THREE.Sprite(m.barBgMat); this.barFg = new THREE.Sprite(m.barFgMat.clone());
    this.barBg.scale.set(w, 0.12, 1); this.barFg.scale.set(w, 0.09, 1); this.barFg.material.center.set(0, 0.5); this.barFg.position.x = -w / 2; this.barW = w;
    this.barBg.position.y = this.barFg.position.y = def.h + 0.6; this.barBg.visible = this.barFg.visible = false;
    this.root.add(this.barBg, this.barFg);
    this._sync(); m.scene.add(this.root);
  }

  aggro(fromAlly = false){
    if (this.dead || this.state === "chase" || this.state === "attack" || this.state === "alert" || this.state === "stagger") return;
    this.state = "alert"; this.t = 0;
    if (!fromAlly) for (const o of this.m.active) if (o !== this && o.group === this.group && !o.dead && Math.hypot(o.x - this.x, o.z - this.z) < 25) o.aggro(true);
  }
  stagger(d){ if (this.dead) return; this.state = "stagger"; this.t = 0; this.stagDur = d; this.ring = null; }

  takeDamage(dmg, from, knock, o = {}){
    if (this.dead) return;
    this.hp -= dmg; this.hurtT = 0.22;
    if (from && knock){
      const dx = this.x - (from.x ?? this.x), dz = this.z - (from.z ?? this.z), l = Math.hypot(dx, dz) || 1, k = knock * (this.def.armor ? 0.25 : 1);
      this.kx = dx / l * k; this.kz = dz / l * k;
    }
    if (this.hp <= 0){ this.die(); return; }
    if (this.state === "idle" || this.state === "return") this.aggro();
    if (this.state === "attack" && (!this.def.armor || o.heavy)){ this.stagger(0.35); }
    else if ((this.state === "chase" || this.state === "alert") && o.heavy) this.stagger(0.4);
  }
  die(){ this.dead = true; this.state = "dead"; this.tD = 0; this.barBg.visible = this.barFg.visible = false; this.m.onDeath(this); }

  update(dt){
    const m = this.m, P = m.player, d = this.def;
    this.cd -= dt; this.t += dt; this.hurtT = Math.max(0, this.hurtT - dt);
    // stati alterati
    if (this.slow > 0) this.slow -= dt;
    this.dotT += dt;
    if (this.dotT >= 0.5 && !this.dead){
      this.dotT = 0; let dot = 0;
      if (this.burn > 0){ this.burn -= 0.5; dot += this.burnDps * 0.5; }
      if (this.bleed > 0){ this.bleed -= 0.5; dot += this.bleedDps * 0.5; }
      if (dot > 0){ this.hp -= dot; m.fx.text(this.x, this.y + d.h + 0.2, this.z, String(Math.max(1, Math.round(dot))), "dot"); if (this.hp <= 0){ this.die(); return; } }
    }
    if (this.dead){
      this.tD += dt; this._anim(dt); if (this.tD > 3) this.root.position.y -= dt * 0.6; return;
    }
    // knockback
    if (Math.abs(this.kx) + Math.abs(this.kz) > 0.05){ this._step(this.kx * dt, this.kz * dt, d.radius); const f = Math.exp(-dt * 7); this.kx *= f; this.kz *= f; }

    const dx = P.position.x - this.x, dz = P.position.z - this.z, dist = Math.hypot(dx, dz), homeD = Math.hypot(this.home.x - this.x, this.home.z - this.z);
    const target = !P.dead;

    switch (this.state){
      case "idle": {
        this.wanderT -= dt;
        if (this.wanderT <= 0){ const a = Math.random() * 6.28, r = Math.random() * 6; this.wander = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r }; this.wanderT = 3 + Math.random() * 4; }
        if (this.wander){ const wx = this.wander.x - this.x, wz = this.wander.z - this.z; if (Math.hypot(wx, wz) > 0.8) this._move(wx, wz, d.speed * 0.3, dt); else this.wander = null; }
        if (target && dist < d.detect * m.detectMult) this.aggro();
        break;
      }
      case "alert": {
        this._face(dx, dz, dt, 10);
        if (this.t > 0.5){ this.state = "chase"; this.t = 0; }
        break;
      }
      case "return": {
        const hx = this.home.x - this.x, hz = this.home.z - this.z;
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.2 * dt);
        if (Math.hypot(hx, hz) < 1.5){ this.state = "idle"; this.hp = this.maxHp; } else this._move(hx, hz, d.speed, dt);
        if (target && dist < d.detect * 0.7 * m.detectMult) this.aggro();
        break;
      }
      case "chase": {
        if (!target || dist > d.detect * 2.2 || homeD > 75){ this.state = "return"; break; }
        let mx = dx, mz = dz, sp = d.speed;
        if (d.keepDist){
          if (dist < d.keepDist[0]){ mx = -dx; mz = -dz; sp *= 0.9; }
          else if (dist <= d.keepDist[1]){ mx = -dz * this.side; mz = dx * this.side; sp *= 0.45; if (Math.random() < dt * 0.3) this.side *= -1; }
          if (this.cd <= 0 && dist < d.range && dist > 4) { this._startAttack(dx, dz); break; }
        } else {
          if (d.flank && dist > d.range + 0.5 && dist < 9){ // i lupi aggirano il bersaglio
            const a = Math.atan2(-dz, -dx) + this.side * 0.9, tx = P.position.x + Math.cos(a) * d.range * 1.3, tz = P.position.z + Math.sin(a) * d.range * 1.3;
            mx = tx - this.x; mz = tz - this.z;
          }
          if (dist <= d.range * 0.95 && this.cd <= 0){ this._startAttack(dx, dz); break; }
          if (dist <= d.range * 0.8) sp = 0;
        }
        if (sp > 0) this._move(mx, mz, sp, dt); else this._face(dx, dz, dt, 12);
        break;
      }
      case "attack": this._attack(dt, dx, dz, dist); break;
      case "stagger": if (this.t >= (this.stagDur || 0.35)){ this.state = "chase"; this.cd = Math.max(this.cd, 0.3); } break;
    }
    // separazione dai compagni e dal giocatore
    this._separate(P);
    this.y += (m.col.groundAt(this.x, this.z, this.y, heightAt(this.x, this.z)) - this.y) * Math.min(1, dt * 18);
    this._anim(dt);
  }

  _startAttack(dx, dz){
    const d = this.def;
    this.state = "attack"; this.t = 0; this.struck = false; this.dashT = 0; this.dashHit = false;
    this.facing = Math.atan2(dx, dz);
    if (d.attack === "slam") this.ring = this.m.fx.telegraph(this.x + Math.sin(this.facing) * 0.5, this.z + Math.cos(this.facing) * 0.5, d.aoe, d.windup);
  }
  _attack(dt, dx, dz, dist){
    const d = this.def, P = this.m.player, m = this.m;
    if (this.t < d.windup * 0.7 && d.attack !== "slam") this._face(dx, dz, dt, 14); // si orienta, poi si blocca
    if (!this.struck && this.t >= d.windup){
      this.struck = true;
      if (d.attack === "melee"){
        const f = { x: Math.sin(this.facing), z: Math.cos(this.facing) };
        if (dist < d.range + P.radius + 0.3 && (dx * f.x + dz * f.z) / (dist || 1) > 0.25) m.combat.hitPlayer(this, d.dmg);
      } else if (d.attack === "lunge"){ this.dashT = 0.28; }
      else if (d.attack === "slam"){
        m.fx.burst(this.x + Math.sin(this.facing) * 1.5, this.y + 0.3, this.z + Math.cos(this.facing) * 1.5, 0xddeeff, 24, 7, 0.6, 0.5);
        const cx = this.x + Math.sin(this.facing) * 0.5, cz = this.z + Math.cos(this.facing) * 0.5;
        if (Math.hypot(P.position.x - cx, P.position.z - cz) < d.aoe + P.radius && P.position.y - this.y < 1.2) m.combat.hitPlayer(this, d.dmg);
        m.rig.shake = Math.max(m.rig.shake, 0.4);
      } else if (d.attack === "cast") m.combat.fireFromEnemy(this, d.dmg);
    }
    if (this.dashT > 0){
      this.dashT -= dt; const f = { x: Math.sin(this.facing), z: Math.cos(this.facing) };
      this._step(f.x * d.lunge * dt, f.z * d.lunge * dt, d.radius);
      if (!this.dashHit && dist < d.range + P.radius + 0.2){ this.dashHit = true; m.combat.hitPlayer(this, d.dmg); }
    }
    if (this.t >= d.windup + d.recover){ this.state = "chase"; this.cd = d.cd; this.ring = null; }
  }

  _face(dx, dz, dt, k){ this.facing += angDiff(this.facing, Math.atan2(dx, dz)) * (1 - Math.exp(-dt * k)); }

  _move(dx, dz, speed, dt){
    const l = Math.hypot(dx, dz); if (l < 1e-4) return;
    let mx = dx / l, mz = dz / l; this._face(dx, dz, dt, 10);
    if (this.avoidT > 0){ const c = Math.cos(this.avoid), s = Math.sin(this.avoid), nx = mx * c - mz * s; mz = mx * s + mz * c; mx = nx; this.avoidT -= dt; }
    const sp = speed * (this.slow > 0 ? this.slowF : 1), dist = sp * dt;
    const moved = this._step(mx * dist, mz * dist, this.def.radius);
    this.phase += sp * dt * 1.4; this.speedNow = sp;
    if (moved < dist * 0.3){ this.stuckT += dt; if (this.stuckT > 0.3){ this.avoid = (Math.random() < 0.5 ? 1 : -1) * 1.1; this.avoidT = 0.7; this.stuckT = 0; } } else this.stuckT = 0;
  }
  // Passo con collisioni e limite di pendenza. Ritorna la distanza percorsa.
  _step(dx, dz, radius){
    const len = Math.hypot(dx, dz); if (len < 1e-6) return 0;
    const n = Math.max(1, Math.ceil(len / 0.25)), sx = dx / n, sz = dz / n, step = len / n; let moved = 0; const lim = WORLD_HALF - 3;
    for (let k = 0; k < n; k++){
      const nx = this.x + sx, nz = this.z + sz, rise = this.m.col.groundAt(nx, nz, this.y, heightAt(nx, nz)) - this.y;
      if (rise > 0.4 && rise > step * 1.6) break;
      const t = { x: nx, y: this.y, z: nz }; this.m.col.resolve(t, radius, this.def.h);
      this.x = clamp(t.x, -lim, lim); this.z = clamp(t.z, -lim, lim); moved += step;
    }
    return moved;
  }
  _separate(P){
    for (const o of this.m.active){
      if (o === this || o.dead) continue;
      const dx = this.x - o.x, dz = this.z - o.z, min = this.def.radius + o.def.radius, d = Math.hypot(dx, dz);
      if (d < min && d > 1e-4){ const p = (min - d) * 0.5; this.x += dx / d * p; this.z += dz / d * p; }
    }
    const dx = this.x - P.position.x, dz = this.z - P.position.z, min = this.def.radius + P.radius, d = Math.hypot(dx, dz);
    if (d < min && d > 1e-4){ const p = (min - d); this.x += dx / d * p * 0.7; this.z += dz / d * p * 0.7; P.position.x -= dx / d * p * 0.15; P.position.z -= dz / d * p * 0.15; }
  }

  _sync(){ this.root.position.set(this.x, this.y + (this.dead && this.tD > 3 ? -(this.tD - 3) * 0.6 : 0), this.z); this.root.rotation.y = this.facing; }

  _anim(dt){
    const d = this.def, b = this.body; let rx = 0, rz = 0, by = d.h / 2, sy = 1;
    const moving = (this.state === "chase" || this.state === "idle" || this.state === "return") && (this.speedNow || 0) > 0.3;
    this.speedNow = 0;
    if (moving){ by += Math.abs(Math.sin(this.phase)) * 0.07 * d.h; rz = Math.sin(this.phase) * 0.07; rx = 0.08; }
    else sy = 1 + Math.sin(this.m.time * 2 + this.phase) * 0.012;
    if (this.state === "alert"){ const u = clamp(this.t / 0.5, 0, 1); sy = 1 + 0.12 * Math.sin(u * Math.PI); rx = -0.2 * Math.sin(u * Math.PI); }
    if (this.state === "attack"){
      const u = clamp(this.t / d.windup, 0, 1), r = clamp((this.t - d.windup) / d.recover, 0, 1);
      if (this.t < d.windup){
        rx = -0.45 * u * u; if (d.attack === "slam") by += 0.35 * u * d.h * 0.3; if (d.attack === "cast") by += 0.1 * u;
      } else rx = (d.attack === "lunge" ? 0.7 : 0.55) * (1 - easeOut(r));
    }
    if (this.state === "stagger"){ rx = -0.4 * (1 - clamp(this.t / (this.stagDur || 0.35), 0, 1)); rz = Math.sin(this.t * 40) * 0.08; }
    if (this.hurtT > 0) sy *= 1 + this.hurtT * 0.5;
    if (this.dead){ const u = easeOut(this.tD / 0.6); rx = -u * (Math.PI / 2 - 0.1); by = d.h / 2 - u * d.h * 0.32; }
    b.position.y = by; b.rotation.set(rx, 0, rz); b.scale.set(1, sy, 1);
    this._sync();
    // barra della vita
    const show = !this.dead && (this.hp < this.maxHp || this.state === "chase" || this.state === "attack" || this.state === "alert" || this.state === "stagger");
    const near = Math.hypot(this.x - this.m.player.position.x, this.z - this.m.player.position.z) < 40;
    this.barBg.visible = this.barFg.visible = show && near;
    if (show){ const f = clamp(this.hp / this.maxHp, 0, 1); this.barFg.scale.x = Math.max(0.001, this.barW * f); }
  }
}

export class Enemies {
  constructor(game){
    this.g = game; this.scene = game.scene; this.assets = game.assets; this.col = game.collision; this.player = game.player;
    this.active = []; this.byId = new Map(); this.killed = new Set(); this.spawns = buildSpawns(); this.loot = [];
    this.models = {}; this.itemModels = {}; this.time = 0; this.detectMult = 1; this.kills = {};
    this.barBgMat = new THREE.SpriteMaterial({ color: 0x120808, transparent: true, depthTest: false, opacity: 0.8 });
    this.barFgMat = new THREE.SpriteMaterial({ color: 0xd8372c, transparent: true, depthTest: false });
    this.lootSprite = null;
  }
  get fx(){ return this.g.effects; } get combat(){ return this.g.combat; } get rig(){ return this.g.rig; }
  get col_(){ return this.col; }

  async init(){
    await Promise.all([
      ...Object.entries(TYPES).map(async ([k, t]) => { this.models[k] = await this.assets.loadModel(t.model); }),
      ...Object.entries(ITEMS).filter(([, v]) => v.model).map(async ([k, v]) => { this.itemModels[k] = await this.assets.loadModel(v.model); }),
    ]);
    this.sparkTex = await this.assets.loadTexture("effects/particles/glow_spark.png");
  }

  nearestInCone(x, z, dx, dz, range){
    let best = null, bd = 1e9;
    for (const e of this.active){
      if (e.dead) continue;
      const ex = e.x - x, ez = e.z - z, d = Math.hypot(ex, ez);
      if (d > range + e.def.radius || (ex * dx + ez * dz) / (d || 1) < 0.5) continue;
      if (d < bd){ bd = d; best = e; }
    }
    return best;
  }

  _spawn(sp){
    const e = new Enemy(this, TYPES[sp.type], sp); this.active.push(e); this.byId.set(sp.id, e); return e;
  }
  _despawn(e){
    this.scene.remove(e.root); e.barFg.material.dispose();
    this.active.splice(this.active.indexOf(e), 1); this.byId.delete(e.id);
  }

  update(dt){
    this.time += dt;
    const P = this.player.position;
    for (const sp of this.spawns){
      if (this.killed.has(sp.id) || this.byId.has(sp.id)) continue;
      if (Math.hypot(sp.x - P.x, sp.z - P.z) < ACTIVATE) this._spawn(sp);
    }
    for (const e of [...this.active]){
      if (e.dead && e.tD > 6){ this._despawn(e); continue; }
      if (!e.dead && Math.hypot(e.x - P.x, e.z - P.z) > DEACTIVATE && (e.state === "idle" || e.state === "return")){ this._despawn(e); continue; }
      e.update(dt);
    }
    this._updateLoot(dt);
  }

  onDeath(e){
    this.killed.add(e.id);
    this.kills[e.spawn.type] = (this.kills[e.spawn.type] || 0) + 1;
    const P = this.player;
    P.addXP(e.def.xp); P.kills++;
    this.fx.text(e.x, e.y + e.def.h + 0.9, e.z, "+" + e.def.xp + " XP", "xp");
    this.fx.burst(e.x, e.y + e.def.h * 0.5, e.z, 0xffffff, 14, 3.5, 0.6, 0.3, 1);
    for (const [item, chance, min, max] of e.def.drops){
      if (Math.random() > chance) continue;
      const n = min + Math.floor(Math.random() * (max - min + 1));
      this._drop(item, n, e.x + (Math.random() - 0.5) * 1.5, e.z + (Math.random() - 0.5) * 1.5);
    }
    this.g.emit("kill", { type: e.spawn.type, id: e.id, x: e.x, z: e.z });
  }

  _drop(item, n, x, z){
    const def = ITEMS[item], root = new THREE.Group(), y = heightAt(x, z) + 0.5;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkTex, color: def.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    spr.scale.set(1.0, 1.0, 1); root.add(spr);
    const md = this.itemModels[item];
    if (md){ const m = new THREE.Mesh(md.geometry, md.material); m.scale.setScalar(def.h / md.height); m.castShadow = true; root.add(m); }
    else { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), new THREE.MeshBasicMaterial({ color: def.color })); m.position.y = 0.1; root.add(m); }
    root.position.set(x, y, z); this.scene.add(root);
    this.loot.push({ item, n, root, spr, t: 0, base: y - 0.5 });
  }
  _updateLoot(dt){
    const P = this.player;
    for (let i = this.loot.length - 1; i >= 0; i--){
      const l = this.loot[i]; l.t += dt;
      l.root.position.y = l.base + 0.55 + Math.sin(l.t * 3) * 0.1; l.root.rotation.y += dt * 1.5;
      const d = Math.hypot(P.position.x - l.root.position.x, P.position.z - l.root.position.z);
      if (d < 4 && !P.dead){ const k = Math.min(1, dt * 4); l.root.position.x += (P.position.x - l.root.position.x) * k; l.root.position.z += (P.position.z - l.root.position.z) * k; l.base += (P.position.y - l.base) * k; }
      if ((d < 1.4 && !P.dead) || l.t > 120){
        if (d < 1.4){
          P.bag[l.item] = (P.bag[l.item] || 0) + l.n;
          this.fx.text(P.position.x, P.position.y + 2.2, P.position.z, "+" + l.n + " " + ITEMS[l.item].name, "loot");
          this.g.emit("pickup", { item: l.item, n: l.n });
        }
        this.scene.remove(l.root); l.spr.material.dispose(); this.loot.splice(i, 1);
      }
    }
  }
}
