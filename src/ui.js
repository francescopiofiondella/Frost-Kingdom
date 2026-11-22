import { REGIONS } from "./terrain.js";
export class UI {
  constructor(){
    this.$ = id => document.getElementById(id);
    this.loading = this.$("loading"); this.hud = this.$("hud"); this.t = 0; this.regionKey = null;
  }
  setLoading(text, p){ this.$("loadtext").textContent = text; if (p != null) this.$("loadbar").style.width = Math.round(p * 100) + "%"; }
  hideLoading(){ this.loading.style.display = "none"; this.hud.hidden = false; }
  showError(e){ console.error(e); this.loading.classList.add("error"); this.$("loadtext").textContent = "Errore: " + (e.message || e) + "\n\nSe vedi errori di rete/CORS, avvia con: npm start (non aprire index.html con file://)."; }
  setRegion(key){
    if (key === this.regionKey) return; this.regionKey = key;
    const el = this.$("region"); el.textContent = REGIONS[key].name; el.classList.add("show");
    clearTimeout(this._rt); this._rt = setTimeout(() => el.classList.remove("show"), 3500);
  }
  setBars(s, exhausted){
    this._b ||= { hp: this.$("hp"), mp: this.$("mp"), st: this.$("st") };
    this._b.hp.style.width = (100 * s.hp / s.maxHp) + "%";
    this._b.mp.style.width = (100 * s.mp / s.maxMp) + "%";
    this._b.st.style.width = (100 * s.stamina / s.maxStamina) + "%";
    this._b.st.parentElement.classList.toggle("tired", !!exhausted);
  }
  setLoot(p){
    const t = this.$("lootline"), b = p.bag, txt = `Oro ${b.gold || 0}  ·  Pozioni ${b.health_potion || 0} [H]  ·  XP ${p.xp}  ·  Uccisioni ${p.kills}`;
    if (txt !== this._lt){ this._lt = txt; t.textContent = txt; }
  }
  setWeapon(w){
    const el = this.$("weaponline"); el.textContent = `${w.name} — ${w.damage} danno`; el.style.color = ({ common: "#ddd", uncommon: "#5fd35f", rare: "#6aa5ff", epic: "#c27ae8", legendary: "#ffa63d" })[w.rarity];
    el.title = w.desc;
  }
  setReticle(aim){ this.$("reticle").classList.toggle("aim", !!aim); }
  flash(){ const f = this.$("hurt"); f.style.opacity = "0.55"; clearTimeout(this._ft); this._ft = setTimeout(() => { f.style.opacity = "0"; }, 90); }
  setDead(d){ this.$("deathmsg").style.display = d ? "flex" : "none"; }
  debug(dt, info){
    this.t += dt; if (this.t < 0.25) return; this.t = 0;
    this.$("debug").textContent = info;
  }
}
