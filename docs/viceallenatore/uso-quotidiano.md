# Uso quotidiano · Importa → Analizza → Revisiona

La schermata iniziale riutilizza partita, rosa, distinta, eventi e statistiche da Analytics. Non è necessario reinserire questi dati o configurare un piano specifico per ogni partita.

1. Apri il launcher e scegli **1**, oppure avvia `npm run dev`, quindi accedi come STAFF a `/viceallenatore`.
2. **Importa**: scegli una partita esistente. La schermata mostra ciò che è già disponibile e propone solo report integrativi mancanti. Puoi selezionare direttamente i file MHTML Veo/YouCoach; vengono decodificati nel browser, senza esecuzione HTML o JavaScript, e si salvano solo hash e metadati estratti. Il bundle JSON rimane compatibile per video, PDF e annotazioni del motore locale. I duplicati sono riconosciuti dal checksum.
3. **Analizza**: la bozza viene composta dai dati disponibili con regole trasparenti, senza un servizio AI esterno. Distingue fatti documentati, interpretazioni e ipotesi, con fonti. Un valore assente non viene sostituito da zero; un valore zero esplicitamente presente nel DB viene descritto come dato registrato. Non inferisce cause tattiche dagli aggregati.
4. **Revisiona**: la coda contiene conflitti e verifiche importanti. Puoi consolidare un minuto ambiguo, correggere un testo o scartare una proposta. Le altre osservazioni documentate non richiedono conferma. Puoi rinviare qualsiasi punto aperto.
5. Il **modello stagionale** è in un pannello richiudibile: descrivilo una volta in testo libero e approva. Si riutilizza automaticamente per stagione; se esistono più modelli, scegli quello della stagione una sola volta. Ogni modifica crea una versione approvata nuova. Non serve un PDF partita per usare il modello o generare la bozza.
6. Le correzioni e revisioni sono salvate con il testo originale e le fonti. Si riapplicano automaticamente alla stessa evidenza invariata; se cambia l'evidenza, il punto torna da verificare. Le revisioni delle altre partite della stagione compaiono come memoria consultabile, senza trasformarsi in fatti della partita corrente.
7. Esporta la bozza in JSON e usa il menu **6** del launcher per il PDF. Il report conserva tipi di affermazione, fonti, correzioni e stato di revisione; omette sezioni opzionali prive di evidenze.

Piano gara specifico, TOP/FLOP, sincronizzazione video, episodi e allenamenti sono in **Strumenti facoltativi**. L'analisi automatica del video resta una fase successiva.

Per attivare salvataggio bozze e memoria applica anche `supabase/migrations/20261121120000_viceallenatore_zero_entry.sql` al database di sviluppo dopo la migration di fase 1. La nuova migration aggiunge impostazione stagionale, bozze e revisioni; non modifica i dati Analytics esistenti. In assenza delle nuove tabelle la lettura dei dati disponibili e l'esportazione funzionano, mentre il salvataggio segnala l'errore.

---

## Riferimento per gli strumenti facoltativi

### Configurazione del motore locale del Viceallenatore AI

## Preparazione

1. L'app principale è Villanovese Analytics. Configura `.env.local` come nel README e `npm install` una volta. Per l'uso locale, doppio clic su `Avvia Viceallenatore AI.command`, scelta **1**. Per un sito già pubblicato, apri normalmente Analytics e accedi come `STAFF` attivo.
2. Il motore locale usa `local_engine/.venv`. Se manca: `python3 -m venv local_engine/.venv` e `local_engine/.venv/bin/python -m pip install 'PyMuPDF>=1.24,<2' 'reportlab>=4,<5'`. Installa FFmpeg con `brew install ffmpeg` se mancante. Intel/Apple Silicon: usare Python e FFmpeg compatibili con la propria architettura; questo setup è stato provato solo su M5.
3. Fai backup del database di sviluppo prima di applicare `supabase/migrations/20261120120000_viceallenatore_phase1.sql`. Non applicare direttamente alla produzione. La migration è additiva e usa RLS staff.

## Partita e fonti

1. Apri `/viceallenatore` e scegli una partita esistente; copia il suo `match_id` canonico. Non creare un'altra partita per il report importato.
2. Nel menu del file `.command`, scelta **2**, importa separatamente video (`veo`, `video`), report Veo (`veo`, `mhtml`), report YouCoach (`youcoach`, `mhtml`) e piano gara (`staff`, `pdf`). Inserisci un percorso completo con spazi normalmente: il launcher lo passa come un argomento unico. L'output mostra gli ID delle fonti.
3. Le fonti reali sono esterne al repository o in `data/local/` ignorata da Git. Il manifest SQLite, anteprime e clip sono in `data/local/matches/<hash-id>/`. Il nome della cartella è derivato dall'ID; il bundle mantiene l'ID vero.
4. Dal menu scelta **5** esporta il bundle JSON; importalo nella UI. Un secondo import con gli stessi ID non duplica le fonti. Gli originali non vengono caricati nel cloud. Il PDF originale può essere aperto con il file picker nella UI, che mostra le pagine localmente; il motore estrae testo e PNG per pagina.
5. Controlla i candidati estratti dai MHTML. Se i minuti del primo gol divergono, la UI presenta entrambi e chiede un valore e un motivo approvati. I file originali non cambiano. La diversa cronologia non implica sincronizzazione video.

## Episodi, clip e piano

1. Nella UI apri il video dal Mac con file picker. Posizionati nella timeline e segna inizio/fine; registra l'osservazione, la fonte e, solo se verificato, un giocatore canonico. Il minuto gara è indipendente e inizialmente non sincronizzato.
2. Per generare una clip dal file originale usa il menu **4** con source ID video e tempi in millisecondi (secondi UI × 1000). Esporta di nuovo il bundle e importalo: il manifest registra SHA-256 della clip. Il collegamento automatico evento–clip funziona se fonte e intervallo coincidono esattamente. Puoi anche annotare localmente con il menu **7**: l'evento esportato usa il contratto JSON canonico. Puoi creare un proxy fino a 1080p con il menu **3**; non c'è upscaling.
3. Crea il **Tactical DNA stagionale** con stagione, fase, condizioni, zona, ruoli, comportamento osservabile ed eccezioni; approva la sua versione. Registra un tratto continuo in **Sincronizzazione manuale** con periodo, inizio/fine video e minuto gara iniziale. Per un episodio dentro il tratto, controlla il minuto annotato e confermalo esplicitamente. Il software non lo deduce automaticamente dall'offset. Importa il PDF come fonte e segnalo come verificato; poi crea una bozza di piano e principi con pagina, fase, condizioni e comportamento osservabile. Approva esplicitamente la versione. Ogni versione del piano conserva il riferimento alla versione del DNA approvata. Le versioni approvate e i loro principi sono immutabili; crea una nuova bozza per modificarli. Valuta episodio e qualità tecnica separatamente.
4. Le impressioni iniziali restano intatte; nuove revisioni indicano sostegno, contraddizione o evidenza insufficiente. Segna la clip come verificata e collega a un finding un episodio valutato con quella clip prima di confermarlo. Esercizio, svolgimento e partita di follow-up sono passaggi distinti; il prima/dopo non prova causalità. Il briefing accetta al massimo tre decisioni motivate, approvate dallo staff.

## Report e backup

La UI può stampare una scheda oppure esportare un JSON di revisione. Con il menu **6** genera il PDF italiano dal JSON esportato. Il PDF include fonti, denominatore della conformità, episodi, TOP/FLOP solo con clip, finding confermati, impressioni, interventi e al massimo tre decisioni approvate. Non compila sezioni con fatti inventati.

Per backup, copia `data/local/matches/` e gli originali conservati esternamente, oltre al backup Supabase. Il manifest contiene path locali privati: non pubblicarlo né metterlo in Git. Per ripristino su un altro Mac ricolloca gli originali e usa la scelta **8** del launcher per rimappare ogni source ID: il file è accettato soltanto se dimensione e SHA-256 coincidono. Errori comuni: `ffprobe` mancante, PDF protetto da password, MHTML oltre 50 MB, ID partita diverso dal bundle, mancanza di spazio disco, migrazione non applicata. La UI espone gli errori Supabase senza presumere dati importati.

Rollback DB: prima della migrazione crea uno snapshot del database di sviluppo. Se serve tornare indietro, ripristina quello snapshot in un database di sviluppo separato e verifica `matches`, `players` e autenticazione prima di spostare le connessioni. Non eseguire una `DROP TABLE` automatica: cancellerebbe le revisioni e le evidenze create dopo la migrazione. Il rollback del codice consiste nel ripristinare il commit precedente; il database additivo può rimanere senza modificare le tabelle Analytics preesistenti.
