# PROMPT UNICO PER CODEX — VILLANOVESE ANALYTICS + VICEALLENATORE AI

## MISSIONE E MODALITÀ DI LAVORO

Agisci come lead software engineer, architetto dati, video-analysis engineer e analista tattico critico. **Lavora direttamente nel repository `villanovese-analytics` aperto in Codex sul mio Mac. Implementa il codice, le migrazioni e i test; non limitarti a proporre un piano.**

L'applicazione attuale è il punto di partenza e la fonte di verità sui dati già gestiti (stagioni, squadre, calendario, partite, giocatori, statistiche, ammonizioni, squalifiche, ecc. **solo se verifichi che tali strutture esistono davvero**). Non rifare il gestionale e non introdurre una seconda dashboard indipendente, salvo che sia inevitabile per funzioni locali di elaborazione video: in tal caso crea un companion locale integrato con i dati di Analytics.

**Obiettivo del prodotto:** costruire progressivamente un **Viceallenatore AI con memoria tattica stagionale**, capace di conoscere il modello di gioco approvato dallo staff, individuare evidenze anche contrarie alle impressioni dell'allenatore, collegare problemi → esercitazioni → verifiche successive, e proporre un briefing di **massimo tre decisioni motivate**. L'AI non sostituisce l'allenatore: osserva, suggerisce, contesta le impressioni non supportate e mantiene la storia delle decisioni. Non attribuisce fatti, causalità o miglioramenti senza prova.

**Ordine rigoroso:** Fase 0 diagnosi e audit del repository; Fase 1 MVP realmente funzionante e testato (video, import Veo/YouCoach, PDF piano gara, annotazioni e PDF report); **già in Fase 1 definire e migrare uno schema dati evolutivo, e registrare eventi/provenienza/versioni che abilitino la memoria stagionale**. Le funzioni avanzate di analisi longitudinale, suggerimenti autonomi e computer vision vengono soltanto predisposte e implementate in fasi successive. Non fingere che siano state realizzate.

## 0. AUDIT DEL PROGETTO E DELL'HARDWARE — PRIMA DI MODIFICARE CODICE

1. Nel repository esegui `pwd`, `git status`, leggi README, dipendenze, struttura router/pagine, UI, test, autenticazione, database, migrazioni, Supabase, eventuale Vercel, data models e API. Identifica convenzioni di naming, `match_id`, `player_id`, `season_id`, `team_id`, access-control e componenti UI riutilizzabili. Verifica come è modellata la *squadra avversaria* e come sono importati i report; **non supporre che i moduli esistano**.
2. Sul Mac rileva modello, CPU/chip, RAM, macOS, disco libero e GPU Apple Metal/MPS, con output reale dei comandi quando disponibili. Verifica Python, venv, FFmpeg/ffprobe, Homebrew, Codex; verifica `torch.backends.mps.is_available()` solo se PyTorch già presente (non installarlo per il solo test). Non inventare benchmark o prestazioni.
3. Individua le versioni compatibili con Mac Intel/Apple Silicon. Prepara Python isolato `venv` per l'elaborazione locale. Non modificare indiscriminatamente dipendenze frontend/backend già funzionanti. Audit licenze di librerie e modelli, incluso PyMuPDF (AGPL/commerciale), FFmpeg/codec, Ultralytics/pesi se proposti in seguito.
4. Crea `docs/viceallenatore/audit.md` con architettura reale, parti riutilizzabili, rischi, piano integrazione e test iniziali eseguiti. Prosegui con l'implementazione, non fermarti al documento.

## 1. ARCHITETTURA INTEGRATA, NESSUNA RISCRITTURA

- **Villanovese Analytics esistente:** mantiene l'UI principale, le schermate partite/giocatori/stagione, l'autenticazione e il DB di progetto. Aggiungi una sezione `Analisi tattica / Viceallenatore AI` nei punti congruenti con la navigazione effettiva.
- **Motore locale macOS:** componente Python/FFmpeg isolato per accesso a MP4/MOV Full HD/4K, generazione proxy, clip, PDF e, in futuro, modelli CV MPS. Non eseguire la decodifica video pesante in Vercel o in funzioni serverless. Non trasferire automaticamente gli originali video al cloud.
- **Integrazione sicura:** scegli dopo l'audit la modalità più semplice e affidabile: (A) companion locale con API loopback e sincronizzazione autenticata di soli metadati/annotazioni con Supabase, oppure (B) import/export di bundle JSON versionato e clip locali, poi sync esplicita. Non dare per scontato che un sito su Vercel possa raggiungere `localhost` senza problemi di browser/CORS/mixed-content. Documenta il percorso scelto e verifica l'end-to-end.
- **Persistenza:** se Supabase è già il DB, riutilizzalo e aggiungi migrazioni additive non distruttive, con RLS e foreign keys verso ID esistenti; usa un archivio/cache locale per proxy e filmati. Se il DB reale differisce, adatta gli esempi senza cambiare i concetti. Le risorse locali registrano checksum, URI locali portabili mediante mappatura, durata e risoluzione, mai URL pubblici inventati.
- **Partite e atleti:** riutilizza gli identificativi canonici già presenti. Un giocatore non deve essere collegato a un numero senza verifica della maglia di quella partita. Non duplicare rose o partite quando un import sembra riferirsi a una partita esistente: crea una coda di riconciliazione.
- **Offline e privacy:** il motore video funziona localmente, senza servizi esterni obbligatori. Autenticazione e RLS sul DB; nessuna API key nel frontend o hard-coded; nessuna esecuzione di script dentro MHTML; log privi di dati personali superflui.

## 2. QUATTRO CAPACITÀ DEL VICEALLENATORE

### A. Tactical DNA + Game Plan PDF

- L'allenatore mantiene un **modello di gioco stagionale** (es. disposizioni diverse per fase e zona di campo). Il sistema **non interpreta automaticamente una variazione di modulo come errore**: valuta condizioni, fase, ruoli e comportamento atteso.
- Consenti import PDF prepartita da YouCoach o altro, estrazione testo e render pagina per pagina via PyMuPDF, anteprime anche per schemi e diagrammi. OCR o modelli multimodali facoltativi. **Frecce, simboli e movimenti ambigui NON sono istruzioni certe.**
- Trasforma bozze in principi strutturati: titolo, fase (costruzione, sviluppo, rifinitura, pressing, transizione, difesa, corner/punizione), condizioni d'applicazione, eccezioni giustificate, zona, ruoli, comportamento osservabile, misure/criteri, fonte+pagine PDF, stato revisione. Revisione e approvazione **esplicita**, con versioni immutabili approvate e nuove bozze per modifiche.
- Collega una versione approvata del Tactical DNA e una del Game Plan alla partita. Conserva anche versioni precedenti per verifiche storiche.

### B. Tactical Video Analyst

- Lavoro con originali Veo/Pixellot **principalmente Full HD, ma supporta 4K** senza upscaling. Analisi con proxy fino a 1080p, block processing, cache, checkpoint; clip ritagliate dall'originale in coordinate di tempo video con FFmpeg.
- Timeline con timestamp **del file video** e cronometro gara **separati** (offset/sincronizzazione manuali; eventuali tagli/fasi/tempi extra). Non convertire ingenuamente `12′` in `00:12:00`.
- Episodi annotati manualmente: organizzazione offensiva/difensiva, costruzione, spazi, transizioni, pressing, piazzati. Fonte, osservabilità, pertinenza e evidenze. Classificazione piano: `conforme`, `non_conforme`, `adattamento_giustificato`, `non_valutabile`.
- Presenta conformità **solo sul sottoinsieme di episodi pertinenti, osservabili, giudicati e collegati al piano approvato**, con denominatore esplicito e tassi distinti conformità/non conformità/adattamenti. Gli episodi non valutabili sono esclusi dal denominatore ma conteggiati a parte. Spiega sempre che è un campione annotato e può essere distorto.
- Palle inattive analizzate separatamente: disposizione iniziale, movimenti, tempi/sincronismi, esito, fonte PDF/video, annotatore e clip. Non attribuire movimenti senza palla se la follow-cam non li inquadra.

### C. Player Tactical Coach

- Fino a 3 TOP e 3 FLOP per giocatore **solo se supportati da clip e dati**; lascia meno risultati se le evidenze sono insufficienti.
- Scheda individuale con comportamento atteso del ruolo secondo piano approvato, comportamento osservato, conformità e qualità tecnica come campi separati, correzione suggerita, priorità, confidenza e riferimenti. Nessuna identificazione automatica da divisa senza sufficiente evidenza e conferma umana.

### D. AI Assistant Coach + Opponent Scout

- Fino a tre punti di forza e tre debolezze squadra; tre-cinque vulnerabilità avversarie solo se sostenute da episodi verificati. Allena la *qualità della decisione*, non la quantità di statistiche.
- Proponi due priorità di allenamento e una lista di esercitazioni specifiche verificabili, oltre a preparare un dossier per la prossima sfida; la pubblicazione/approvazione resta allo staff.
- **Briefing decisionale** di massimo **tre decisioni**, ognuna con evidenze a favore, evidenze contrarie, confidenza calibrata o qualitativa motivata, possibili costi/alternative e domanda di verifica per la partita seguente. Se ci sono meno di tre decisioni giustificabili, mostra meno di tre.

## 3. FONTI IN LOCALE: VIDEO + YOUTCOACH + VEO + PDF

- L'utente inserirà nel progetto, sul Mac, il file video e due report `.mhtml` reali: `Partita _ YouCoach_montagnana_coppa.mhtml` e `Veo _ report_montagnanaCoppa_06092026.mhtml`. Potrà caricare ulteriori report PDF/HTML. **Non richiedere necessariamente upload video via browser**, accetta percorso locale selezionato dall'utente o file picker del companion, con controllo esistenza/permessi.
- Implementa parser MHTML robusto usando standard library MIME/email o librerie sicure; estrai documenti HTML/text, nessuna esecuzione di JavaScript incorporato; preserva asset necessari al report solo come dati, e un'istantanea SHA-256 della fonte.
- **YouCoach**: match metadata, eventi manuali/cronaca, dati staff, eventuali formazioni; non assumere che l'elenco prepartita equivalga ai titolari ufficiali.
- **Veo**: KPI, eventi e loro timestamps/minuti ove presenti, giocatori/etichette se verificabili, fonte e certezza. Il file video scaricabile da Veo può essere follow-cam: non garantire osservabilità della squadra intera o accesso a dati Analytics dalla sola clip. Se i report MHTML non contengono dati attesi, segnalare assenza e chiedere revisione.
- **Divergenza reale di esempio** riportata negli allegati disponibili: il primo gol figura al **13′ su YouCoach** e **12′ su Veo**. Visualizza un conflitto da risolvere, non sovrascrivere silenziosamente. Mai sovrapporre evento statistico al video senza sincronizzazione verificata.
- Mostra una UI di riconciliazione: nome campo, valore Veo, valore YouCoach, dato consolidato *approvato dallo staff*, fonte, stato, motivo della scelta; gli originali restano intatti.

## 4. PRINCIPIO EPISTEMICO FONDAMENTALE: FATTI ≠ INTERPRETAZIONI ≠ IPOTESI

**Queste etichette DEVONO comparire nel modello dati, nella UI e nel report, non solo nei prompt.**

- `osservazione`: descrive **cosa è visibile o documentato** (es. "nel frame da 00:12:25 a 00:12:31 il centrocampista X, identificato manualmente, non entra nell'area"), con una fonte e limiti di osservabilità.
- `interpretazione`: valutazione **del perché o del significato tattico** (es. "probabile ritardo nell'occupazione del mezzo spazio"), collegata a osservazioni e principio approvato, chiarendo alternative compatibili.
- `ipotesi`: spiegazione da verificare (es. "il ritardo dipende da un carico eccessivo"), mai pubblicata come fatto.

**Separare** `tipo_affermazione`, `fonte`, `stato_revisione`, `confidenza`, `qualita_evidenza`, `osservabilita` e `validita_temporale`. Una conclusione generata dall'AI non diventa osservazione verificata solo perché scritta nel database. L'approvazione umana non trasforma automaticamente una deduzione in prova causale.

### L'AI deve poter dissentire dall'allenatore

- Salva l'impressione iniziale dell'allenatore **immutata**, con autore, momento, partita, riferimento (anche se non ha prove); non riscriverla quando emergono dati.
- Confrontala con osservazioni ed episodi indicizzati. Produci una `contraddizione` (o supporto / insufficienza di dati), con clip a favore/contrarie, contesto, limitazioni e risposta dello staff. Non prendere per buona l'impressione né la confutazione automatica senza evidenza.
- Esempio: "Ci hanno bucato sempre a destra" → conteggiare opportunità osservabili, lato del campo e fasi confrontabili; se 2 eventi sono a destra e 5 a sinistra, segnalare il disaccordo **solo se il campione è rappresentativo**, altrimenti `evidenza_insufficiente`.
- Il coach deve poter rispondere: accetto, contesto, rinvio; crea una nuova revisione e mantieni l'audit trail.

## 5. MEMORIA TATTICA STAGIONALE: SCHEMA DATABASE PRONTO DA SUBITO

**Non implementare ora un autonomo "motore di apprendimento": implementa e testa lo schema / la registrazione minima degli eventi necessaria a poterlo creare successivamente.** Usa SQL migration additive aderenti allo schema esistente e RLS, non cancellare o rinominare tabelle live. Non duplicare partite, stagioni, giocatori, club già presenti: foreign key verso quelle tabelle.

Entità concettuali da creare/integrare (i nomi possono adeguarsi allo stile reale del repository):

1. `tactical_models` + `tactical_model_versions`: modello stagionale, versioni, stato `draft/approved/superseded`, creatore, approvatore, approvazione, snapshot/version hash.
2. `match_game_plans` + `game_plan_versions` + `tactical_principles`: PDF riferito alla partita, pagina, fase, condizioni, ruoli, attese, eccezioni, snapshot approvato. I principi sono versionati; non modificare retroattivamente il significato di principi già approvati.
3. `analysis_sources`: report YouCoach/Veo, piano PDF, video, annotazioni, derivati, `sha256`, provider, formato, path locale **non pubblico**, timestamp import, stato di revisione, eventuali limiti/accesso.
4. `match_tactical_events`: fatti/eventi cronologici con IDs stabili; match canonico, periodo, `video_start_ms`, `video_end_ms`, minuto gara separato, fase, zona, team/giocatore nullable, osservabilità, pertinenza, source, revisione. **L'evento descrive ciò che si è registrato, non incorpora necessariamente un giudizio.**
5. `event_evidence`: collegamenti N:N tra eventi, fonti, clip e pagine PDF, eventuale evidenza pro/contro e limiti del campo visivo.
6. `tactical_claims`: singole affermazioni con `claim_type = osservazione | interpretazione | ipotesi`, testo, autore/AI, confidenza, revisione, versione del piano, riferimenti ai principi, validità. Collegare ogni claim ai propri elementi di evidenza con join table `claim_evidence`.
7. `event_assessments`: valutazione tattica distinta da qualità tecnica; giudizio `conforme/non_conforme/adattamento_giustificato/non_valutabile`, reason, condizione del principio, osservabilità, pertinence, reviewer, versione piano.
8. `coach_impressions` + `impression_reviews`: impressione originale, verifica rispetto alle fonti, stato `supportata/contraddetta/parzialmente_supportata/evidenza_insufficiente`, argomentazione, evidenze pro/contro, risposta e revisione umana.
9. `tactical_findings`: criticità/forza/vulnerabilità avversaria con ambito, conteggio episodi, opportunità osservabili, contesto, livello di evidenza, stato `ipotizzato/confermato/archiviato`, prima/ultima occorrenza e relazioni con evidenze. Niente aggregazioni silenziose di eventi incomparabili.
10. `training_interventions`: finding originario, obiettivo osservabile, esercitazione, data, approvazione, esecuzione e valutazione staff. **Non basta un esercizio proposto per dire che l'allenamento è stato svolto.**
11. `followup_checks`: finding/intervento da verificare, match successivo, condizioni comparabili, opportunità e incidenti osservati, giudizio `migliorato/non_migliorato/incerto/non_valutabile`, spiegazione e prove; il nesso causale resta `ipotesi` salvo disegno/prove adeguate.
12. `decision_briefings` + `briefing_items`: partita/momento di generazione, max 3 decisioni ordinate per rilevanza, motivazione, alternative, evidenze pro/contro, impatto atteso come ipotesi, approvazione dello staff, esito di revisione.
13. `analysis_jobs` e/o `local_media_manifest`: stato job, versioni pipeline, proxy/clip/checkpoint, diagnostica, errori, hash, mapping fra ID locali e ID DB, tentativi di sync senza duplicati.
14. `analysis_audit_log`: chi/quale processo ha creato o approvato cosa, quando, vecchia/nuova revisione, motivazione. Proteggere la cronologia approvata da sovrascritture.

**Vincoli dati richiesti:**
- FK e indici per `season_id`, `match_id`, `player_id`, `principle_id`, `(video_start_ms, video_end_ms)` e versioni; `start_ms <= end_ms`; no orfani; timestamps `timestamptz` dove applicabile; `created_at`, `updated_at`, `created_by`, `reviewed_by`, `reviewed_at` dove pertinenti; uuid univoci o ID esistenti.
- Distinguere `not_observable` da `not_applicable`, `missing_source` da `contradiction`, `undetermined` da `negative_result`. L'assenza di episodio annotato **non equivale** al comportamento corretto.
- RLS secondo sistema auth effettivo e permessi staff (lettura/redazione/approvazione); mai accesso anonimo a dati di giocatori e filmati. Migrazioni ripetibili su database di test, rollback documentato, backup prima di eseguire su dati reali.
- Crea `docs/viceallenatore/data-model.md`, diagramma ER/Mermaid e `docs/viceallenatore/event-contract.json` (JSON Schema) o schema Zod/Pydantic che rappresenti l'evento canonico e i riferimenti a evidenze. **Un singolo event contract** condiviso da importatori, analisi locale, UI e DB.
- Progetta versionamento di `event_schema_version`, `analysis_pipeline_version`, `plan_version` e `model_version` per rendere le analisi riproducibili nel tempo.

### Contratto evento — esempio strutturale, NON dati reali

```json
{
  "schema_version": "1.0.0",
  "event_id": "UUID",
  "match_id": "ID canonico del repository",
  "season_id": "ID canonico del repository",
  "period": "first_half | second_half | extra_time | unknown",
  "video_start_ms": 123000,
  "video_end_ms": 132000,
  "game_clock": { "minute": null, "stoppage": null, "mapping_verified": false },
  "event_type": "pressing | build_up | transition | set_piece | other",
  "phase": "in_possession | out_of_possession | transition | unknown",
  "team_id": null,
  "player_ids": [],
  "observability": "observable | partially_observable | not_observable",
  "relevance": "relevant | not_relevant | undetermined",
  "source_refs": [{ "source_id": "UUID", "kind": "video", "start_ms": 123000, "end_ms": 132000 }],
  "principle_ref": { "principle_id": null, "game_plan_version_id": null, "pdf_page": null },
  "claims": [{ "type": "osservazione", "text": "TESTO DIMOSTRATIVO, NON FATTO ACCERTATO", "review_status": "proposed", "confidence": "unknown" }],
  "assessment": { "plan_compliance": "non_valutabile", "technical_quality": "non_valutabile", "review_status": "proposed" },
  "sync": { "origin": "local", "revision": 1 }
}
```

Non implementare alla cieca il JSON nella forma esatta se l'architettura esistente richiede altre strutture, ma **mantieni tutte le distinzioni semantiche**.

## 6. RICORRENZE E VERIFICA DEGLI ALLENAMENTI (PREDISPOSIZIONE ORA, AUTOMAZIONI DOPO)

- Un pattern tattico diventa **ricorrente** soltanto su episodi *comparabili per situazione*: stesso principio, fase, contesto, possibilità di osservazione e opportunità rilevanti. Salva sia `n_violazioni` sia `n_opportunita_osservate`, più partite e distribuzione; non confondere un singolo errore vistoso con un'abitudine.
- In futuro il motore potrà proporre soglie configurabili dallo staff, senza soglie hard-coded arbitrarie, con almeno `episodio_isolato`, `segnale_da_verificare`, `pattern_ricorrente`, `dati_insufficienti`.
- Collega **finding → esercizio proposto → allenamento effettivamente svolto → match di verifica → nuove evidenze**. Se cambia avversario/ruolo/sistema/condizione, mostra che la comparazione potrebbe non essere valida.
- Non dichiarare "l'esercizio ha causato il miglioramento" sulla base di un prima/dopo senza controlli. Descrivere al massimo "successivamente osservato" o "compatibile con un miglioramento", con numero e limiti del campione.
- Nella Fase 1 basta poter **registrare manualmente** finding, proposta esercizio, esecuzione e target partita successiva, e recuperarli; l'inferenza automatica si implementa solo dopo dati reali accumulati.

## 7. FASE 1 — MVP DA IMPLEMENTARE E TESTARE ADESSO

1. Nuova area integrata dentro `villanovese-analytics`: scelta partita esistente, riepilogo Veo/YouCoach con fonti, import/revisione piano gara, episodi, schede individuali, sintesi squadra e opponent scouting, sezioni memorie/allenamenti visibili ma senza promettere automazioni non sviluppate.
2. Diagnostica Mac e setup del motore locale, con avvio semplice `Avvia Viceallenatore AI.command` se utile per componenti locali (l'utente **non deve aprire Codex per usare l'app**). L'interfaccia principale resta Analytics: non creare una homepage Streamlit separata se un frontend esistente può integrare queste funzioni. Predisporre endpoint locali autenticati o bundle di sync sicuri.
3. Import percorso file video originale; ffprobe metadata; proxy ≤1080p senza upscale; timeline/seeking; selezione episodi e generazione clip MP4 dall'originale; persistenza anche dopo riavvio; mapping tra tempo filmato e minuto gara manuale.
4. Import dei due `.mhtml` in locale, parsing dati reali, riepilogo conflitti senza overwrite delle fonti. Riconciliazione manuale con la partita/rosa esistente. File hashing e provenance.
5. Import PDF con PyMuPDF e anteprima pagine; editor principi; approvazione/versionamento esplicito; associazione episodi→principi→pagine. Diagrammi con revisione umana.
6. Giudizi tattici e qualità tecnica separati; conformità solo episodi pertinenti/osservabili; conteggi evidenti; distinta analisi piazzati.
7. TOP/FLOP individuali fino a tre per tipo, 3 forze/debolezze squadra e 3–5 opportunità avversarie **soltanto con evidenze sufficienti**. Nessun risultato fittizio per riempire quote.
8. Registro impressioni allenatore, registro evidenze e prima schermata comparativa `supportata/contraddetta/non verificabile` **manuale o con regole trasparenti**, senza LLM obbligatorio. Permetti l'annotazione della confutazione e risposta staff.
9. Registro stagionale minimo: trovare eventi e finding precedenti, collegare proposta di esercitazione e futura partita di verifica, vedere stato follow-up. **Non sviluppare ancora autonomamente l'inferenza di ricorrenza e causalità**, ma salvare i campi indispensabili.
10. Report PDF italiano: riepilogo partita e fonti, 3 forze/3 debolezze se disponibili, analisi giocatori e avversario, Game Plan Compliance, piazzati, impressioni supportate/contraddette/indeterminate, attività correttive e **max 3 decisioni** solo se dotate di evidenze e approvate; link/ID/timestamp delle clip, versione del piano e pagina del PDF.
11. Test di integrazione sul database di sviluppo, test degli importatori reali, persistenza e riavvio, test d'accesso, test generazione clip, report, revisione PDF e sincronizzazione. Evitare regressioni all'Analytics originale.

## 8. FASI SUCCESSIVE (NON IMPLEMENTARLE ORA, SOLO CONTRATTI E INTERFACCE)

- **Fase 2 — CV opzionale:** detection giocatori/arbitro/pallone, team-color, tracking, suggerimenti episodi, possibili pattern di movimento. PyTorch MPS se davvero disponibile, CPU fallback, licenze dei pesi verificate, checkpoint, batch e sampling. Niente identificazione certa del singolo giocatore da colore/numero senza conferma. Misurare precisione soltanto su ground truth annotata.
- **Fase 3 — Intelligence longitudinale:** cercare pattern ricorrenti con opportunità/contesti comparabili, confrontare con impressioni e controevidenze, suggerire esercizi, verificare partita successiva, proporre briefing fino a 3 decisioni. Pubblicazione con revisione umana e confidenza spiegata. Possibile LLM multimodale **solo opzionale e con privacy/consenso**; non usare LLM per inventare fatti video.
- **Benchmark:** quando disponibile il video reale, benchmark di **5 minuti** sul Mac con tempo di proxy, RAM, spazio, eventuali fallimenti; in Fase 2 aggiungere metriche CV solo se esistono annotazioni di verità a terra. Non simulare benchmark.

## 9. DEFINIZIONE DI FATTORE DI QUALITÀ E REGOLE NON NEGOZIABILI

- La piattaforma deve essere **critica**, non compiacente. Separare `osservato` vs `interpretato` vs `ipotizzato` in tutte le uscite. Se l'allenatore sbaglia e le fonti sostengono il contrario, mostrarlo con rispetto e prove. Se le fonti non bastano, dichiarare `non valutabile`.
- No decisioni automatiche senza autorizzazione staff; nessuna sovrascrittura di versioni già approvate e nessuna cancellazione non auditata.
- Una statistica aggregata è sempre accompagnata da numeratore, denominatore, numero di partite e limiti di osservazione; non inventare dati mancanti.
- Conservare il video originale come fonte locale; evitare upload 4K a Supabase o Vercel salvo esplicita scelta futura. Non porre video o report in Git: aggiorna `.gitignore` e fornisci struttura `data/local/matches/<match-id>/` con manifest versione controllata.
- Testa accessi solo utenti autorizzati, RLS, validazione file MHTML/PDF/video, path traversal, sessioni, integrità delle clip, errori import ed eventuale sync ripetuta.

## 10. CONSEGNA E CRITERI DI ACCETTAZIONE

Esegui nell'ordine:

A. **Audit verificato** del progetto e Mac con comandi reali e lista dei moduli/tabelle effettivamente trovati.
B. **Schema e migrazioni additive** su DB di sviluppo, con test di RLS, relazioni, versioni e reversibilità, file `docs/viceallenatore/data-model.md`, diagramma ER e contratto evento. Mostra esattamente cosa è stato migrato, non applicare migrazioni distruttive al DB produzione.
C. **MVP integrato funzionante** nei componenti effettivi di Villanovese Analytics, con motore locale Mac: import video/report/PDF, proxy, clip, episodi, conformità, TOP/FLOP, report PDF, registro impressioni e primi link finding→allenamento→verifica.
D. **Test end-to-end**: match canonico → due MHTML importati → conflitto fonte → piano PDF approvato → evento con tempo video → clip originale → valutazione → PDF → ritrovo dei dati dopo riavvio. Prova che l'Analytics preesistente continua a funzionare.
E. **Documentazione e avvio quotidiano**: README, installazione locale, comando/doppio clic se necessario, come aggiungere una partita, dove collocare i file, backup e privacy, diagnosi guasti. Codex serve a sviluppare, non all'uso normale.
F. **Resoconto sincero**: file e tabelle cambiate, test lanciati e loro esiti, dati effettivi importati, benchmark solo se davvero eseguito, limitazioni (specialmente movimenti senza palla in follow-cam), TODO successivi in priorità.

**Non fermarti a fare domande generiche che l'ispezione del progetto può risolvere. Se manca una credenziale necessaria, segnala il blocco e continua con schema, migrazioni, UI e test offline dove possibile.** Il risultato non deve essere un nuovo progetto parallelo, ma una funzionalità evolutiva di `villanovese-analytics` con storia tattica verificabile.
