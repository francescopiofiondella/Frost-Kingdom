# Fase 3 - Personaggio, fisica, collisioni
Controlli: WASD muovi, Shift corri, Spazio salta, Clic sx attacco (combo x3, premi di nuovo durante il colpo), Clic dx parata (tieni), Q schivata, R rialzati dopo la morte.
- collision.js: cerchi e box orientati con altezza, griglia spaziale, piattaforme calpestabili (ponte). Testato in Node.
- player.js: stati free/attack/dodge/hit/dead, gravità, salto, stamina, i-frames nella schivata, parata frontale (-80% danno), danno da caduta, limite di pendenza e step-up 0.4 m.
- Animazioni: PROCEDURALI (i GLB proxy non hanno scheletro). Spada e scudo usano i modelli reali del manifest (steel_longsword.glb, iron_shield.glb).
- Hook per la Fase 4: player.takePendingHit() restituisce il colpo attivo {combo, mult, x, z, dx, dz, range, arc}; player.takeDamage(amount, fromPos); player.weaponMult.
- Non ancora: suoni (Fase 8), interazione E (Fase 6), magie (Fase 7), controlli touch (Fase 9).
- Limiti: archi (ancient_arch) senza collisione; il ponte è procedurale; test fisici eseguiti solo in Node con Three.js simulato, non nel browser.
