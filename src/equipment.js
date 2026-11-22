// Database armi (dati puri). Tutti i modelli sono percorsi reali del manifest.
// L'inventario e l'equipaggiamento completo arrivano nella Fase 5; per ora si cambia arma coi tasti 1-8.
export const RARITY = {
  common:    { name: "Comune",      color: "#bdbdbd", mult: 1.0 },
  uncommon:  { name: "Non comune",  color: "#5fd35f", mult: 1.15 },
  rare:      { name: "Raro",        color: "#4a90ff", mult: 1.3 },
  epic:      { name: "Epico",       color: "#b25fe0", mult: 1.5 },
  legendary: { name: "Leggendario", color: "#ff9a2e", mult: 1.8 },
};

// damage = danno base, speed = moltiplicatore velocità d'attacco, reach = portata (m), len = lunghezza modello (m)
export const WEAPONS = {
  steel_longsword:     { name: "Spada d'acciaio",     type: "sword",      model: "weapons/swords/steel_longsword.glb",     damage: 18, speed: 1.0,  reach: 2.4, len: 1.2, rarity: "common",    effect: null, desc: "Lama equilibrata, affidabile in ogni scontro." },
  nordic_battleaxe:    { name: "Ascia da guerra",     type: "axe",        model: "weapons/axes/nordic_battleaxe.glb",      damage: 26, speed: 0.85, reach: 2.3, len: 1.1, rarity: "uncommon",  effect: { type: "bleed", chance: 0.3 }, desc: "Pesante e brutale: i colpi possono causare sanguinamento." },
  nordic_greatsword:   { name: "Spadone nordico",     type: "greatsword", model: "weapons/swords/nordic_greatsword.glb",   damage: 38, speed: 0.65, reach: 3.0, len: 1.7, rarity: "rare",      effect: null, twoHanded: true, desc: "Arma a due mani: lenta, ampia e devastante." },
  hunting_bow:         { name: "Arco da caccia",      type: "bow",        model: "weapons/bows/hunting_bow.glb",           damage: 22, speed: 1.0,  reach: 60,  len: 1.3, rarity: "common",    effect: null, ranged: true, desc: "Tieni il tasto destro per mirare: colpi mirati fanno più danno." },
  frost_staff:         { name: "Bastone del gelo",    type: "staff",      model: "weapons/staffs/frost_staff.glb",         damage: 9,  speed: 1.0,  reach: 2.2, len: 1.7, rarity: "uncommon",  effect: { type: "frost", chance: 1 }, boltCost: 6, boltDamage: 20, desc: "Lancia dardi di gelo (6 mana) che rallentano il bersaglio." },
  frostbite_runeblade: { name: "Lama runica del gelo",type: "sword",      model: "weapons/swords/frostbite_runeblade.glb", damage: 24, speed: 1.1,  reach: 2.5, len: 1.2, rarity: "epic",      effect: { type: "frost", chance: 0.35 }, desc: "Rune di ghiaccio che intorpidiscono chi viene colpito." },
  dragonbone_claymore: { name: "Claymore d'osso di drago", type: "greatsword", model: "weapons/swords/dragonbone_claymore.glb", damage: 52, speed: 0.7, reach: 3.1, len: 1.8, rarity: "legendary", effect: { type: "burn", chance: 0.4 }, twoHanded: true, desc: "Forgiata con osso di drago: le ferite bruciano." },
  fire_staff:          { name: "Bastone del fuoco",   type: "staff",      model: "weapons/staffs/fire_staff.glb",          damage: 10, speed: 1.0,  reach: 2.2, len: 1.7, rarity: "rare",      effect: { type: "burn", chance: 1 }, boltCost: 8, boltDamage: 28, desc: "Lancia dardi infuocati (8 mana) che bruciano." },
};
export const HOTKEYS = ["steel_longsword", "nordic_battleaxe", "nordic_greatsword", "hunting_bow", "frost_staff", "frostbite_runeblade", "dragonbone_claymore", "fire_staff"];
