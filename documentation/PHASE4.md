# Fase 4 - Combattimento e nemici
Controlli aggiunti: F attacco pesante, H bevi pozione, 1-8 cambia arma (provvisorio, l'inventario arriva in Fase 5).
Clic dx = parata (spada/ascia/spadone/bastone) oppure MIRA (arco). Parata entro 0.3 s dal colpo = parata perfetta: nemico stordito e contrattacco (x3.2) con clic sx entro 1.3 s.

## Moduli
- equipment.js: 8 armi con danno, velocità, portata, rarità, descrizione ed effetti (gelo, fuoco, sanguinamento). Percorsi reali del manifest.
- combat.js: risoluzione colpi (cono/portata), critici, danno x1.5 su nemici storditi, effetti di stato, proiettili (freccia, dardo gelo/fuoco/arcano, palla di fuoco dei nemici), hitstop, shake, parata a tempo.
- enemies.js: 7 tipi (lupo, goblin, scheletro, troll, orco, ragno, mago oscuro), 54 nemici in 20 gruppi nelle 4 regioni, attivati a 120 m e disattivati a 165 m.
  IA: idle/vagabondaggio -> allerta (chiama i compagni del gruppo) -> inseguimento -> attacco (carica, colpo, recupero) -> stordimento -> ritorno a casa (perde aggro oltre 2.2x raggio o 75 m da casa).
  Lupi aggirano il bersaglio, il mago mantiene la distanza e lancia palle di fuoco, il troll ha un attacco ad area con cerchio di avviso e non si fa interrompere, ragni e lupi scattano.
  Drop: oro, pozioni, minerale, pelli, ossa, seta; raccolta automatica per vicinanza.
- effects.js: particelle (pool), numeri di danno, cerchi di avviso.
- Eventi: game.on("kill"/"pickup", fn) per le missioni (Fase 6). enemies.killed = Set degli id uccisi (per il salvataggio, Fase 9).

## Non incluso (volutamente)
- Draghi e boss: Fase 7. Magie vere (palla di fuoco, fulmine, cura...): Fase 7 (ora solo i dardi dei bastoni).
- Suoni: Fase 8. XP senza livelli: Fase 5 (player.addXP e player.bag sono segnaposto).
- Animazioni dei nemici procedurali (i GLB non hanno scheletro).
## Test eseguiti (Node, Three.js simulato, nessuna grafica)
24 test di combattimento/IA, 22 di giocatore/fisica, 11 di collisioni. Non provato in browser.
