// Collisioni 2D (cerchi e box orientati) con altezza, griglia spaziale e piattaforme calpestabili.
// Nessuna dipendenza da Three.js.
export class Collision {
  constructor(cell = 8){ this.cell = cell; this.grid = new Map(); this.owners = new Map(); this.platforms = []; this.stamp = 0; }

  _bounds(c){ const r = c.type === "circle" ? c.r : Math.hypot(c.hw, c.hd); return [c.x - r, c.z - r, c.x + r, c.z + r]; }
  _each(x0, z0, x1, z1, fn){
    const k = this.cell;
    for (let j = Math.floor(z0 / k); j <= Math.floor(z1 / k); j++) for (let i = Math.floor(x0 / k); i <= Math.floor(x1 / k); i++) fn(i + "," + j);
  }
  add(owner, c){
    if (c.type === "box"){ c.cos = Math.cos(c.rot || 0); c.sin = Math.sin(c.rot || 0); }
    const b = this._bounds(c);
    this._each(b[0], b[1], b[2], b[3], key => { let s = this.grid.get(key); if (!s) this.grid.set(key, s = new Set()); s.add(c); });
    let l = this.owners.get(owner); if (!l) this.owners.set(owner, l = []); l.push(c);
  }
  remove(owner){
    const l = this.owners.get(owner); if (!l) return;
    for (const c of l){
      const b = this._bounds(c);
      this._each(b[0], b[1], b[2], b[3], key => { const s = this.grid.get(key); if (s){ s.delete(c); if (!s.size) this.grid.delete(key); } });
    }
    this.owners.delete(owner);
  }
  count(){ let n = 0; for (const l of this.owners.values()) n += l.length; return n; }

  _near(x, z, r, fn){
    const st = ++this.stamp;
    this._each(x - r, z - r, x + r, z + r, key => {
      const s = this.grid.get(key); if (!s) return;
      for (const c of s){ if (c._q === st) continue; c._q = st; fn(c); }
    });
  }

  // Spinge pos {x,y,z} fuori dai solidi. Ritorna true se c'è stato contatto.
  resolve(pos, radius, height){
    let hit = false;
    for (let it = 0; it < 2; it++){
      this._near(pos.x, pos.z, radius + 1, c => {
        if (pos.y >= c.y1 - 0.05 || pos.y + height <= c.y0) return;
        if (c.type === "circle"){
          let dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz); const m = radius + c.r;
          if (d >= m) return;
          if (d < 1e-6){ dx = 1; dz = 0; d = 1; }
          pos.x += dx / d * (m - d + 1e-4); pos.z += dz / d * (m - d + 1e-4); hit = true;
        } else {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const lx = c.cos * dx - c.sin * dz, lz = c.sin * dx + c.cos * dz;
          const qx = Math.max(-c.hw, Math.min(c.hw, lx)), qz = Math.max(-c.hd, Math.min(c.hd, lz));
          let ox = lx - qx, oz = lz - qz, d = Math.hypot(ox, oz), px, pz;
          if (d > 1e-6){ if (d >= radius) return; px = ox / d * (radius - d); pz = oz / d * (radius - d); }
          else { // centro dentro il box: esci dal lato più vicino
            const ex = c.hw - Math.abs(lx), ez = c.hd - Math.abs(lz);
            if (ex < ez){ px = Math.sign(lx || 1) * (ex + radius); pz = 0; } else { px = 0; pz = Math.sign(lz || 1) * (ez + radius); }
          }
          pos.x += c.cos * px + c.sin * pz; pos.z += -c.sin * px + c.cos * pz; hit = true;
        }
      });
    }
    return hit;
  }

  // Un punto (con margine) è dentro un solido? Usata dalla telecamera.
  blocked(x, z, y, margin = 0.3){
    let b = false;
    this._near(x, z, margin + 1, c => {
      if (b || y >= c.y1 || y <= c.y0) return;
      if (c.type === "circle") b = Math.hypot(x - c.x, z - c.z) < c.r + margin;
      else {
        const dx = x - c.x, dz = z - c.z, lx = c.cos * dx - c.sin * dz, lz = c.sin * dx + c.cos * dz;
        b = Math.abs(lx) < c.hw + margin && Math.abs(lz) < c.hd + margin;
      }
    });
    return b;
  }

  addPlatform(p){ p.cos = Math.cos(p.rot || 0); p.sin = Math.sin(p.rot || 0); this.platforms.push(p); }
  // Altezza del suolo: terreno oppure piattaforma raggiungibile (step-up massimo 0.7 m).
  groundAt(x, z, y, terrainH){
    let g = terrainH;
    for (const p of this.platforms){
      const dx = x - p.x, dz = z - p.z, lx = p.cos * dx - p.sin * dz, lz = p.sin * dx + p.cos * dz;
      if (Math.abs(lx) > p.hw || Math.abs(lz) > p.hd) continue;
      const s = p.yAt(lx);
      if (y >= s - 0.7 && s > g) g = s;
    }
    return g;
  }
}
