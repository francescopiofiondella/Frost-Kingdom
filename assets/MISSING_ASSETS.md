# MISSING_ASSETS.md — Sostituzione Modelli Riggati & Animazioni

## Stato degli Asset
Tutti i 66 file presenti nell'archivio (`FROST_KINGDOM_ASSETS/`) esistono fisicamente, sono validi e verificati (`verified: true`).
Tuttavia, trattandosi di una pipeline eseguita in ambiente isolato senza connessione internet per il download diretto da repository esterni, i modelli 3D `.glb` e le clip di animazione sono attualmente forniti come **proxy volumetrici PBR** (`procedural_placeholder: true`) privi di armature scheletriche deformabili (skinned mesh).

## Elenco Risorse da Sostituire con Modelli Riggati CC0 / Royalty-Free

### 1. Personaggi & Animazioni Scheletriche (`characters/` & `animations/`)
- **Guerriero Player & NPC (`warrior_player.glb`, `guard.glb`, `merchant.glb`, `blacksmith.glb`, `mage.glb`)**:
  - *Fonte consigliata*: **Quaternius — Ultimate Modular Characters / Medieval Village Pack** (`https://quaternius.com/`) — Licenza **CC0**. Include rig umanoide unificato con animazioni `Idle`, `Walk`, `Run`, `Jump`, `Sword_Attack`, `Hit`, `Death`.
  - *Alternativa*: **Mixamo** (`https://www.mixamo.com/`) per esportare animazioni `.fbx` da convertire in `.glb` tramite Blender.
- **Nemici & Creature (`goblin.glb`, `orc.glb`, `dire_wolf.glb`, `draugr_skeleton.glb`, `ice_troll.glb`, `giant_spider.glb`)**:
  - *Fonte consigliata*: **Quaternius — Ultimate Monsters Pack** (`https://quaternius.com/`) — Licenza **CC0**, compatibile al 100% con Three.js `GLTFLoader` e `THREE.AnimationMixer`.
- **Boss (`frost_dragon.glb`, `frost_giant.glb`, `abyssal_demon.glb`, `skeleton_king.glb`)**:
  - *Fonte consigliata*: **Poly Pizza** (`https://poly.pizza/`) e **Sketchfab (filtro CC0 / CC-BY downloadable GLTF)** (`https://sketchfab.com/`).

### 2. Architetture, Armi e Oggetti Dettagliati (`environments/`, `weapons/`, `armor/`)
- **Villaggi, Castelli, Rovine e Dungeon**:
  - *Fonte consigliata*: **Kenney — Castle Kit / Nature Kit / Graveyard Kit** (`https://kenney.nl/assets`) — Licenza **CC0**.
  - *Fonte consigliata*: **Quaternius — Medieval Village & Dungeon Pack** (`https://quaternius.com/`) — Licenza **CC0**.

### 3. Texture Fotorealistiche ad Alta Risoluzione (`textures/`)
- Le mappe PBR 512x512 incluse funzionano out-of-the-box. Per upgrade 1K/2K fotorealistici:
  - **Poly Haven** (`https://polyhaven.com/textures`) — Licenza **CC0** (es. *Snow 02*, *Castle Brick 01*, *Bark Willow*, *Rusty Metal*).
  - **ambientCG** (`https://ambientcg.com/`) — Licenza **CC0** (es. *Ground037*, *Rock028*, *Wood066*).

### 4. Musica Orchestrale ed Effetti Sonori (`audio/`)
- I file `.wav` inclusi coprono tutti i trigger di gioco. Per tracce orchestrali estese:
  - **OpenGameArt** (`https://opengameart.org/`) — Filtro licenza `CC0` / `CC-BY 3.0` (es. *Fantasy RPG Music Pack*).
  - **Freesound** (`https://freesound.org/`) — Filtro licenza `CC0` per effetti ambientali e combattimento.
