import * as THREE from "three";
import { heightAt, SPAWN, WORLD_HALF, WATER_LEVEL } from "./terrain.js";
import { WEAPONS } from "./equipment.js";

const MODEL = "characters/player/warrior_player.glb";
const SHIELD = "weapons/shields/iron_shield.glb";

const RADIUS = 0.4, HEIGHT = 1.8, GRAVITY = 24, JUMP_V = 8.8;
const WALK = 3.6, RUN = 7.0, DODGE_DUR = 0.5, DODGE_SPEED = 16, DODGE_COST = 22;
// Attacchi. 0-2 = combo leggera, 3 = pesante (F), 4 = contrattacco (dopo parata a tempo), 5 = tiro con l'arco, 6 = dardo del bastone.
// pose: 0/1/2 = fendenti, 3 = a distanza. hit = finestra (s) di colpo attivo.
const ATTACKS = [
  { dur: 0.50, hit: [0.26, 0.40], dmg: 1.0, lunge: 3.5, cost: 10, pose: 0 },
  { dur: 0.50, hit: [0.26, 0.40], dmg: 1.1, lunge: 3.5, cost: 10, pose: 1 },
  { dur: 0.78, hit: [0.38, 0.52], dmg: 1.8, lunge: 5.0, cost: 18, pose: 2 },
  { dur: 0.95, hit: [0.50, 0.65], dmg: 2.6, lunge: 6.0, cost: 26, pose: 2, heavy: true, range: 1.15 },
  { dur: 0.60, hit: [0.18, 0.30], dmg: 3.2, lunge: 5.0, cost: 0,  pose: 0, counter: true },
  { dur: 0.55, hit: [0.22, 0.30], dmg: 1.0, lunge: 0,   cost: 8,  pose: 3, ranged: "arrow" },
  { dur: 0.55, hit: [0.20, 0.28], dmg: 1.0, lunge: 0,   cost: 0,  pose: 3, ranged: "bolt" },
];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = t => { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export class Player {
  constructor(scene, assets, input, collision){
    this.assets = assets; this.input = input; this.col = collision;
    this.object = new THREE.Group(); scene.add(this.object);
    this.position = this.object.position;
    this.radius = RADIUS; this.height = HEIGHT;

    // statistiche base (la Fase 5 le collega a livello, equipaggiamento e abilità)
    this.stats = { hp: 100, maxHp: 100, mp: 50, maxMp: 50, stamina: 100, maxStamina: 100 };
    this.weaponId = "steel_longsword"; this.weapon = WEAPONS[this.weaponId]; this.guardMult = 0.2;
    this.dmgMult = 1; this.critBonus = 0; // bonus da statistiche/equipaggiamento (Fase 5)
    this.bag = { gold: 0, health_potion: 2 }; this.xp = 0; this.kills = 0; // provvisori: l'inventario vero arriva in Fase 5
    this.atk = 0; this.counterT = 0; this.aiming = false; this.lastGuard = { blocked: false, perfect: false }; this.findTarget = null;

    this.vel = { x: 0, z: 0 }; this.vy = 0; this.grounded = true;
    this.state = "free"; // free | attack | dodge | hit | dead
    this.blocking = false; this.exhausted = false; this.tBlock = 0; this.parryWindow = false;
    this.facing = Math.PI; this.t = 0; this.stepPhase = 0;
    this.combo = 0; this.comboReset = 0; this.tA = 0; this.queued = false; this.hitDone = false;
    this.tD = 0; this.dodgeDir = { x: 0, z: 1 }; this.tH = 0; this.invuln = 0; this.regenDelay = 0;
    this.squash = 0; this.pending = null; this.inWater = false; this.slashT = 0;
    this.pose = { rx: 0, rz: 0, ry: 0, sy: 1, by: 0, sw: [0.6, 0, -0.25], shield: [-0.5, 0.05, 0.1, 0, 0.2] };
    this.respawn(true);
  }

  async load(){
    const [pm, hm] = await Promise.all([this.assets.loadModel(MODEL), this.assets.loadModel(SHIELD)]);
    this.wm = {};
    await Promise.all(Object.entries(WEAPONS).map(async ([id, w]) => { this.wm[id] = await this.assets.loadModel(w.model); }));
    // corpo: pivot al centro per rotazioni e rotolata
    this.body = new THREE.Group(); this.body.position.y = HEIGHT / 2; this.object.add(this.body);
    const mesh = new THREE.Mesh(pm.geometry, pm.material);
    mesh.scale.setScalar(HEIGHT / pm.height); mesh.position.y = -HEIGHT / 2; mesh.castShadow = mesh.receiveShadow = true;
    this.body.add(mesh);
    // spada (mano destra) e scudo (braccio sinistro): modelli reali del manifest
    this.swordPivot = new THREE.Group(); this.body.add(this.swordPivot);
    this.weaponMesh = new THREE.Mesh(); this.weaponMesh.castShadow = true; this.swordPivot.add(this.weaponMesh);
    this.shieldPivot = new THREE.Group(); this.body.add(this.shieldPivot);
    const shield = new THREE.Mesh(hm.geometry, hm.material); shield.scale.setScalar(0.9 / hm.height); shield.position.y = -0.45; shield.castShadow = true; this.shieldPivot.add(shield);
    // scia della spada
    const arc = Math.PI * 0.8;
    const g = new THREE.RingGeometry(0.7, 1.7, 20, 1, Math.PI * 1.5 - arc / 2, arc);
    this.slash = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    this.slash.rotation.x = -Math.PI / 2; this.slash.position.set(0, 1.0, 0.2); this.slash.visible = false;
    this.slashHolder = new THREE.Group(); this.slashHolder.add(this.slash); this.object.add(this.slashHolder);
    this.setWeapon(this.weaponId);
    this._animate(0.016);
  }

  setWeapon(id){
    const w = WEAPONS[id]; if (!w) return false;
    this.weaponId = id; this.weapon = w;
    const m = this.wm && this.wm[id];
    if (m && this.weaponMesh){ this.weaponMesh.geometry = m.geometry; this.weaponMesh.material = m.material; this.weaponMesh.scale.setScalar(w.len / m.height); }
    const shield = !w.twoHanded && w.type !== "bow" && w.type !== "staff";
    if (this.shieldPivot) this.shieldPivot.visible = shield;
    this.guardMult = shield ? 0.2 : 0.5;
    this.combo = 0; this.comboReset = 0;
    return true;
  }
  addXP(n){ this.xp += n; } // la Fase 5 aggiunge livelli e punti abilità

  respawn(first = false){
    this.position.set(SPAWN.x, heightAt(SPAWN.x, SPAWN.z), SPAWN.z);
    this.vel.x = this.vel.z = 0; this.vy = 0; this.grounded = true; this.state = "free";
    const s = this.stats; s.hp = s.maxHp; s.mp = s.maxMp; s.stamina = s.maxStamina; this.exhausted = false;
    this.invuln = first ? 0 : 2; this.combo = 0; this.pending = null; this.counterT = 0;
    if (this.body) this.body.rotation.set(0, 0, 0);
  }

  get cameraTarget(){ return new THREE.Vector3(this.position.x, this.position.y + 1.5, this.position.z); }
  get forward(){ return { x: Math.sin(this.facing), z: Math.cos(this.facing) }; }
  get dead(){ return this.state === "dead"; }
  get speed(){ return Math.hypot(this.vel.x, this.vel.z); }
  // Per il combattimento (Fase 4): restituisce una sola volta il colpo attivo.
  takePendingHit(){ const h = this.pending; this.pending = null; return h; }

  spendStamina(n){ this.stats.stamina = Math.max(0, this.stats.stamina - n); this.regenDelay = 0.8; if (this.stats.stamina <= 0) this.exhausted = true; }
  heal(n){ this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + n); }

  // Ritorna il danno effettivamente subito. fromPos = {x,z} dell'attaccante (serve alla parata).
  // this.lastGuard.perfect = parata a tempo (nessun danno, abilita il contrattacco).
  takeDamage(amount, fromPos){
    this.lastGuard = { blocked: false, perfect: false };
    if (this.state === "dead" || this.invuln > 0) return 0;
    let dmg = amount, blocked = false;
    if (this.blocking && fromPos){
      const dx = fromPos.x - this.position.x, dz = fromPos.z - this.position.z, l = Math.hypot(dx, dz) || 1, f = this.forward;
      if ((dx * f.x + dz * f.z) / l > 0.3){
        const perfect = this.tBlock < 0.3;
        if (this.stats.stamina >= amount * 0.8){
          blocked = true; dmg = perfect ? 0 : amount * this.guardMult; this.spendStamina(perfect ? amount * 0.2 : amount * 0.8);
          this.lastGuard = { blocked: true, perfect };
        } else { dmg = amount * 0.6; this.stats.stamina = 0; this.exhausted = true; }
      }
    }
    this.stats.hp = Math.max(0, this.stats.hp - dmg);
    this.invuln = this.lastGuard.perfect ? 0.3 : 0.5; this.regenDelay = 1.2;
    if (this.stats.hp <= 0){ this.state = "dead"; this.tH = 0; this.pending = null; }
    else if (!blocked){
      this.state = "hit"; this.tH = 0;
      if (fromPos){ const dx = this.position.x - fromPos.x, dz = this.position.z - fromPos.z, l = Math.hypot(dx, dz) || 1; this.vel.x = dx / l * 5; this.vel.z = dz / l * 5; }
    }
    return dmg;
  }

  // ------------------------------------------------------------------
  update(dt, camYaw){
    const i = this.input, st = this.stats;
    this.t += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.regenDelay = Math.max(0, this.regenDelay - dt);
    this.comboReset = Math.max(0, this.comboReset - dt);
    if (this.comboReset === 0 && this.state !== "attack") this.combo = 0;
    this.slashT = Math.max(0, this.slashT - dt);

    if (this.state === "dead"){
      this.tH += dt; this.vel.x *= 0.9; this.vel.z *= 0.9; this._vertical(dt);
      if (i.pressed("KeyR") && this.tH > 1) this.respawn();
      this._animate(dt); return;
    }

    // direzione desiderata rispetto alla telecamera
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const f = (i.down("KeyW") ? 1 : 0) - (i.down("KeyS") ? 1 : 0), r = (i.down("KeyD") ? 1 : 0) - (i.down("KeyA") ? 1 : 0);
    let ix = fx * f - fz * r, iz = fz * f + fx * r; const il = Math.hypot(ix, iz);
    if (il > 0){ ix /= il; iz /= il; }
    const hasInput = il > 0, camAngle = Math.atan2(fx, fz);

    // acqua bassa: rallenta
    const g0 = this.col.groundAt(this.position.x, this.position.z, this.position.y, heightAt(this.position.x, this.position.z));
    this.inWater = g0 < WATER_LEVEL - 0.1 && this.position.y < WATER_LEVEL + 0.2;

    this.blocking = false; this.aiming = false;
    const W = this.weapon;
    this.counterT = Math.max(0, this.counterT - dt);
    let accel = this.grounded ? 48 : 9, tx = 0, tz = 0;
    if (i.pressed("KeyH") && this.bag.health_potion > 0 && st.hp < st.maxHp){ this.bag.health_potion--; this.heal(45); }

    if (this.state === "free"){
      const guard = W.type !== "bow" && i.down("Mouse2") && this.grounded && st.stamina > 0 && !this.exhausted;
      const aim = W.type === "bow" && i.down("Mouse2") && this.grounded;
      this.blocking = guard; this.aiming = aim; this.tBlock = guard ? this.tBlock + dt : 0;
      let atk = -1;
      if (i.pressed("Mouse0") && this.grounded && !guard){
        if (W.type === "bow") atk = 5;
        else if (W.type === "staff" && st.mp >= W.boltCost) atk = 6;
        else atk = this.counterT > 0 ? 4 : this.combo;
      } else if (i.pressed("KeyF") && this.grounded && !guard && !W.ranged) atk = 3;
      if (i.pressed("KeyQ") && this.grounded && st.stamina >= DODGE_COST) this._startDodge(hasInput ? { x: ix, z: iz } : { x: -fx, z: -fz });
      else if (atk >= 0 && st.stamina >= ATTACKS[atk].cost) this._startAttack(camAngle, atk);
      else {
        if (i.pressed("Space") && this.grounded && st.stamina >= 8 && !guard){ this.vy = JUMP_V; this.grounded = false; this.spendStamina(8); }
        const running = (i.down("ShiftLeft") || i.down("ShiftRight")) && hasInput && !this.exhausted && st.stamina > 0 && !guard && !aim && this.grounded;
        let sp = running ? RUN : WALK;
        if (guard) sp *= 0.4;
        if (aim) sp *= 0.5;
        if (this.inWater) sp *= 0.6;
        if (running) this.spendStamina(10 * dt);
        tx = ix * sp; tz = iz * sp;
        const want = (guard || aim) ? camAngle : (hasInput ? Math.atan2(ix, iz) : this.facing);
        this.facing += angDiff(this.facing, want) * (1 - Math.exp(-dt * ((guard || aim) ? 18 : 12)));
      }
    }

    if (this.state === "attack"){
      const a = ATTACKS[this.atk]; this.tA += dt * W.speed;
      if (i.pressed("Mouse0") && this.tA > a.dur * 0.3 && this.atk < 2 && !W.ranged) this.queued = true;
      if (!this.hitDone && this.tA >= a.hit[0]){
        this.hitDone = true;
        const o = this.position, fw = this.forward, heavy = !!a.heavy;
        const base = (a.ranged === "bolt" ? W.boltDamage : W.damage) * a.dmg * this.dmgMult;
        this.pending = { atk: this.atk, heavy, counter: !!a.counter, proj: a.ranged || null, dmg: base, aiming: this.aimShot,
          x: o.x, y: o.y, z: o.z, dx: fw.x, dz: fw.z, range: W.reach * (a.range || 1) * (this.atk === 2 ? 1.1 : 1), arc: heavy ? Math.PI * 0.9 : Math.PI * 0.75, effect: W.effect || null };
        this.slashT = a.hit[1] - a.hit[0] + 0.2;
        if (a.counter) this.counterT = 0;
      }
      const lunge = a.lunge * Math.pow(Math.max(0, 1 - this.tA / (a.dur * 0.5)), 2);
      tx = Math.sin(this.facing) * lunge; tz = Math.cos(this.facing) * lunge; accel = 80;
      if (this.tA >= a.dur){
        if (this.queued && this.atk < 2 && st.stamina >= ATTACKS[this.atk + 1].cost){ this.combo = this.atk + 1; this._startAttack(camAngle, this.combo); }
        else { this.state = "free"; this.comboReset = 0.5; this.combo = this.atk < 2 ? this.atk + 1 : 0; this.queued = false; }
      }
    } else if (this.state === "dodge"){
      this.tD += dt;
      const k = Math.pow(1 - clamp(this.tD / DODGE_DUR, 0, 1), 2), v = 4 + (DODGE_SPEED - 4) * k;
      tx = this.dodgeDir.x * v; tz = this.dodgeDir.z * v; accel = 120;
      this.facing += angDiff(this.facing, Math.atan2(this.dodgeDir.x, this.dodgeDir.z)) * (1 - Math.exp(-dt * 25));
      if (this.tD >= DODGE_DUR) this.state = "free";
    } else if (this.state === "hit"){
      this.tH += dt; accel = 20; if (this.tH > 0.35) this.state = "free";
    }

    // velocità orizzontale con accelerazione
    const dvx = tx - this.vel.x, dvz = tz - this.vel.z, dl = Math.hypot(dvx, dvz), step = accel * dt;
    if (dl <= step){ this.vel.x = tx; this.vel.z = tz; } else { this.vel.x += dvx / dl * step; this.vel.z += dvz / dl * step; }

    this._moveHoriz(dt);
    this._vertical(dt);

    // recupero stamina e rigenerazione lenta
    const sprinting = this.speed > RUN - 0.5 && this.grounded;
    if (this.state !== "dodge" && this.state !== "attack" && !sprinting && this.regenDelay <= 0){
      st.stamina = Math.min(st.maxStamina, st.stamina + (this.blocking ? 8 : 22) * dt);
      if (this.exhausted && st.stamina >= 25) this.exhausted = false;
    }
    st.mp = Math.min(st.maxMp, st.mp + 1.0 * dt);
    st.hp = Math.min(st.maxHp, st.hp + 0.4 * dt);

    this.object.rotation.y = this.facing;
    if (this.grounded) this.stepPhase += this.speed * dt * 1.5;
    this._animate(dt);
  }

  _startAttack(camAngle, idx){
    const a = ATTACKS[idx], W = this.weapon, st = this.stats;
    this.atk = idx; this.state = "attack"; this.tA = 0; this.queued = false; this.hitDone = false; this.aimShot = this.aiming;
    if (a.cost) this.spendStamina(a.cost);
    if (a.ranged === "bolt") st.mp -= W.boltCost;
    let face = camAngle; // si attacca dove guarda la telecamera, con un po' di aggancio al bersaglio vicino
    if (!W.ranged && this.findTarget){
      const t = this.findTarget(this.position.x, this.position.z, Math.sin(camAngle), Math.cos(camAngle), 4.5);
      if (t) face = Math.atan2(t.x - this.position.x, t.z - this.position.z);
    }
    this.facing = face; this.comboReset = 1.0;
  }
  _startDodge(dir){ this.state = "dodge"; this.tD = 0; this.dodgeDir = dir; this.spendStamina(DODGE_COST); this.invuln = Math.max(this.invuln, 0.38); this.queued = false; }

  // Movimento orizzontale a sotto-passi: slittamento sugli ostacoli, limite di pendenza, bordi del mondo.
  _moveHoriz(dt){
    const dx = this.vel.x * dt, dz = this.vel.z * dt, len = Math.hypot(dx, dz);
    if (len < 1e-6) return;
    const n = Math.max(1, Math.ceil(len / 0.2)), sx = dx / n, sz = dz / n, p = this.position, lim = WORLD_HALF - 3;
    for (let k = 0; k < n; k++){
      if (!this._try(p.x + sx, p.z + sz, Math.hypot(sx, sz))){
        if (!this._try(p.x + sx, p.z, Math.abs(sx))) this._try(p.x, p.z + sz, Math.abs(sz));
      }
      p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
    }
  }
  _try(nx, nz, run){
    const p = this.position;
    if (run < 1e-6) return false;
    const rise = this.col.groundAt(nx, nz, p.y, heightAt(nx, nz)) - p.y;
    if (rise > 0.4 && rise > run * 1.6) return false; // troppo ripido: si comporta da muro
    const test = { x: nx, y: p.y, z: nz };
    this.col.resolve(test, RADIUS, HEIGHT);
    if (Math.hypot(test.x - nx, test.z - nz) > run * 0.9 + 0.05) return false; // bloccato frontalmente
    p.x = test.x; p.z = test.z; return true;
  }

  _vertical(dt){
    const p = this.position;
    const g = this.col.groundAt(p.x, p.z, p.y, heightAt(p.x, p.z));
    if (this.grounded){
      if (p.y - g > 0.7) this.grounded = false; // cade da un bordo
      else { p.y += (g - p.y) * Math.min(1, dt * 30); if (Math.abs(g - p.y) < 0.005) p.y = g; }
    }
    if (!this.grounded){
      this.vy = Math.max(-45, this.vy - GRAVITY * dt); p.y += this.vy * dt;
      if (p.y <= g){
        const impact = -this.vy; p.y = g; this.vy = 0; this.grounded = true;
        this.squash = clamp(impact / 20, 0, 1);
        if (impact > 20 && this.state !== "dead") this.takeDamage((impact - 20) * 4);
      }
    }
  }

  // ------------------------------------------------------------------
  // Animazione procedurale (i modelli proxy non hanno scheletro né clip).
  _animate(dt){
    if (!this.body) return;
    const P = this.pose, sp = this.speed, walk = this.grounded ? clamp(sp / 4, 0, 1) : 0, run = clamp((sp - 4) / 3, 0, 1), ph = this.stepPhase;
    this.squash = Math.max(0, this.squash - dt * 4);
    let rx = 0.06 + run * 0.2, rz = Math.sin(ph) * 0.06 * walk, ry = 0;
    let by = Math.abs(Math.sin(ph)) * (0.05 + 0.05 * run) * walk;
    let sy = 1 + Math.sin(this.t * 2) * 0.008 - this.squash * 0.15;
    let sw = [0.6 + Math.sin(ph) * 0.15 * walk, 0, -0.25 + Math.cos(ph) * 0.1 * walk];
    let sh = [-0.5, 0.05, 0.1, 0, 0.2]; // scudo: x, y, z, rotX, rotY
    if (!this.grounded){ sy = 1 + clamp(this.vy / 9, -1, 1) * 0.07; rx = 0.1; sw = [0.2, 0, -0.5]; }
    if (this.blocking){ rx = 0.02; by = -0.08; sh = [0, 0.15, 0.5, 0, 0]; sw = [0.9, 0, -0.5]; }

    if (this.state === "attack"){
      const a = ATTACKS[this.atk], u = this.tA / a.dur, c = a.pose === 3 ? 2 : a.pose;
      const wind = clamp(u / 0.3, 0, 1), strike = clamp((u - 0.3) / 0.3, 0, 1), rec = clamp((u - 0.6) / 0.4, 0, 1);
      const A = c === 0 ? [0.9, 0, -1.8] : c === 1 ? [0.9, 0, 1.2] : [-1.5, 0, 0];
      const B = c === 0 ? [0.9, 0, 1.2] : c === 1 ? [0.9, 0, -1.8] : [1.9, 0, 0];
      const idle = [0.6, 0, -0.25];
      sw = [0, 0, 0];
      for (let k = 0; k < 3; k++){
        sw[k] = u < 0.3 ? lerp(idle[k], A[k], easeInOut(wind)) : lerp(lerp(A[k], B[k], easeOut(strike)), idle[k], easeInOut(rec));
      }
      const dir = c === 0 ? 1 : c === 1 ? -1 : 0;
      ry = dir * (u < 0.3 ? -0.5 * wind : lerp(-0.5, 0.7, easeOut(strike)) * (1 - rec));
      rx = c === 2 ? (u < 0.3 ? -0.15 * wind : 0.3 * easeOut(strike) * (1 - rec)) : 0.12;
    }
    if (this.state === "attack" && ATTACKS[this.atk].pose === 3){ // tiro / incantesimo
      const a = ATTACKS[this.atk], u = clamp(this.tA / a.dur, 0, 1), k = Math.sin(u * Math.PI);
      sw = this.weapon.type === "staff" ? [1.0 + 0.5 * k, 0, 0] : [0.15, 0, -0.1]; rx = -0.12 * k; ry = 0; sh = [-0.5, 0.05, 0.1, 0, 0.2];
    } else if (this.aiming){ sw = [0.15, 0, -0.1]; rx = 0.02; }
    if (this.state === "dodge"){
      const u = clamp(this.tD / DODGE_DUR, 0, 1);
      rx = easeInOut(u) * Math.PI * 2; by = -0.3 * Math.sin(u * Math.PI); sy = 0.85;
      sw = [1.2, 0, -0.6]; sh = [-0.2, 0, 0.2, 0, 0.5];
    }
    if (this.state === "hit"){ const u = clamp(this.tH / 0.35, 0, 1); rx = -0.35 * (1 - u); by = -0.1 * (1 - u); }
    if (this.state === "dead"){ const u = easeOut(this.tH / 0.8); rx = -u * (Math.PI / 2 - 0.1); by = -u * 0.55; sw = [0.2, 0, -1.2]; }

    const snap = this.state === "attack" || this.state === "dodge", k = snap ? 1 : 1 - Math.exp(-dt * 18);
    P.rx += (rx - P.rx) * k; P.rz += (rz - P.rz) * k; P.ry += (ry - P.ry) * k; P.sy += (sy - P.sy) * k; P.by += (by - P.by) * k;
    for (let n = 0; n < 3; n++) P.sw[n] += (sw[n] - P.sw[n]) * k;
    for (let n = 0; n < 5; n++) P.shield[n] += (sh[n] - P.shield[n]) * (1 - Math.exp(-dt * 18));

    const b = this.body;
    b.position.y = HEIGHT / 2 * P.sy + P.by; b.scale.y = P.sy;
    b.rotation.set(P.rx, P.ry, P.rz);
    this.swordPivot.position.set(0.5, 0.05, 0.15); this.swordPivot.rotation.set(P.sw[0], P.sw[1], P.sw[2]);
    this.shieldPivot.position.set(P.shield[0], P.shield[1], P.shield[2]); this.shieldPivot.rotation.set(P.shield[3], P.shield[4], 0);

    // scia della spada: visibile durante la finestra di colpo
    const on = this.slashT > 0 && this.state === "attack" && !ATTACKS[this.atk].ranged;
    this.slash.visible = on;
    if (on){
      const a = ATTACKS[this.atk], total = a.hit[1] - a.hit[0] + 0.2, u = 1 - this.slashT / total, big = a.heavy || a.pose === 2 ? 1.3 : 1;
      this.slash.material.opacity = 0.75 * (1 - u);
      this.slashHolder.scale.set((a.pose === 1 ? -1 : 1) * big, big, big);
      this.slashHolder.rotation.z = a.pose === 2 ? 0.9 : (a.pose === 0 ? 0.25 : -0.25);
    }
  }
}
