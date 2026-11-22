// Funzioni pure del terreno (nessuna dipendenza da Three.js): altezza, regioni, punti di interesse.
export const SEED = 1337;
export const WORLD_HALF = 450;
export const CHUNK = 100;
export const WATER_LEVEL = 1.5;

export function smoothstep(a, b, x){ const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
export function mulberry32(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function chunkSeed(cx, cz){ return Math.imul(cx + 1000, 73856093) ^ Math.imul(cz + 1000, 19349663) ^ SEED; }

function hash(ix, iz){
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + SEED | 0;
  h = Math.imul(h ^ h >>> 13, 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function vnoise(x, z){
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, oct = 4){ let s = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++){ s += a * vnoise(x, z); n += a; x *= 2.03; z *= 2.03; a *= 0.5; } return s / n; }
export function ridged(x, z, oct = 4){ let s = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++){ const r = 1 - Math.abs(2 * vnoise(x, z) - 1); s += a * r * r; n += a; x *= 2.03; z *= 2.03; a *= 0.5; } return s / n; }

export const REGIONS = {
  frost_valley:    { name: "Frost Valley",    x: 0,    z: 90,   sigma: 240 },
  dark_forest:     { name: "Dark Forest",     x: -300, z: 0,    sigma: 190 },
  kingdom_ash:     { name: "Kingdom of Ash",  x: 300,  z: 60,   sigma: 190 },
  dragon_mountain: { name: "Dragon Mountain", x: 0,    z: -300, sigma: 190 },
};
const KEYS = Object.keys(REGIONS);

export function regionWeights(x, z){
  const w = {}; let sum = 0;
  for (const k of KEYS){ const r = REGIONS[k]; const d = Math.hypot(x - r.x, z - r.z) / r.sigma; w[k] = Math.exp(-d * d); sum += w[k]; }
  for (const k of KEYS) w[k] /= sum;
  return w;
}
export function regionAt(x, z){ const w = regionWeights(x, z); let best = KEYS[0]; for (const k of KEYS) if (w[k] > w[best]) best = k; return best; }

// Punti di interesse (usati anche dalla mappa nelle fasi successive).
export const POIS = [
  { id: "frostholm",   name: "Frostholm",       type: "village", region: "frost_valley",    x: -45,  z: 70,   radius: 30, flatten: true },
  { id: "hunter_camp", name: "Hunters Camp",    type: "camp",    region: "frost_valley",    x: -95,  z: 150,  radius: 14, flatten: true },
  { id: "bridge",      name: "Old Bridge",      type: "bridge",  region: "frost_valley",    x: 19,   z: 40,   radius: 6,  flatten: false },
  { id: "ruins",       name: "Whisper Ruins",   type: "ruins",   region: "dark_forest",     x: -290, z: 20,   radius: 24, flatten: true },
  { id: "cave",        name: "Wolf Cave",       type: "cave",    region: "dark_forest",     x: -345, z: -70,  radius: 12, flatten: true },
  { id: "ashgate",     name: "Ashgate",         type: "city",    region: "kingdom_ash",     x: 290,  z: 100,  radius: 55, flatten: true },
  { id: "castle",      name: "Castle of Ash",   type: "castle",  region: "kingdom_ash",     x: 340,  z: 10,   radius: 42, flatten: true },
  { id: "dungeon",     name: "Dragon Maw",      type: "dungeon", region: "dragon_mountain", x: 0,    z: -170, radius: 22, flatten: true },
  { id: "volcano",     name: "Volcano Summit",  type: "summit",  region: "dragon_mountain", x: 0,    z: -300, radius: 20, flatten: false },
];
export const SPAWN = { x: -45, z: 98 };
export const riverX = z => 45 * Math.sin(z * 0.018) - 10;

function baseHeight(x, z){
  const w = regionWeights(x, z);
  const n = fbm(x * 0.008, z * 0.008, 4);
  const r = ridged(x * 0.006 + 50, z * 0.006 - 30, 4);
  const fv = REGIONS.frost_valley, dm = REGIONS.dragon_mountain;
  const dFV = Math.hypot(x - fv.x, z - fv.z);
  const hFV = 8 + n * 5 + r * 95 * smoothstep(110, 230, dFV);
  const hDF = 7 + n * 9;
  const hKA = 6 + n * 5;
  const dDM = Math.hypot(x - dm.x, z - dm.z);
  const cone = Math.max(0, 1 - dDM / 230);
  let hDM = 20 + n * 15 + 110 * Math.pow(cone, 1.4) * (0.7 + 0.3 * r);
  hDM -= 30 * (1 - smoothstep(0, 30, dDM)) * cone;
  let h = hFV * w.frost_valley + hDF * w.dark_forest + hKA * w.kingdom_ash + hDM * w.dragon_mountain;
  const carve = (1 - smoothstep(4, 16, Math.abs(x - riverX(z)))) * w.frost_valley;
  h = h * (1 - carve) + (WATER_LEVEL - 1.0) * carve;
  h += smoothstep(WORLD_HALF - 70, WORLD_HALF, Math.max(Math.abs(x), Math.abs(z))) * 90;
  return h;
}
for (const p of POIS) p.h = baseHeight(p.x, p.z);

export function heightAt(x, z){
  let h = baseHeight(x, z);
  for (const p of POIS){
    if (!p.flatten) continue;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.radius) h += (p.h - h) * (1 - smoothstep(p.radius * 0.65, p.radius, d));
  }
  return h;
}
export function poiClearance(x, z, extra = 0){ for (const p of POIS) if (p.flatten && Math.hypot(x - p.x, z - p.z) < p.radius + extra) return false; return true; }
