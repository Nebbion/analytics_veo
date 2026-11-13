# LND-WATCHER 2.0 — workflow n8n

Questa cartella contiene due export JSON importabili in n8n:

- `LND_WATCHER_2_0_COLLECTOR.json`: controllo dei Comunicati Ufficiali LND Veneto, download PDF, hash, estrazione testo, analisi AI, persistenza idempotente e accodamento Telegram;
- `LND_WATCHER_2_0_PREMATCH_REPORT.json`: report prepartita del venerdì basato esclusivamente sui dati LND `VERIFIED` e sul ledger verificato.

Entrambi gli export sono intenzionalmente `active: false` e non contengono credenziali, password, token o ID reali.

## Prerequisiti

1. Le migration LND-WATCHER devono essere già applicate.
2. Il calendario 2026/27 deve essere presente in `lnd_fixtures`.
3. Deve esistere un login PostgreSQL server-side dedicato, membro esclusivamente del ruolo `lnd_watcher_worker`.
4. La connessione PostgreSQL n8n deve usare TLS.
5. Per il collector serve una credenziale OpenAI n8n.
6. Per le notifiche serve una credenziale Telegram n8n e il bot deve poter scrivere nella chat o nel canale scelto.

Il login n8n e i relativi segreti non sono creati dai workflow e non devono essere salvati nel repository.

## Importazione

In n8n selezionare **Import from File** e importare i due JSON separatamente.

Dopo l'importazione:

1. assegnare la stessa credenziale PostgreSQL minima a tutti i nodi Postgres;
2. nel collector, assegnare la credenziale al nodo `OpenAI Chat Model`;
3. assegnare la credenziale Telegram ai nodi di invio;
4. sostituire `REPLACE_WITH_TELEGRAM_CHAT_ID` nei nodi `Collector Config` e `Report Config`;
5. lasciare `telegramEnabled: false` durante i test manuali;
6. eseguire prima `Manual Test`, poi `Manual Report Test`;
7. verificare gli inserimenti nelle sole tabelle `lnd_*`;
8. impostare `telegramEnabled: true` soltanto dopo il collaudo;
9. pubblicare/attivare i workflow.

## Pianificazione

Il collector usa la timezone del workflow `Europe/Rome` e due espressioni cron a sei campi:

```text
0 0,30 15-19 * * 1,3,5
0 0 20 * * 1,3,5
```

Esegue quindi i controlli lunedì, mercoledì e venerdì ogni 30 minuti dalle 15:00 alle 19:30, più il controllo delle 20:00.

Il report prepartita usa:

```text
0 5 20 * * 5
```

e parte il venerdì alle 20:05, dopo l'ultimo controllo del collector.

## Fonte documentale

Il collector usa l'archivio ufficiale del Comitato Regionale Veneto:

```text
https://www.figcvenetocalcio.it/archivio-comunicati
```

Vengono considerati solo i PDF regionali principali con nome `Com_N.pdf`. Allegati, comunicati Calcio a 5 e file non PDF non sono acquisiti automaticamente.

Ogni esecuzione controlla al massimo i tre comunicati regionali più recenti. Il PDF viene identificato tramite SHA-256: una riesecuzione con contenuto invariato non crea duplicati; un PDF sostituito conserva il documento precedente tramite `replaces_document_id`.

## Regole di sicurezza e verifica

- Le query di scrittura usano `$1::jsonb` e parametri bind del nodo PostgreSQL.
- Nessun output AI viene concatenato a SQL.
- L'AI può produrre soltanto `PARSED`, `AMBIGUOUS` o `NON_VERIFICABILE`, mai `VERIFIED`.
- Un nome squadra viene collegato solo con corrispondenza normalizzata esatta al set monitorato.
- Un tesserato non viene collegato automaticamente: `person_id` resta `NULL` finché manca una verifica univoca.
- Il ledger non viene aggiornato automaticamente da risultati AI non verificati.
- Campionato, Coppa Veneto e altre competizioni restano distinti. Se non esiste una singola competizione compatibile in `lnd_competitions`, il provvedimento viene segnalato come ambiguo e non inserito.
- Il report prepartita usa solo provvedimenti e movimenti ledger `VERIFIED`.
- Nessuna query aggiorna `players`, `matches`, `player_match_stats` o `match_events`.

## Limiti della fase

- Il backfill 2025/26 non è incluso: manca ancora una fonte calendario verificata nel repository.
- Le competizioni di Coppa devono essere censite in `lnd_competitions` prima di poter attribuire automaticamente un provvedimento a quella competizione.
- Lo stato `VERIFIED` richiede un passaggio di verifica separato, manuale o deterministico.
- Il nodo `Extract From File` deve essere provato sulla versione n8n effettivamente installata; il comportamento PDF dipende dal runtime della distribuzione.
- Gli export sono stati validati staticamente, ma non importati in un'istanza n8n dell'utente.

