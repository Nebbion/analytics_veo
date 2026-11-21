# Piano gara: disposizioni, ruoli, battitori e video locale

La sezione **Piano gara · confronto con il video** di `/viceallenatore` estende il prototipo sui corner al gioco aperto e alle altre sezioni del piano. Usa lo stesso video, le stesse clip e il manifest della gara. Non richiede un nuovo JSON, un nuovo piano, TOP/FLOP o la ricompilazione della rosa. Le route leggono il modello stagionale approvato da Analytics in base alla stagione della partita e alla preferenza stagionale; uno snapshot inviato dal browser non può sostituirlo. Le letture del database usano la sessione esistente. Non servono migration né scritture remote.

## Uso

1. Seleziona la partita e una parte del piano. L'indice mostra tutte le pagine recuperate, comprese quelle disponibili solo come riferimento. I tre corner offensivi rimandano alla sezione già esistente, senza una seconda configurazione.
2. Verifica una volta la lettura del disegno. La pagina originale è affiancata alla proposta geometrica. Correggi solo icone, ruoli o frecce ambigui. Le disposizioni offensive sono statiche: il sistema non inventa traiettorie passando da un modulo all'altro. Le frecce difensive sono trascrizioni proposte, non istruzioni già approvate dallo staff.
3. Apri una clip già disponibile oppure scegli una miniatura della scansione esistente. Il clic elabora 20 secondi attorno alla scena. L'intervallo preciso resta facoltativo, fino a due minuti. Le miniature non certificano la fase di gioco.
4. Conferma fase e condizioni solo se visibili nel filmato. Per misure sul campo servono quattro riferimenti visibili dell'area propria o avversaria, con direzione coerente. Abbina soltanto i riferimenti del piano che riconosci alle tracce. I numeri delle tracce non sono numeri di maglia.
5. Confronta e salva la revisione locale. Il risultato distingue spostamenti stimati, interpretazioni rispetto alle frecce e parti non valutabili. Note e correzioni vengono recuperate nelle revisioni successive dello stesso schema/episodio.

## Parti del piano di Montagnana

| Pagine | Contenuto | Trattamento |
| --- | --- | --- |
| 1 | Modulo e convocati | Testo recuperato dal PDF; collegamenti univoci alla rosa e distinta Analytics, senza inferire i titolari dai numeri o riscrivere i dati ufficiali. La disposizione resta visibile nella pagina originale; una fase di gioco non viene attribuita al modulo di base. |
| 2–3 | Possesso in zona 1 e zona 2 | Riferimenti statici distinti; nessun movimento inventato tra i due moduli. |
| 4 | Corner difensivo | Posizioni di riferimento e gruppo dei marcatori separati. I marcatori non ricevono uno scarto rispetto alla fila di icone del disegno. |
| 5 | Punizione difensiva e barriera | Posizioni, gruppo dei marcatori e freccia di movimento proposta. Il riquadro della barriera resta un riferimento generico, escluso dalle posizioni dei convocati. |
| 6–8 | Tre corner offensivi | Confronto esistente, con alternative per lato già chiarite dall'allenatore. |
| 9 | Rigoristi, piazzati diretti e indiretti | Gruppi di nomi e riferimenti laterali conservati separatamente, senza graduatoria, piede di battuta o traiettoria dedotti. |
| 10–11 | Uscite contro 4-2-3-1 e 4-3-1-2 | Frecce proposte e condizioni della struttura avversaria da verificare. |

**11/11 pagine recuperate non significa 11 pagine di analisi video validate.** Le letture delle immagini rimangono proposte da approvare una volta. Per questi schemi le trascrizioni visuali sono nel profilo locale legato al checksum del PDF (`open-meaning-<sha>.json`), ignorato da Git; non sono OCR universale né chiarimenti già confermati dallo staff. Un altro piano con riquadri non interpretati rimane visibile come immagine: il sistema sospende il confronto invece di contare elenchi o icone generiche come giocatori.

Nei disegni difensivi la porta in alto è quella propria: il reticolo ruota entrambi gli assi per mantenere l'origine sulla propria linea di fondo e l'attacco verso Y positivo. Il lato rappresentato deve corrispondere a quello dell'episodio; non viene specchiato automaticamente. Le cinque icone numerate del riquadro della barriera non identificano convocati e non impongono cinque uomini in ogni situazione. Marcature individuali, composizione della barriera e responsabilità tattiche restano verifiche visive nella clip, con nota facoltativa; non sono riconosciute o giudicate automaticamente.

Per la pagina dei battitori seleziona il gruppo applicabile e il battitore che riconosci dalla rosa già presente. La corrispondenza con il nome del piano viene proposta soltanto se non ambigua e deve essere verificata insieme a identità, tipo e posizione del calcio piazzato. Si può confermare anche un battitore non elencato: il risultato rimane una proposta da rivedere, senza dichiarare automaticamente un errore. Non serve un allineamento metrico. Finché le conferme mancano, la verifica è non valutabile. La revisione conserva il fotogramma, i riferimenti del piano, la fonte video, il modello e la provenienza della verifica dello staff.

## Evidenze e limiti

`local_engine/open_play.py` recupera pagine contestualizzate, propone la rettifica del reticolo e delle icone e riusa `corner_engine.py` per rilevamento, clip e tracciamento. Coordinate: origine sulla propria linea di fondo, attacco verso Y positivo, campo convenzionale 68 × 105 m. Reticolo, dimensioni e compensazione della camera sono approssimazioni da verificare, non misure certificate.

Un movimento è misurabile solo con piano approvato, fase/zona/struttura avversaria coerenti, calibrazione verificata, abbinamento esplicito e traccia presente in tutti i campioni dell'intervallo. Una traccia non può coprire due riferimenti del piano. Le interruzioni della camera o della traccia non vengono interpolate. Gli abbinamenti per colore e vicinanza rimangono anonimi e consentono soltanto una proposta geometrica parziale.

Le osservazioni riportano spostamento longitudinale/laterale, percorso e durata stimati. Se è presente una freccia attesa, l'interpretazione riporta scarto finale e coerenza della direzione. Non deduce causa, tempi corretti del pressing, traiettoria esatta della corsa o conformità globale. I principi testuali del modello stagionale sono conservati come riferimento; non esiste ancora una valutazione semantica automatica di quei principi.

Fase, zona, palla, trigger del pressing, avversari e identità non sono riconosciuti automaticamente. Non vengono trasferite conclusioni dai report al video senza evidenza, né equiparati minuti gara e timestamp. Le due disposizioni offensive del piano e il modello stagionale mantengono fonti e condizioni distinte.

I dati restano in `data/local/matches/<hash-id>/corners/`, ignorati da Git. Le trascrizioni visuali locali sono vincolate al checksum del PDF. Il piano originale modificato viene rifiutato e richiede una nuova importazione. Ogni revisione archivia piano, modello stagionale, fonte video e checksum, contesto, calibrazione, abbinamenti, nota e risultato. Le revisioni dei corner vengono conservate separatamente. Il controllo di accesso e la whitelist dei media restano quelli del [prototipo corner](corner-prototype.md).

## Verifica tecnica

Sono presenti test isolati su contesto, direzione, compensazione della camera, tracce interrotte, assenza di frecce, abbinamenti duplicati e persistenza con cronologia. I test server verificano il riuso della sola versione stagionale approvata e il trattamento dei modelli ambigui. L'estensione verifica anche rotazione dei due assi, esclusione dei marcatori dal giudizio geometrico, nessun conteggio imposto della barriera, mancata deduzione dei titolari, battitori senza gerarchia, conferme mancanti e corrispondenze nominali ambigue.

Controllo locale sulla pagina iniziale: 20 convocati recuperati, tutti e 20 collegati senza ambiguità alla rosa e alla distinta Analytics. La prova UI non approva gli schemi né attribuisce episodi o identità al video: il salvataggio diagnostico resta esplicitamente non valutabile. Nessuna scrittura al database remoto.

Sul video Montagnana, intervallo **03:00–03:20 del file**: 40 fotogrammi a 2 fps, 590 rilevamenti complessivi (non persone uniche), trasformazioni della camera disponibili per 33/40 fotogrammi, 16,70 secondi di elaborazione CPU. È una prova tecnica, senza etichetta di fase o giudizio tattico. Senza conferme il risultato rimane non valutabile. Non costituisce una misura dell'accuratezza del rilevatore o del rispetto del piano.
