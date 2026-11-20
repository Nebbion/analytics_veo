# Prova sui file reali · Coppa Villanovese–Montagnana

Data verifica: 20 novembre 2026. Match_ID canonico fornito dallo staff: `3998683`. Gli originali sono in `data/local/`, ignorata da Git. Il manifest locale è `data/local/matches/ce3afbf2783bad82a3d54b6a/manifest.sqlite3`.

| Fonte | SHA-256 | Risultato import |
| --- | --- | --- |
| Video MP4 Veo | `ce7de8522d9156e26b1ba194ad319d814f09218ef4342151b8661accdcb3b3e4` | H.264, 1920×1080, 6907,868 s |
| Report MHTML Veo | `1de7ea485e5062194d990248ec8f74d76537e902c9abdcd30f2a500f47bd7100` | 940 righe visibili; quattro marcatori e nove KPI comparativi candidati |
| Report MHTML YouCoach | `39dcf830f8d44f05ef9d00bb3e0ccc2945c25df21c02e239d0aeaf5f9f070481` | 930 righe visibili; quattro gol e dodici eventi di cronaca candidati |
| Piano gara PDF | `28f9a7712226b4c8ef13f4663af549910d97afe40e5783fef2e3ae8de73ee69e` | 11 pagine, testo e PNG per pagina |

Il cartellino Veo mostra il primo marcatore al **12′**; la cronaca YouCoach mostra il primo gol al **13′**. Questi valori sono candidati da verificare. Non è stato scelto un minuto consolidato, non è stato associato un giocatore a un ID canonico e non è stata derivata una posizione nel video. La UI mostra il conflitto e chiede allo staff valore e motivo della scelta. Il bundle locale `import-bundle.json` contiene i due valori originali e il loro stato non verificato.

Il PDF contiene diagrammi di gioco in possesso per zona 1 e zona 2 e schemi di palle inattive. Le pagine 2, 3 e 4 sono state aperte e verificate come immagini; il testo estratto da solo non rappresenta i movimenti o le relazioni del diagramma. Le istruzioni tattiche restano da interpretare e approvare dallo staff.

Il proxy completo mantiene durata e risoluzione del video; una clip tecnica di 10 s è stata estratta dall'originale. Il bundle `import-bundle.json` contiene cinque fonti (video, due MHTML, PDF e clip tecnica) e nessun evento tattico. Il PDF `diagnostica-fonti-3998683.pdf` è stato generato e verificato: espone fonti, hash, conflitto 12′/13′, i KPI nell'ordine originale del report, la cronaca candidata, assenza di piano approvato e denominatore 0/0. Non presenta la clip tecnica come prova di un'azione di gioco.

La sincronizzazione Supabase e l'approvazione staff non sono state eseguite: la migration è stata provata su PostgreSQL isolato, non applicata al database reale. Per questo non esistono ancora principi approvati, giudizi di conformità o decisioni tattiche riferite a questa partita. I test sintetici separati coprono approvazione/versioni, collegamenti, report e protezioni del database; non sono spacciati per analisi tattica della gara reale.
