# LND-WATCHER 2.0 — Implementazione database, fase 1

**Data:** 13 novembre 2026  
**Stato:** migration e calendario 2026/27 applicati al progetto Supabase collegato; n8n non ancora configurato  
**Repository:** Analytics Villanovese

## 1. Risultato

Questa fase prepara un dominio PostgreSQL indipendente per LND-WATCHER senza modificare codice applicativo o tabelle Analytics.

File prodotti:

| File | Scopo |
|---|---|
| `supabase/migrations/20261113150000_create_lnd_watcher_phase1.sql` | schema, vincoli, indici, RLS, ruolo n8n e controcheck read-only |
| `scripts/import-lnd-calendar.mjs` | parsing e import idempotente delle 30 fixture 2026/27 |
| `sql/lnd_watcher_n8n_queries.sql` | query parametrizzate per i workflow n8n |
| `tests/import-lnd-calendar.test.mjs` | test del parser e del modello calendario |
| `tests/lnd-migration-static.test.mjs` | controlli statici su schema, isolamento e sicurezza |
| `LND_WATCHER_IMPLEMENTATION.md` | istruzioni, decisioni e rischi della fase |

Il 13 novembre 2026 la migration è stata applicata manualmente al progetto
Supabase collegato, dopo approvazione esplicita, e il calendario è stato
importato. Non sono stati eseguiti deploy applicativi, commit o push Git; la
GitHub Action presente nel repository non è stata attivata.

## 2. Principi architetturali

### 2.1 Isolamento da Analytics

Tutte le nuove tabelle hanno prefisso `lnd_`. La migration non contiene `INSERT`, `UPDATE`, `DELETE` o `ALTER TABLE` sulle tabelle Analytics.

Il sistema esistente resta proprietario di:

- `players`;
- `matches`;
- `player_match_stats`;
- `player_season_stats`;
- `match_events`;
- tabelle Veo/YouCoach.

LND-WATCHER non inserisce fixture in `matches` e non inserisce provvedimenti in `match_events`, perché gli script Apps Script correnti possono cancellare e reinserire tali dati.

L'unico accesso incrociato è la funzione read-only `lnd_get_analytics_discipline_countercheck()` e la relativa vista. La funzione restituisce aggregati limitati e non possiede alcuna istruzione di scrittura.

### 2.2 Fonte ufficiale e dato non verificato

Ogni entità che può derivare da parsing o matching dispone di `verification_status`. Gli stati ammessi sono:

- `UNVERIFIED`;
- `PARSED`;
- `VERIFIED`;
- `AMBIGUOUS`;
- `NON_VERIFICABILE`;
- `REJECTED`.

Il calendario importato dal file TypeScript nasce come `UNVERIFIED`. Il file rappresenta una fonte applicativa verificata nel repository, ma non una prova LND aggiornata.

### 2.3 Correzioni append-only

I documenti e i provvedimenti non vengono sovrascritti da una rettifica:

- `lnd_documents.replaces_document_id` collega una nuova versione al PDF sostituito;
- `lnd_disciplinary_measures.supersedes_measure_id` collega il nuovo provvedimento all'originale;
- il vecchio record passa a `SUPERSEDED` o `REVOKED` senza essere eliminato;
- i movimenti del ledger vengono corretti con nuove righe `CORRECTION` o `REVOCATION`.

Documenti, provvedimenti e movimenti ledger hanno trigger che impediscono la cancellazione. Quando un record è `VERIFIED`, i suoi campi probatori/semantici diventano immutabili; una modifica richiede un nuovo record collegato.

## 3. Modello dati

## 3.1 Calendario e anagrafiche

### `lnd_seasons`

Contiene stagione, intervallo, stato attivo e verifica. `code` è univoco. Le stagioni 2025/26 e 2026/27 sono rappresentabili contemporaneamente.

La migration non inserisce dati. L'importer è stato eseguito separatamente e ha
inserito la stagione 2026/27 come `UNVERIFIED`; la stagione 2025/26 richiede una
fonte verificata separata.

### `lnd_competitions`

Ogni competizione appartiene a una stagione e ha:

- `competition_key` idempotente;
- nome/codice ufficiale;
- tipo `LEAGUE`, `COPPA_VENETO` o `OTHER`;
- categoria Analytics opzionale (`CAMPIONATO`, `COPPA`, `OTHER`).

Il ledger e i provvedimenti richiedono sempre `season_id` e `competition_id`, impedendo la fusione automatica tra campionato e coppe.

### `lnd_teams` e `lnd_team_aliases`

`team_key` identifica il record interno. `official_code`, quando disponibile, ha un indice univoco parziale. Gli alias sono record separati e tracciabili; il nome non è usato come PK.

La Villanovese usa la chiave applicativa:

```text
it-veneto:asd-villanovese
```

Questa chiave non è un codice LND/FIGC.

### `lnd_fixtures`

Le date e gli orari sono separati:

- `scheduled_date date NOT NULL`;
- `kickoff_time time NULL`;
- `kickoff_timezone`, predefinita a `Europe/Rome`.

Gli orari mancanti restano `NULL`. Lo stato supporta `SCHEDULED`, `POSTPONED`, `RESCHEDULED`, `PLAYED`, `CANCELLED`, `UNKNOWN`.

`idempotency_key` è stabile per stagione/competizione/fase/giornata e non cambia durante un rinvio. `original_scheduled_date` e `original_kickoff_time` conservano il programma iniziale; le colonne correnti possono rappresentare il recupero.

### `lnd_persons` e `lnd_registrations`

La persona è separata dal tesseramento. Sono disponibili:

- ID federale opzionale e univoco;
- `analytics_player_id` opzionale e univoco per il controcheck;
- nome originale/normalizzato e data di nascita opzionale;
- stato di verifica;
- appartenenza a squadra e stagione con intervallo temporale.

`normalized_name` non è univoco: due omonimi sono ammessi. Un provvedimento ambiguo conserva `raw_person_name` e resta `AMBIGUOUS`/`NON_VERIFICABILE` finché non è risolto.

## 3.2 Comunicati e disciplina

### `lnd_sources`

Configura la fonte ufficiale, il tipo, l'URL base e gli ultimi controlli. La migration non inserisce URL LND perché il repository non ne contiene uno verificato.

### `lnd_documents`

Deduplicazione su SHA-256 lowercase. `document_key` identifica logicamente una versione; uno stesso comunicato rettificato deve avere una nuova chiave e un nuovo hash.

Sono tracciati:

- numero/data comunicato;
- URL canonico e metadati HTTP;
- percorso storage privato opzionale;
- stato di estrazione `PENDING`, `TEXT`, `OCR`, `FAILED`;
- documento sostituito;
- run che lo ha scoperto;
- verifica.

### `lnd_disciplinary_measures`

Ogni riga conserva documento, pagina, estratto, hash, stagione, competizione, squadra/persona risolta o testo grezzo, tipo, quantità, giornate e decorrenza.

Tipi ammessi:

- `WARNING`;
- `DIFFIDA`;
- `SUSPENSION`;
- `EXPULSION`;
- `FINE`;
- `OTHER`.

L'idempotenza è imposta da `idempotency_key UNIQUE`. Una rettifica non aggiorna la semantica di una misura verificata: inserisce un successore.

### `lnd_suspension_ledger`

È la fonte per le giornate residue. Movimenti:

- `IMPOSED`: delta positivo;
- `SERVED`: delta negativo e fixture obbligatoria;
- `CORRECTION`;
- `REVOCATION`.

Una persona non può avere due movimenti `SERVED` verificati per la stessa fixture, stagione e competizione. Il saldo viene ricostruito come somma dei movimenti verificati riferiti a misure ancora attive.

## 3.3 Monitoraggio e notifiche

### `lnd_agent_runs`

`run_key` rende idempotente ogni slot pianificato. Registra versione workflow, orario, timezone, scope, contatori ed errore sintetico.

### `lnd_verifications`

Registra anche i controlli senza novità. Gli esiti distinguono `NEW`, `UNCHANGED`, `NOT_FOUND`, `AMBIGUOUS`, `SOURCE_UNAVAILABLE`, `ERROR`.

### `lnd_notifications`

`dedupe_key` impedisce invii ripetuti. Non contiene token Telegram; `destination_ref_hash` evita di conservare il destinatario in chiaro quando non necessario.

### `lnd_prematch_reports`

Conserva fixture, cutoff dati, contenuto Markdown, hash e run sorgente. Lo stato separa `DRAFT`, `READY`, `SENT`, `FAILED`.

## 4. Importazione del calendario 2026/27

## 4.1 Modalità sicura predefinita

Il comando seguente non accede a Supabase e non scrive dati:

```bash
node scripts/import-lnd-calendar.mjs
```

Per includere le 30 fixture nel JSON di preview:

```bash
node scripts/import-lnd-calendar.mjs --json
```

Il parser:

1. legge `lib/championship-calendar.ts` senza modificarlo;
2. richiede esattamente 15 giornate;
3. produce andata e ritorno, 30 fixture;
4. identifica 16 squadre complessive;
5. inverte correttamente casa/trasferta al ritorno;
6. legge la regola oraria presente nel sorgente;
7. lascia `kickoff_time = NULL` fuori dall'intervallo esplicitamente valorizzato;
8. marca tutto `UNVERIFIED`;
9. genera chiavi idempotenti stabili.

Se il formato TypeScript cambia e il parser non riconosce tutte le giornate, lo script fallisce senza scrivere.

## 4.2 Applicazione effettuata e modalità di riesecuzione

L'import iniziale è stato eseguito tramite il progetto Supabase già collegato,
senza esporre una API key:

```bash
node scripts/import-lnd-calendar.mjs --apply-via-cli
```

Il comando è stato eseguito due volte. Entrambe le letture finali hanno
restituito 1 stagione, 1 competizione, 16 team, 16 alias e 30 fixture: la
seconda esecuzione non ha prodotto duplicati.

In alternativa, per una futura esecuzione server-side tramite API:

```bash
NEXT_PUBLIC_SUPABASE_URL='...' \
LND_WATCHER_API_KEY='...' \
node scripts/import-lnd-calendar.mjs --apply
```

Un operatore già autenticato con Supabase CLI può rieseguire lo stesso payload
SQL parametrizzato dal parser:

```bash
node scripts/import-lnd-calendar.mjs --apply-via-cli
```

Per ispezionare il SQL senza applicarlo:

```bash
node scripts/import-lnd-calendar.mjs --emit-sql
```

Nessun valore reale deve essere salvato nel repository o nella cronologia shell. `LND_WATCHER_API_KEY` deve essere una credenziale ristretta se l'infrastruttura PostgREST lo consente. `SUPABASE_SERVICE_ROLE_KEY` è supportata soltanto come fallback amministrativo esplicito e non è codificata nel file.

Comportamento alla riesecuzione:

- stagioni, competizioni, squadre e alias esistenti vengono riutilizzati;
- fixture identiche restano invariate;
- la modalità CLI usa `ON CONFLICT DO NOTHING` e non sovrascrive fixture già presenti;
- la modalità REST può aggiornare una fixture `UNVERIFIED`, `SCHEDULED` e
  proveniente dallo stesso file, conservando data/orario originali;
- la modalità REST non sovrascrive una fixture verificata, rinviata o
  rettificata e produce un warning.

## 5. Controcheck Analytics in sola lettura

La vista è:

```sql
select *
from public.lnd_analytics_discipline_countercheck;
```

Espone in parallelo:

- giocatore e categoria Analytics;
- somme interne di ammonizioni/espulsioni;
- eventi YouCoach gialli/rossi;
- persona LND associata tramite `analytics_player_id`;
- stagione e competizione LND;
- diffide e misure di sospensione verificate;
- giornate imposte e saldo verificato.

Non viene calcolata uguaglianza tra cartellini, diffide e squalifiche. Gli stati sono:

- `CONFRONTO_DESCRITTIVO`: identità e categoria collegabili, ma concetti ancora distinti;
- `NON_VERIFICABILE`: identità, competizione o fonte ufficiale insufficienti.

`review_flag = POSSIBILE_DISALLINEAMENTO_DA_REVISIONARE` indica soltanto una coda di controllo: una misura ufficiale verificata senza evidenze disciplinari interne. Non è una dichiarazione di errore Analytics.

Limite strutturale: Analytics non espone una stagione verificabile in `matches`/statistiche. Il controcheck non può attribuire in modo certo i conteggi interni a 2025/26 o 2026/27.

## 6. Sicurezza e provisioning n8n

## 6.1 RLS

La migration:

- abilita RLS su tutte le 15 tabelle;
- revoca ogni privilegio a `PUBLIC`, `anon` e `authenticated`;
- non crea policy per gli utenti della dashboard;
- non rende pubblici dati disciplinari;
- concede al ruolo tecnico solo `SELECT`, `INSERT`, `UPDATE`, mai `DELETE`;
- espone il controcheck soltanto al ruolo tecnico.

La policy `lnd_worker_all` opera solo per `lnd_watcher_worker`. La presenza della policy non è sufficiente da sola: servono anche i grant, limitati nella migration.

## 6.2 Ruolo tecnico

La migration crea:

```sql
create role lnd_watcher_worker
  nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
```

Gli attributi restrittivi vengono impostati alla creazione del ruolo. La migration
non esegue `ALTER ROLE`, operazione non consentita al login usato dalla Supabase
CLI hosted.

Il ruolo non può autenticarsi. Prima di configurare n8n, un amministratore dovrà creare fuori dal repository un login dedicato con password generata nel secret manager e assegnarlo al ruolo:

```sql
-- Esempio operativo: non inserire password reali in file o migration.
create role lnd_watcher_n8n login inherit password '<SECRET_MANAGER_VALUE>';
grant lnd_watcher_worker to lnd_watcher_n8n;
```

n8n userà il nodo PostgreSQL tramite connessione TLS e credenziale cifrata. Il login non deve essere membro di `service_role`, `postgres`, `anon` o `authenticated`.

La creazione del login e l'eventuale allowlist di rete non fanno parte di questa migration perché richiedono un segreto e decisioni infrastrutturali.

## 6.3 Funzione security-definer del controcheck

Il ruolo tecnico non riceve `SELECT` diretto sulle tabelle Analytics. La funzione:

- non accetta SQL o nomi tabella come parametri;
- ha `search_path = ''`;
- usa nomi completamente qualificati;
- è `STABLE` e contiene solo `SELECT`;
- restituisce colonne aggregate predefinite;
- ha `EXECUTE` revocato a `public`, `anon`, `authenticated`.

Questo limita il controcheck alla superficie necessaria senza concedere a n8n lettura generale delle statistiche Analytics.

## 6.4 Output AI

Le query n8n usano placeholder `$1`, `$2`, ecc. Il testo estratto o generato dall'AI non deve mai diventare una porzione SQL. Prima del bind occorre validare:

- UUID;
- date e timestamp;
- SHA-256 lowercase;
- tipi di documento/provvedimento;
- stati di verifica;
- quantità e intervalli numerici.

Il testo PDF resta contenuto dati (`source_excerpt`), non istruzione.

## 7. Query n8n

Il file `sql/lnd_watcher_n8n_queries.sql` contiene:

| Query | Funzione |
|---|---|
| Q0 | apertura idempotente del run |
| Q1 | Villanovese e prossime tre avversarie |
| Q2 | comunicati già registrati/analizzati |
| Q3 | registrazione comunicato tramite SHA-256 |
| Q4 | inserimento idempotente di un provvedimento |
| Q4B | inserimento idempotente di un movimento ledger |
| Q4C | marcatura dell'originale dopo una rettifica registrata |
| Q5 | ricostruzione giornate residue dal ledger |
| Q6 | dataset del report Telegram prepartita |
| Q6B | accodamento idempotente della notifica Telegram |
| Q7 | coda incongruenze/non verificabili rispetto ad Analytics |
| Q8 | coda notifiche Telegram con locking |

Q8 deve essere eseguita in una transazione che comprenda claim e aggiornamento dello stato; `FOR UPDATE SKIP LOCKED` da solo perde il lock al termine della singola query.

## 7.1 Schedule

Timezone workflow: `Europe/Rome`.

Per ottenere 15:00, 15:30, ..., 19:30, 20:00 senza eseguire alle 20:30:

```text
0,30 15-19 * * 1,3,5
0    20    * * 1,3,5
```

Il report del venerdì deve essere generato come ramo successivo al run delle 20:00 o tramite un trigger successivo che verifichi il completamento di quel run.

## 8. Validazioni previste ed eseguite

Comandi locali sicuri:

```bash
node --check scripts/import-lnd-calendar.mjs
node --test tests/import-lnd-calendar.test.mjs tests/lnd-migration-static.test.mjs
node scripts/import-lnd-calendar.mjs --json
git diff --check
```

Controlli coperti:

- presenza di tutte le 15 tabelle;
- RLS e revoke per ogni tabella;
- ruolo n8n `NOLOGIN` senza `DELETE`;
- nessuna mutazione SQL delle tabelle Analytics;
- chiavi idempotenti e catena rettifiche;
- 15 giornate e 30 fixture;
- 15 gare casa e 15 trasferta Villanovese;
- orari non inventati;
- prossime tre avversarie alla data di analisi;
- omonimie non bloccate da un vincolo sul nome;
- separazione per stagione e competizione;
- query n8n senza `EXECUTE format` o SQL dinamico.

### Esito in questa sessione

- `node --check`: superato;
- test Node/statici: **15 superati, 0 falliti**;
- dry-run calendario: **15 giornate, 30 fixture, 16 squadre**;
- casa/trasferta Villanovese: **15/15**;
- orari: **20 espliciti a 14:30, 10 lasciati `NULL`**;
- seconda importazione simulata: **0 insert, 30 fixture invariate**;
- `git diff --check`: superato;
- migration remota: **15 tabelle create, RLS attiva su 15/15, 15 policy**;
- privilegi web remoti: **0 grant a `anon`/`authenticated`**;
- ruolo worker remoto: **NOLOGIN, senza superuser/createdb/createrole/replication/bypass RLS e senza DELETE**;
- import remoto: **1 stagione, 1 competizione, 16 team, 16 alias, 30 fixture**;
- verifica remota fixture: **30 chiavi idempotenti distinte, 15 casa/15 trasferta, 20 orari valorizzati e 10 `NULL`**;
- seconda esecuzione remota: **conteggi invariati, nessun duplicato**;
- controcheck remoto: **49 righe Analytics, 49 `NON_VERIFICABILE`, 0 equivalenze automatiche**.

Non era disponibile un server PostgreSQL locale né un Docker daemon attivo. La
migration è però stata analizzata ed eseguita dal PostgreSQL remoto reale. Il
primo tentativo ha rilevato che il login hosted non poteva eseguire `ALTER ROLE`
su un ruolo privilegiato; la transazione è stata interamente annullata. Gli
attributi restrittivi sono stati quindi spostati nel `CREATE ROLE`, i test sono
stati rieseguiti e l'applicazione successiva è riuscita. Una query di catalogo
ha confermato la registrazione della migration e l'assenza di residui del
tentativo fallito.

## 9. Flussi di stato

### Rinvio/recupero

1. fixture corrente `SCHEDULED`;
2. fonte ufficiale indica rinvio: `POSTPONED`, data corrente conservata;
3. fonte ufficiale indica recupero: aggiornare `scheduled_date`/`kickoff_time`, stato `RESCHEDULED`;
4. `original_scheduled_date` e `original_kickoff_time` non cambiano;
5. una giornata `SERVED` può essere registrata solo quando la fixture eleggibile è effettivamente verificata come disputata.

### Rettifica comunicato

1. nuovo PDF con nuovo hash;
2. nuovo `lnd_documents` con `replaces_document_id`;
3. nuovo provvedimento con `supersedes_measure_id`;
4. originale a `SUPERSEDED`/`REVOKED`;
5. eventuale movimento ledger `CORRECTION`/`REVOCATION`;
6. nuova notifica con dedupe key propria.

### Omonimia

1. conservare nome grezzo e documento;
2. cercare ID federale;
3. verificare squadra, stagione, intervallo di registrazione e data di nascita se disponibile;
4. se restano più candidati, `AMBIGUOUS` e nessuna attribuzione automatica;
5. risoluzione manuale prima di una notifica nominativa definitiva.

## 10. Decisioni aperte e rischi residui

1. **URL e struttura LND Veneto:** assenti dal repository; devono essere verificati prima del collector.
2. **Codici ufficiali:** Villanovese, avversarie e competizione hanno per ora chiavi interne, non codici federali.
3. **Calendario 2025/26:** nessuna fonte nel repository; storico ancora da importare.
4. **Orari mancanti:** correttamente `NULL`, ma una fonte ufficiale dovrà completarli.
5. **Schema Analytics remoto:** PK, tipi e RLS originari non sono versionati. La funzione di controcheck è stata eseguita con successo sullo stato remoto corrente, ma eventuali future variazioni dello schema Analytics richiederanno un test di regressione.
6. **Colonne disciplinari Analytics:** `ammonizioni` ed `espulsioni` sono risultate disponibili nell'istanza corrente, ma il loro DDL base continua a non essere versionato nel repository.
7. **Provisioning ruolo login:** richiede decisione su connessione diretta, pooler, SSL e allowlist Supabase.
8. **Importer REST:** una credenziale PostgREST a privilegi minimi richiede configurazione aggiuntiva; in assenza, l'import una tantum con service-role aumenta il rischio operativo.
9. **Regole disciplinari:** soglie, competizioni eleggibili e consumo delle giornate devono essere confermati da fonti ufficiali; la sequenza hardcoded nella UI Analytics non viene riutilizzata.
10. **Privacy/retention:** date di nascita, tessere e disciplina richiedono minimizzazione, autorizzazioni e tempi di conservazione definiti.
11. **Lock notifiche:** Q8 richiede transazione o stato di claim atomico nel workflow.
12. **Contenuto AI:** confidence non sostituisce una verifica; gli ambigui non devono aggiornare ledger o generare notifiche definitive.

## 11. Stato del rollout e passi successivi

Completato in questa fase:

1. revisione del diff SQL e test statici/locali;
2. approvazione esplicita dell'applicazione;
3. applicazione manuale della migration, senza push Git;
4. verifica remota di tabelle, RLS, policy, grant e attributi del ruolo;
5. import calendario dopo dry-run;
6. seconda esecuzione e conferma dell'idempotenza;
7. esecuzione della vista di controcheck sullo schema Analytics corrente.

Passi successivi, da autorizzare e configurare separatamente:

1. verificare URL, struttura e regole ufficiali LND Veneto;
2. caricare fonti e calendario storico 2025/26;
3. creare il login PostgreSQL n8n nel secret manager, con TLS e restrizioni di rete;
4. testare il ruolo effettivo n8n e le query parametrizzate end-to-end;
5. configurare n8n in shadow mode, senza Telegram;
6. validare comunicati storici, omonimie, rettifiche e calcolo del ledger;
7. attivare Telegram soltanto dopo il collaudo.

## 12. Stop operativo

La migration e l'import calendario autorizzati sono completati. Non sono stati
creati segreti, login n8n, workflow, deploy, commit o push. La fase si ferma qui
in attesa di approvazione per il provisioning n8n e il collector LND.
