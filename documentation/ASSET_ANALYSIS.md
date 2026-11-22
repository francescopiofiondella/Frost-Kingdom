# Analisi asset (Fase 1)
- Manifest: assets/asset_manifest.json, 170 voci, tutti i percorsi esistono su disco.
- 169/170 sono segnaposto procedurali (procedural_placeholder: true): GLB con 1 mesh, senza skin né animazioni.
- Audio: 13 WAV brevi (musica 3-4 s da mandare in loop, SFX 0.2-1.8 s).
- Animazioni: solo animations/*/animations_config.json (nomi dei clip, nessun dato). Si useranno animazioni procedurali.
- Discrepanza: README e MISSING_ASSETS parlano di 66 file; l archivio ne contiene 181.
- Mancanti rispetto al design: pioggia, tuoni, versi di lupo/goblin, passi su erba/legno, musica lunga. Saranno sintetizzati con Web Audio.
