# Lettore generale dei piani PDF · prima versione

Il lettore è nella sezione **Piano gara · confronto con il video → Lettura automatica del PDF**. Un altro PDF non serve per sviluppare il modulo; serve per verificarne la capacità di generalizzare, soprattutto con impaginazioni e notazioni mai viste.

## Disponibile adesso

- Importazione PDF direttamente dalla partita selezionata, senza Match ID da ricopiare, launcher o JSON manuale. Originali e anteprime restano sul Mac, sotto `data/local/`, con controllo STAFF e stessa origine. Limiti: 50 MB, 300 pagine, PDF non protetto. Duplicati riconosciuti dal checksum, senza cancellare la fonte esistente.
- Rendering pagina per pagina, con rotazione ricavata dalla direzione dominante del testo invece di numeri di pagina o formato verticale/orizzontale. Le pagine senza testo mantengono l'orientamento originale: una scansione ruotata può richiedere una futura normalizzazione dedicata.
- Testo nativo e OCR locale nelle immagini. Su macOS viene usato Apple Vision tramite `native_ocr.swift`, compilato al primo utilizzo con gli strumenti Swift installati. Binario e cache sono in `data/local/`. Nessun file viene inviato a servizi remoti. Se il servizio OCR non è disponibile, il messaggio resta visibile e il testo nativo viene conservato.
- Proposte di nomi collegate alla rosa esistente, senza inventare posizioni dalle coordinate di un'etichetta o identificare giocatori nel video. Nomi ambigui non diventano collegamenti certi. Le entità mantengono i riquadri di evidenza sulla pagina.
- Correzioni, domande rinviabili, cronologia locale e controllo delle revisioni concorrenti. La stessa fonte e versione del lettore riusano la cache e le correzioni, anche quando cambia la rosa di riferimento: i collegamenti nominali vengono ricalcolati. Una rilettura esplicita archivia la versione precedente.

Il pulsante **Leggi il piano sul Mac** elabora una pagina per richiesta, conserva i risultati intermedi e permette di fermarsi dopo la pagina in corso. **Rileggi questa pagina** ripete una pagina se è necessario correggere un problema di runtime o aggiornare l'estrazione. Un documento letto non equivale a uno schema tattico interpretato e approvato.

## Interpretazione dei disegni

Il codice include un adattatore per un modello visivo eseguito da Ollama **esclusivamente su `127.0.0.1:11434`**, con immagine locale e contratto strutturato. Il trasporto ignora i proxy di sistema, rifiuta redirect e non accetta endpoint cloud dal browser. Prima di trasmettere immagini richiede un modello GGUF presente nell'elenco locale, con digest e dimensione superiore a 1 MB; rifiuta tag cloud e riferimenti a modelli remoti. Non installa o scarica modelli.

Per abilitarlo, un amministratore deve installare e avviare un modello locale con supporto immagini e configurare una volta, nell'ambiente dell'app:

```text
VICEALLENATORE_VISION_MODEL=nome-del-modello-visivo-installato-localmente
```

Poi riavviare l'app e rileggere le pagine. Il nome del modello è configurazione server; non si inserisce per ogni gara. L'adattatore usa [l'API di generazione](https://docs.ollama.com/api/generate), [immagini locali](https://docs.ollama.com/capabilities/vision) e [output con schema](https://docs.ollama.com/capabilities/structured-outputs). Il solo supporto di queste API non prova la correttezza della lettura calcistica: modello e prompt devono essere verificati sui piani reali.

**Su questo Mac il modello visivo non è ancora installato/configurato.** L'OCR è stato provato sulle 11 pagine reali, senza errori del motore locale: nello schema di possesso a pagina 2 sono stati recuperati gli 11 riferimenti nominali. Questi conteggi non sono una stima dell'accuratezza generale o del numero di giocatori in tutti i riquadri. Il percorso del modello visivo è testato con risposte simulate e validate, non con inferenze reali. Le letture testuali sono correggibili, ma il server impedisce di approvarle come interpretazioni dei disegni.

## Contratto e passaggio al video

`pdf-reading.schema.json` rappresenta tipo di pagina, fase, zona, riferimenti, campo, relazioni, condizioni del lato e domande. Le relazioni distinguono movimento, alternative, assegnazioni e battitori. Tutte le entità e relazioni hanno un riquadro di evidenza; le coordinate delle icone sono separate da quelle delle etichette. L'output del modello non può contenere approvazioni o istruzioni eseguibili. Le istruzioni eventualmente presenti nel PDF sono trattate come contenuto non attendibile.

Solo una conferma esplicita dello staff produce una versione approvata. Il compilatore controlla orientamento, reticolo, partenze e destinazioni, ruoli, gruppi di battitori e alternative applicabili per lato. Se mancano condizioni essenziali, la lettura resta consultabile e il confronto metrico è sospeso con un motivo visibile. Nessuna percentuale di affidabilità del modello viene trattata come certificazione.

Gli schemi completi alimentano i confronti già esistenti, senza modificare rosa o statistiche. I riquadri dei marcatori rimangono assegnazioni, le icone generiche della barriera non diventano convocati e le alternative non vengono sommate. Una lettura nuova non sovrascrive automaticamente il piano già verificato: serve approvarla; eventuali successive correzioni rendono inattiva la sua compilazione finché non viene confermata di nuovo. Le conferme del modello stagionale restano indipendenti.

La memoria attuale riguarda la stessa fonte/versione e conserva la cronologia. Non addestra il modello e non trasferisce automaticamente simboli, nomi o approvazioni a PDF differenti. Il riuso tra formati richiede ancora una verifica su piani ulteriori e una memoria di notazione esplicitamente validata.

## Validazione

I test coprono input del modello non validi, coordinate e riferimenti, fonti visive, OCR distinto dalle posizioni, rotazioni del testo, cache delle correzioni, revisioni concorrenti, impossibilità di approvare il solo OCR, riquadri dei marcatori, battitori, alternative per lato, connessione soltanto locale e importazioni duplicate/fallite. I test del modello sono simulati e non stimano accuratezza calcistica.

Il caricamento PDF è verificato con test isolati che esercitano autenticazione prima della lettura, partita canonica, intestazione del file, mantenimento della copia registrata e rimozione della sola copia temporanea nei casi di duplicato o errore. La prova automatica del file chooser Chrome è stata limitata dall'accesso ai file dell'estensione; non sono state modificate le autorizzazioni del browser.

Prima di dichiarare il lettore universale occorrono il modello visivo attivo, una prova sul piano esistente e una verifica su PDF di formato diverso non usati per preparare regole o correzioni. Riferimenti incompleti, frecce ambigue e contenuti illeggibili devono restare espliciti.
