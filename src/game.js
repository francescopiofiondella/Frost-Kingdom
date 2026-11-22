import * as THREE from "three";
import { Assets } from "./assets.js";
import { World } from "./world.js";
import { Player } from "./player.js";
import { ThirdPersonCamera } from "./camera.js";
import { Input } from "./input.js";
import { Collision } from "./collision.js";
import { Effects } from "./effects.js";
import { Combat } from "./combat.js";
import { Enemies } from "./enemies.js";
import { HOTKEYS, WEAPONS } from "./equipment.js";
import { regionAt, CHUNK, WORLD_HALF } from "./terrain.js";

export const QUALITY = {
  low:    { radius: 2, shadow: 0,    pixelRatio: 1,   shadowSize: 0 },
  medium: { radius: 3, shadow: 1,    pixelRatio: 1.5, shadowSize: 2048 },
  high:   { radius: 4, shadow: 1,    pixelRatio: 2,   shadowSize: 4096 },
};

export class Game {
  constructor(canvas, ui){
    this.canvas = canvas; this.ui = ui;
    const saved = localStorage.getItem("fk_quality");
    this.qName = QUALITY[saved] ? saved : "medium";
    this.q = QUALITY[this.qName];
    this.time = 0; this.fps = 60; this.listeners = {};
  }
  on(ev, fn){ (this.listeners[ev] ||= []).push(fn); }
  emit(ev, data){ for (const fn of this.listeners[ev] || []) fn(data); }

  async init(status){
    const q = this.q;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.qName !== "low", powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
    r.setSize(innerWidth, innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = !!q.shadow; r.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = this.scene = new THREE.Scene();
    const fogColor = new THREE.Color(0xaebfcf);
    scene.background = fogColor;
    const far = q.radius * CHUNK * 0.95;
    scene.fog = new THREE.Fog(fogColor, far * 0.35, far);

    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, far + 200);
    scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x4a5560, 0.75));
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
    sun.castShadow = !!q.shadow;
    if (q.shadow){
      sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      const s = 70, c = sun.shadow.camera; c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.near = 1; c.far = 300;
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    }
    this.sunDir = new THREE.Vector3(0.5, 0.8, 0.35).normalize();
    scene.add(sun, sun.target);

    status("Lettura manifest asset…", 0.03);
    this.assets = new Assets("./assets/");
    await this.assets.loadManifest();

    this.input = new Input(this.canvas);
    this.collision = new Collision();
    this.player = new Player(scene, this.assets, this.input, this.collision);
    this.rig = new ThirdPersonCamera(this.camera, this.input, this.collision);
    this.world = new World(scene, this.assets, q, this.collision);
    await this.world.init(status);
    status("Caricamento personaggio e armi…", 0.35);
    await this.player.load();
    status("Preparazione combattimento e nemici…", 0.38);
    this.effects = new Effects(scene, this.assets, this.camera); await this.effects.init();
    this.combat = new Combat(this); await this.combat.init();
    this.enemies = new Enemies(this); await this.enemies.init();
    this.player.findTarget = (x, z, dx, dz, range) => this.enemies.nearestInCone(x, z, dx, dz, range);
    this.ui.setWeapon(this.player.weapon);
    await this.world.preload(this.player.position.x, this.player.position.z, status);

    addEventListener("resize", () => {
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
      r.setSize(innerWidth, innerHeight);
    });
    const rep = this.assets.report;
    console.info(`[assets] caricati ${rep.loaded.length}, falliti ${rep.failed.length}, segnaposto nel manifest ${rep.placeholders}/${this.assets.manifest.total_assets}`);
    if (rep.failed.length) console.warn("[assets] falliti:", rep.failed);
  }

  start(){
    this.clock = new THREE.Clock();
    this.rig.update(0.016, this.player.cameraTarget);
    const loop = () => { requestAnimationFrame(loop); this.frame(); };
    loop();
  }

  frame(){
    const real = Math.min(0.05, this.clock.getDelta());
    let dt = real;
    if (this.combat.hitstop > 0){ this.combat.hitstop -= real; dt = real * 0.08; } // hitstop: breve rallentamento all'impatto
    this.time += dt;
    this.fps += (1 / Math.max(dt, 1e-4) - this.fps) * 0.05;
    const p = this.player;
    HOTKEYS.forEach((id, n) => { if (this.input.pressed("Digit" + (n + 1)) && p.setWeapon(id)) this.ui.setWeapon(WEAPONS[id]); });
    p.update(dt, this.rig.yaw);
    this.rig.aimTarget = p.aiming ? 1 : 0;
    this.rig.fovBoost = p.state === "dodge" ? 10 : Math.max(0, (p.speed - 5) * 2.5);
    this.rig.update(dt, p.cameraTarget);
    this.world.update(p.position.x, p.position.z, 2);
    this.world.tick(this.time);
    this.enemies.update(dt);
    this.combat.update(dt);
    this.effects.update(dt);

    // il sole e le ombre seguono il giocatore
    this.sun.position.copy(p.position).addScaledVector(this.sunDir, 120);
    this.sun.target.position.copy(p.position);

    const reg = regionAt(p.position.x, p.position.z);
    this.ui.setRegion(reg); this.ui.setBars(p.stats, p.exhausted); this.ui.setLoot(p); this.ui.setReticle(p.aiming); this.ui.setDead(p.dead);
    const st = this.world.stats(), i = this.renderer.info;
    this.ui.debug(dt, `FPS ${this.fps.toFixed(0)}  qualità ${this.qName}\nPos ${p.position.x.toFixed(0)}, ${p.position.y.toFixed(1)}, ${p.position.z.toFixed(0)}\nStato ${p.state}${p.blocking ? "+parata" : ""}${p.grounded ? "" : " (aria)"}  combo ${p.combo}\nChunk ${st.chunks}  istanze ${st.instances}  solidi ${this.collision.count()}\nNemici attivi ${this.enemies.active.length}  proiettili ${this.combat.proj.length}\nDraw ${i.render.calls}  tri ${(i.render.triangles / 1000).toFixed(0)}k`);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }
}
