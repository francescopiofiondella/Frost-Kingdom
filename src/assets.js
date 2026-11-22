import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Carica manifest, modelli e texture usando SOLO i percorsi reali del manifest.
export class Assets {
  constructor(base = "./assets/"){
    this.base = base;
    this.gltf = new GLTFLoader();
    this.tex = new THREE.TextureLoader();
    this.models = new Map();
    this.textures = new Map();
    this.report = { loaded: [], failed: [], placeholders: 0 };
    this.byPath = new Map();
  }
  async loadManifest(){
    const res = await fetch(this.base + "asset_manifest.json");
    if (!res.ok) throw new Error("asset_manifest.json non trovato (HTTP " + res.status + "). Avvia il gioco da un server locale.");
    this.manifest = await res.json();
    for (const a of this.manifest.assets){ this.byPath.set(a.path, a); if (a.procedural_placeholder) this.report.placeholders++; }
    return this.manifest;
  }
  has(path){ return this.byPath.has(path); }
  loadModel(path){
    if (!this.models.has(path)) this.models.set(path, this._loadModel(path));
    return this.models.get(path);
  }
  async _loadModel(path){
    try {
      if (!this.has(path)) throw new Error("percorso non presente nel manifest");
      const gltf = await this.gltf.loadAsync(this.base + path);
      gltf.scene.updateMatrixWorld(true);
      let mesh = null;
      gltf.scene.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
      if (!mesh) throw new Error("nessun mesh nel GLB");
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      geometry.computeBoundingBox();
      const bb = geometry.boundingBox;
      const size = bb.getSize(new THREE.Vector3());
      geometry.translate(0, -bb.min.y, 0); // piedi/base a y=0
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      this.report.loaded.push(path);
      return { geometry, material: mesh.material, height: Math.max(0.01, size.y), width: size.x, depth: size.z, fallback: false };
    } catch (e){
      console.warn("[assets] fallback per", path, e.message);
      this.report.failed.push(path + " (" + e.message + ")");
      const geometry = new THREE.BoxGeometry(1, 2, 1); geometry.translate(0, 1, 0);
      return { geometry, material: new THREE.MeshStandardMaterial({ color: 0x884488 }), height: 2, width: 1, depth: 1, fallback: true };
    }
  }
  loadTexture(path, srgb = true){
    if (!this.textures.has(path)) this.textures.set(path, new Promise(resolve => {
      this.tex.load(this.base + path, t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        this.report.loaded.push(path); resolve(t);
      }, undefined, () => { this.report.failed.push(path + " (texture)"); resolve(null); });
    }));
    return this.textures.get(path);
  }
}
