# LEGENDS OF THE FROST KINGDOM — Asset Pipeline & Integration Guide

## 1. Panoramica del Pacchetto
Questo pacchetto contiene la struttura completa di directory, i file JSON di configurazione, le texture PBR seamless, gli effetti audio WAV, gli sprite particellari e i modelli 3D proxy in formato binario **GLB 2.0** pronti per essere caricati immediatamente in **Three.js** (`GLTFLoader`) senza errori 404.

## 2. Architettura Tecnica per Sviluppo (Three.js)
- **Scala Standard**: `1 unità Three.js = 1 metro`. L'origine `(0,0,0)` di ogni modello 3D è posizionata esattamente alla base (piedi/fondamenta) per semplificare il raycasting sul terreno e le collisioni.
- **Modelli Proxy Calibrati (`procedural_placeholder: true`)**: Poiché questo ambiente di generazione opera offline senza accesso diretto al download da portali esterni, tutti i `.glb` inclusi sono geometrie binarie glTF 2.0 valide con dimensioni reali (es. Guerriero 1.8m, Drago 4.5x3.8x7.0m, Casa Nordica 6x4.5x8m) e materiali PBR configurati. Possono essere sostituiti in qualsiasi momento drop-in con i modelli riggati elencati in `MISSING_ASSETS.md`.
- **Texture PBR (`textures/`)**: Set completi `512x512` PNG tileable con mappe `_albedo.png`, `_normal.png` (tangent-space) e `_roughness.png`.
- **Audio (`audio/`)**: File `.wav` PCM 16-bit 22050Hz compatibili con `THREE.Audio` e `THREE.PositionalAudio`.

## 3. Esempio di Caricamento in Three.js
```javascript
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const manifest = await fetch('./FROST_KINGDOM_ASSETS/asset_manifest.json').then(r => r.json());

// Caricamento Player
const playerMeta = manifest.assets.find(a => a.id === 'char_player_001');
loader.load(`./FROST_KINGDOM_ASSETS/${playerMeta.path}`, (gltf) => {
  scene.add(gltf.scene);
});
```
