import * as THREE from "three";
import {
  CHUNK, WORLD_HALF, WATER_LEVEL, POIS, riverX,
  heightAt, regionWeights, vnoise, smoothstep, mulberry32, chunkSeed, poiClearance,
} from "./terrain.js";

// Percorsi reali (verificati nel manifest).
const MODELS = {
  pine: "environments/forests/snow_pine.glb",
  house: "environments/villages/nordic_house.glb",
  boulder: "environments/terrain/granite_boulder.glb",
  arch: "environments/ruins/ancient_arch.glb",
  stalagmite: "environments/caves/stalagmite.glb",
  pillar: "environments/dungeons/dungeon_pillar.glb",
  tower: "environments/castles/stone_tower.glb",
};
const TEXTURES = {
  grass: "textures/terrain/grass_albedo.png",
  snow: "textures/snow/snow_albedo.png",
  rock: "textures/stone/mountain_rock_albedo.png",
  dirt: "textures/terrain/dirt_albedo.png",
  stone: "textures/stone/medieval_stone_albedo.png",
  wood: "textures/wood/nordic_wood_albedo.png",
};
const FIRE_SPRITE = "effects/fire/fire_particle.png";

// Oggetti sparsi: n = tentativi per chunk, h = altezza in metri.
const SCATTER = [
  { key: "pine", region: "frost_valley", n: 55, h: [7, 12], tree: true },
  { key: "boulder", region: "frost_valley", n: 6, h: [1.2, 3] },
  { key: "pine", region: "dark_forest", n: 130, h: [8, 15], tree: true, tint: [0.45, 0.55, 0.45] },
  { key: "boulder", region: "dark_forest", n: 8, h: [1.2, 3.5] },
  { key: "stalagmite", region: "dark_forest", n: 3, h: [1.5, 3.5] },
  { key: "pine", region: "kingdom_ash", n: 14, h: [6, 10], tree: true, tint: [0.8, 0.75, 0.7] },
  { key: "boulder", region: "kingdom_ash", n: 6, h: [1.2, 3] },
  { key: "boulder", region: "dragon_mountain", n: 16, h: [2, 6] },
  { key: "stalagmite", region: "dragon_mountain", n: 9, h: [2, 6] },
];

const SEG = 32;
const lerp = (a, b, t) => a + (b - a) * t;

export class World {
  constructor(scene, assets, quality, collision){
    this.scene = scene; this.assets = assets; this.q = quality; this.col = collision;
    this.chunks = new Map();
    this.models = {}; this.tex = {};
    this.group = new THREE.Group(); scene.add(this.group);
    this.maxIndex = Math.ceil(WORLD_HALF / CHUNK) - 1; // chunk validi: da -5 a 4
  }

  async init(status){
    status("Caricamento modelli e texture…", 0.1);
    await Promise.all([
      ...Object.entries(MODELS).map(async ([k, p]) => { this.models[k] = await this.assets.loadModel(p); }),
      ...Object.entries(TEXTURES).map(async ([k, p]) => { this.tex[k] = await this.assets.loadTexture(p); }),
      this.assets.loadTexture(FIRE_SPRITE),
    ]);
    this._makeTerrainMaterial();
    this._makeWater();
    this._buildPOIs();
  }

  // Materiale terreno: 4 texture albedo miscelate con pesi per-vertice (splat) + tinta per regione.
  _makeTerrainMaterial(){
    const t = this.tex;
    const mat = new THREE.MeshStandardMaterial({ map: t.grass, vertexColors: true, roughness: 0.95, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tGrass = { value: t.grass }; sh.uniforms.tSnow = { value: t.snow };
      sh.uniforms.tRock = { value: t.rock }; sh.uniforms.tDirt = { value: t.dirt };
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSplat = splat;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec4 vSplat;\nuniform sampler2D tGrass;\nuniform sampler2D tSnow;\nuniform sampler2D tRock;\nuniform sampler2D tDirt;")
        .replace("#include <map_fragment>", `
          vec2 tuv = vMapUv;
          vec4 sc = texture2D(tGrass, tuv) * vSplat.x + texture2D(tSnow, tuv * 0.8) * vSplat.y
                  + texture2D(tRock, tuv * 0.6) * vSplat.z + texture2D(tDirt, tuv) * vSplat.w;
          diffuseColor *= sc;`);
    };
    this.terrainMat = mat;
  }

  _makeWater(){
    const g = new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2); g.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x2e6f95, transparent: true, opacity: 0.78, roughness: 0.12, metalness: 0.2 }));
    this.water.position.y = WATER_LEVEL; this.water.receiveShadow = true;
    this.scene.add(this.water);
  }

  // ---------- Terreno a chunk (normali dalla griglia con bordo: nessuna cucitura) ----------
  _terrainChunk(cx, cz){
    const x0 = cx * CHUNK, z0 = cz * CHUNK, step = CHUNK / SEG, N = SEG + 1, B = SEG + 3;
    const hs = new Float32Array(B * B);
    for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) hs[j * B + i] = heightAt(x0 + (i - 1) * step, z0 + (j - 1) * step);
    const pos = new Float32Array(N * N * 3), nor = new Float32Array(N * N * 3), uv = new Float32Array(N * N * 2);
    const col = new Float32Array(N * N * 3), spl = new Float32Array(N * N * 4);
    const tints = { frost_valley: [0.92, 0.96, 1.0], dark_forest: [0.5, 0.62, 0.5], kingdom_ash: [0.78, 0.76, 0.74], dragon_mountain: [0.55, 0.45, 0.42] };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++){
      const v = j * N + i, x = x0 + i * step, z = z0 + j * step, h = hs[(j + 1) * B + (i + 1)];
      pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z;
      const hx = hs[(j + 1) * B + i] - hs[(j + 1) * B + i + 2], hz = hs[j * B + i + 1] - hs[(j + 2) * B + i + 1];
      const l = Math.hypot(hx, 2 * step, hz);
      nor[v * 3] = hx / l; nor[v * 3 + 1] = 2 * step / l; nor[v * 3 + 2] = hz / l;
      uv[v * 2] = x / 10; uv[v * 2 + 1] = z / 10;
      const w = regionWeights(x, z), nn = vnoise(x * 0.05, z * 0.05);
      const slope = 1 - nor[v * 3 + 1];
      const bank = 1 - smoothstep(6, 20, Math.abs(x - riverX(z)));
      const dirt = Math.min(1, w.kingdom_ash * 0.6 + w.dragon_mountain * 0.6 + bank * w.frost_valley * 0.7 + (nn > 0.62 ? 0.3 : 0));
      const snow = Math.min(1, smoothstep(24, 36, h + nn * 5) + 0.6 * w.frost_valley);
      const rock = smoothstep(0.16, 0.38, slope);
      let c = [1, 0, 0, 0];
      const mix = (t, k) => { c = c.map((q, n) => lerp(q, n === k ? 1 : 0, t)); };
      mix(dirt, 3); mix(snow, 1); mix(rock, 2);
      spl.set(c, v * 4);
      let r = 0, g = 0, b = 0;
      for (const k in tints){ r += tints[k][0] * w[k]; g += tints[k][1] * w[k]; b += tints[k][2] * w[k]; }
      const sh = 0.9 + nn * 0.2; col[v * 3] = r * sh; col[v * 3 + 1] = g * sh; col[v * 3 + 2] = b * sh;
    }
    const idx = new Uint32Array(SEG * SEG * 6); let p = 0;
    for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++){
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("splat", new THREE.BufferAttribute(spl, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, this.terrainMat); m.receiveShadow = true;
    return m;
  }

  // ---------- Istanze (1 draw call per tipo di oggetto per chunk) ----------
  _instanced(key, list, shadow = true){
    const m = this.models[key]; if (!list.length) return null;
    const im = new THREE.InstancedMesh(m.geometry, m.material, list.length);
    const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const color = new THREE.Color(); let hasColor = false;
    list.forEach((it, i) => {
      e.set(it.tilt || 0, it.rot, 0); q.setFromEuler(e);
      s.setScalar(it.h / m.height); p.set(it.x, it.y, it.z);
      im.setMatrixAt(i, mat.compose(p, q, s));
      if (it.tint){ color.setRGB(it.tint[0], it.tint[1], it.tint[2]); im.setColorAt(i, color); hasColor = true; }
    });
    if (hasColor && im.instanceColor) im.instanceColor.needsUpdate = true;
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = shadow; im.receiveShadow = true;
    im.frustumCulled = false; // il bounding sphere base non copre le istanze
    return im;
  }

  // Collisione di un oggetto, dimensionata sulla bounding box reale del modello.
  _propCollider(owner, key, it){
    const m = this.models[key], s = it.h / m.height, w = m.width * s, d = m.depth * s, y0 = it.y, y1 = it.y + it.h;
    if (key === "pine") this.col.add(owner, { type: "circle", x: it.x, z: it.z, r: Math.max(0.3, it.h * 0.035), y0, y1 });
    else if (key === "boulder" || key === "stalagmite") this.col.add(owner, { type: "circle", x: it.x, z: it.z, r: Math.max(0.3, Math.max(w, d) * 0.4), y0, y1 });
    else if (key === "pillar" || key === "tower") this.col.add(owner, { type: "circle", x: it.x, z: it.z, r: Math.max(0.5, Math.max(w, d) * 0.45), y0, y1 });
    else if (key === "house") this.col.add(owner, { type: "box", x: it.x, z: it.z, hw: Math.max(1, w * 0.45), hd: Math.max(1, d * 0.45), rot: it.rot, y0, y1 });
    // "arch": volutamente senza collisione (si attraversa)
  }

  _scatter(cx, cz){
    const owner = cx + "," + cz;
    const rng = mulberry32(chunkSeed(cx, cz)), buckets = {};
    for (const rule of SCATTER){
      for (let k = 0; k < rule.n; k++){
        const x = cx * CHUNK + rng() * CHUNK, z = cz * CHUNK + rng() * CHUNK;
        const accept = rng(), hh = lerp(rule.h[0], rule.h[1], rng()), rot = rng() * Math.PI * 2, br = 0.85 + rng() * 0.3, tl = rng();
        if (Math.abs(x) > WORLD_HALF - 20 || Math.abs(z) > WORLD_HALF - 20) continue;
        if (accept > regionWeights(x, z)[rule.region]) continue;
        const y = heightAt(x, z);
        if (y < WATER_LEVEL + 0.8 || !poiClearance(x, z, 4)) continue;
        if (rule.tree){
          const sl = Math.abs(heightAt(x + 1.5, z) - y) + Math.abs(heightAt(x, z + 1.5) - y);
          if (sl > 1.6 || y > 38) continue;
        }
        const t = rule.tint ? rule.tint.map(c => c * br) : (rule.tree ? [br, br, br] : null);
        const item = { x, y: y - 0.1, z, h: hh, rot, tint: t, tilt: rule.key === "boulder" ? (tl - 0.5) * 0.4 : 0 };
        (buckets[rule.key] ||= []).push(item); this._propCollider(owner, rule.key, item);
      }
    }
    return Object.entries(buckets).map(([k, l]) => this._instanced(k, l)).filter(Boolean);
  }

  _buildChunk(cx, cz){
    const grp = new THREE.Group();
    const terrain = this._terrainChunk(cx, cz); grp.add(terrain);
    const props = this._scatter(cx, cz); props.forEach(p => grp.add(p));
    this.group.add(grp);
    this.chunks.set(cx + "," + cz, { grp, terrain, props, cx, cz });
  }
  _unloadChunk(key){
    const c = this.chunks.get(key); if (!c) return;
    this.col.remove(key); this.group.remove(c.grp); c.terrain.geometry.dispose(); c.props.forEach(p => p.dispose());
    this.chunks.delete(key);
  }

  // Caricamento progressivo: al massimo `budget` chunk per chiamata, prima i più vicini. Ritorna i chunk ancora mancanti.
  update(px, pz, budget = 2){
    const R = this.q.radius, ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK), want = [];
    for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++){
      const cx = ccx + dx, cz = ccz + dz;
      if (cx < -this.maxIndex - 1 || cx > this.maxIndex || cz < -this.maxIndex - 1 || cz > this.maxIndex) continue;
      const d = Math.hypot((cx + 0.5) * CHUNK - px, (cz + 0.5) * CHUNK - pz) / CHUNK;
      if (d <= R + 0.5) want.push({ cx, cz, d });
    }
    for (const [k, c] of [...this.chunks]){
      const d = Math.hypot((c.cx + 0.5) * CHUNK - px, (c.cz + 0.5) * CHUNK - pz) / CHUNK;
      if (d > R + 1.6) this._unloadChunk(k);
    }
    const missing = want.filter(w => !this.chunks.has(w.cx + "," + w.cz)).sort((a, b) => a.d - b.d);
    const n = Math.min(budget, missing.length);
    for (let i = 0; i < n; i++) this._buildChunk(missing[i].cx, missing[i].cz);
    return missing.length - n;
  }

  async preload(px, pz, status){
    let total = 0, left = 1;
    while (left > 0){
      left = this.update(px, pz, 3);
      total = Math.max(total, left + this.chunks.size);
      status(`Generazione terreno (${this.chunks.size}/${total})…`, 0.4 + 0.55 * (this.chunks.size / total));
      await new Promise(r => setTimeout(r, 0));
    }
  }

  tick(t){ this.water.material.color.setHSL(0.56, 0.45, 0.33 + Math.sin(t * 0.8) * 0.01); }

  // ---------- Punti di interesse (strutture sempre presenti: poche istanze) ----------
  _buildPOIs(){
    const P = { house: [], boulder: [], arch: [], stalagmite: [], pillar: [], tower: [] };
    const put = (key, x, z, h, face) => { const it = { x, y: heightAt(x, z) - 0.05, z, h, rot: face ?? 0 }; P[key].push(it); this._propCollider("static", key, it); };
    const ring = (key, p, n, r, h, start = 0) => {
      for (let i = 0; i < n; i++){
        const a = start + (i / n) * Math.PI * 2, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        put(key, x, z, h, Math.atan2(p.x - x, p.z - z));
      }
    };
    const stoneMat = new THREE.MeshStandardMaterial({ map: this.tex.stone, roughness: 0.9 });
    const woodMat = new THREE.MeshStandardMaterial({ map: this.tex.wood, roughness: 0.85 });
    const box = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; this.group.add(m);
      this.col.add("static", { type: "box", x, z, hw: w / 2, hd: d / 2, rot: 0, y0: y - h / 2, y1: y + h / 2 });
    };

    for (const p of POIS){
      const gy = p.h;
      if (p.type === "village"){ ring("house", p, 6, p.radius * 0.55, 5); put("boulder", p.x, p.z, 1.6); }
      else if (p.type === "ruins"){ ring("arch", p, 5, p.radius * 0.6, 7); ring("pillar", p, 8, p.radius * 0.85, 5, 0.2); }
      else if (p.type === "cave"){ ring("stalagmite", p, 8, 6, 4); ring("boulder", p, 5, 9, 3, 0.3); }
      else if (p.type === "city"){ ring("house", p, 9, p.radius * 0.45, 5.5); ring("house", p, 14, p.radius * 0.8, 5.5, 0.2); put("tower", p.x, p.z, 16); }
      else if (p.type === "castle"){
        const d = p.radius * 0.6, t = 2.4, hgt = 9, gate = 8, seg = d - gate / 2;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) put("tower", p.x + sx * d, p.z + sz * d, 18);
        box(2 * d, hgt, t, p.x, gy + hgt / 2, p.z - d, stoneMat);
        box(t, hgt, 2 * d, p.x - d, gy + hgt / 2, p.z, stoneMat);
        box(t, hgt, 2 * d, p.x + d, gy + hgt / 2, p.z, stoneMat);
        box(seg, hgt, t, p.x - gate / 2 - seg / 2, gy + hgt / 2, p.z + d, stoneMat);
        box(seg, hgt, t, p.x + gate / 2 + seg / 2, gy + hgt / 2, p.z + d, stoneMat);
        box(gate, 2.5, t, p.x, gy + hgt - 1.25, p.z + d, stoneMat);
        box(16, 20, 16, p.x, gy + 10, p.z - d * 0.3, stoneMat); // mastio
      }
      else if (p.type === "dungeon"){ ring("pillar", p, 6, 9, 9); put("arch", p.x, p.z + 12, 10); }
      else if (p.type === "camp"){
        for (let i = 0; i < 3; i++){
          const a = i * 2.1, x = p.x + Math.cos(a) * 6, z = p.z + Math.sin(a) * 6;
          const tent = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.8, 4), woodMat);
          tent.position.set(x, heightAt(x, z) + 1.4, z); tent.rotation.y = a; tent.castShadow = true; this.group.add(tent);
          this.col.add("static", { type: "circle", x, z, r: 1.8, y0: heightAt(x, z), y1: heightAt(x, z) + 2.8 });
        }
        this._campfire(p.x, gy, p.z);
        this.col.add("static", { type: "circle", x: p.x, z: p.z, r: 0.7, y0: gy, y1: gy + 1.2 });
      }
      else if (p.type === "bridge") this._bridge(p, woodMat);
    }
    for (const [k, l] of Object.entries(P)){ const im = this._instanced(k, l); if (im) this.group.add(im); }
  }

  _campfire(x, y, z){
    const t = this.assets.textures.get(FIRE_SPRITE);
    Promise.resolve(t).then(map => {
      if (map){
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: 0xffaa55, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        s.scale.set(2.2, 2.8, 1); s.position.set(x, y + 1.3, z); this.group.add(s);
      }
      const l = new THREE.PointLight(0xff8833, 12, 18, 2); l.position.set(x, y + 1.8, z); this.group.add(l);
    });
  }

  // Ponte di legno sul fiume (procedurale). Impalcato inclinato tra le due rive, calpestabile; parapetti solidi.
  _bridge(p, mat){
    const z = p.z, cx = riverX(z), L = 40;
    const yL = heightAt(cx - L / 2, z) + 0.1, yR = heightAt(cx + L / 2, z) + 0.1; // piano calpestabile = riva + 0.3
    const slope = (yR - yL) / L, mid = (yL + yR) / 2;
    const grp = new THREE.Group(); grp.position.set(cx, mid, z); grp.rotation.z = Math.atan(slope);
    const mk = (w, h, d, x, yy, zz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, yy, zz); m.castShadow = m.receiveShadow = true; grp.add(m); };
    mk(L, 0.4, 5, 0, 0, 0);
    for (const s of [-1, 1]) mk(L, 0.2, 0.3, 0, 1.1, s * 2.4);
    for (let i = -L / 2 + 1; i <= L / 2; i += 4) for (const s of [-1, 1]) mk(0.35, 1.2, 0.35, i, 0.6, s * 2.4);
    this.group.add(grp);
    this.col.addPlatform({ x: cx, z, hw: L / 2, hd: 2.2, rot: 0, yAt: lx => mid + lx * slope + 0.2 });
    for (const s of [-1, 1]) this.col.add("static", { type: "box", x: cx, z: z + s * 2.4, hw: L / 2, hd: 0.2, rot: 0, y0: Math.min(yL, yR) - 0.2, y1: Math.max(yL, yR) + 1.4 });
  }

  stats(){
    let inst = 0; for (const c of this.chunks.values()) c.props.forEach(p => { inst += p.count; });
    return { chunks: this.chunks.size, instances: inst };
  }
}
