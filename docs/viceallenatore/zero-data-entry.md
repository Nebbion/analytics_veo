# Viceallenatore · revisione del 21 novembre 2026

## Comportamento

La route rimane `/viceallenatore`, protetta dall'accesso STAFF esistente. Il nuovo componente iniziale è `ViceallenatoreDashboard`; `ViceallenatoreClient` conserva gli strumenti avanzati, caricati quando richiesti. Nessun piano gara o valutazione individuale è prerequisito della bozza.

Il modulo legge `matches`, `players`, `player_match_stats`, `match_lineups`, `match_events` e le fonti già importate. Non crea partite o giocatori e non riscrive statistiche canoniche. La cronaca MHTML è mostrata se gli eventi ufficiali non sono già presenti; le incongruenze fra report restano visibili. I campi statistici attualmente aggregati dalla bozza sono `tiri_totali`, `passaggi` e `passaggi_completati`; la copertura delle righe è esplicita.

L'import MHTML diretto decodifica MIME, quoted-printable/base64 e charset; estrae testo senza attivare contenuti HTML. L'associazione usa la partita selezionata, la data e il titolo: una data discordante interrompe l'import, un'identità ambigua chiede conferma. Il limite è 50 MB. JSON/bundle rimangono compatibili, con prevalidazione degli eventi e import ripetibile anche sulle evidenze già revisionate. Originali video/PDF e dati personali estranei al report non sono trasferiti dall'import diretto.

La stagione è letta dal campo esistente se presente o derivata dalla data (luglio–giugno), senza introdurre un falso collegamento con il registro LND. Le etichette `2026/27` e `2026/2027` sono riconosciute come la stessa stagione. Un solo modello approvato viene riutilizzato; più modelli richiedono una scelta persistente. Il testo libero sostituisce l'inserimento obbligatorio di molti campi; approvare una modifica crea una versione nuova.

## Bozza e revisioni

Il generatore è deterministico (`draft-rules-1`), senza LLM o CV. I fatti sono dati documentati dalle fonti, non prove di verità assoluta. Le interpretazioni sono confronti descrittivi e limiti; le ipotesi sono verifiche proposte rispetto al modello. Non genera causalità, classifiche individuali o conformità al piano prive di episodi.

Le revisioni sono append-only e legate alla chiave del punto e alla sua evidenza. Una correzione invariata viene recuperata nella stessa gara; una fonte o un contenuto cambiato richiede una nuova verifica. Le revisioni di altre gare della stagione sono contesto consultabile, non conclusioni trasferite automaticamente. Una conferma di un'ipotesi la mantiene come verifica da svolgere.

La migration `20261121120000_viceallenatore_zero_entry.sql` aggiunge:

- `tactical_season_settings`: modello scelto una volta per stagione;
- `tactical_analysis_drafts`: snapshot degli input, hash, versione del modello e punti della bozza;
- `tactical_analysis_reviews`: correzioni e verifiche immutabili con autore e data.

FK, RLS STAFF, audit e verifica del legame revisione–evidenza proteggono la persistenza. Nessun nuovo accesso per giocatori o anonimi. Le nuove tabelle non sono state applicate al database remoto durante questo lavoro. Per rollback, ripristinare lo snapshot di sviluppo come descritto nella guida; evitare la cancellazione della storia delle revisioni.

## Verifica

- `npm run build`: superato. `node --test tests/*.test.mjs`: 33/33 superati su Node 26. `local_engine/.venv/bin/python -m unittest discover -s tests -p test_viceallenatore_local.py`: 9/9 superati. I test coprono bozza, MIME, stagioni, correzioni, retry del bundle e conservazione delle evidenze revisionate.
- Parser browser verificato sui due file reali: 9 KPI Veo, 12 eventi YouCoach, conflitto 12′/13′, UTF-8 preservato.
- PostgreSQL 17 isolato: migration applicata, bozza senza modello/piano/video, correzioni persistenti, rifiuto di revisioni su evidenze inesistenti, RLS giocatore/anon e audit.
- Browser nella sessione locale: tre passi visibili, dati reali riutilizzati (rosa, distinta, statistiche ed eventi), bozza generata senza piano. Il salvataggio sul database collegato non è stato provato perché le tre nuove tabelle non sono ancora applicate; l'errore viene esposto senza perdere la lettura dei dati disponibili.
- PDF: la modalità bozza mantiene fatti/interpretazioni/ipotesi e revisioni, esclude punti scartati e non aggiunge TOP/FLOP o denominatori vuoti.
