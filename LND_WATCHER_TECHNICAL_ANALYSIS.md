# LND-WATCHER 2.0 — Analisi tecnica di integrazione

**Progetto analizzato:** Analytics Villanovese  
**Data dell'analisi:** 13 novembre 2026  
**Ambito:** analisi statica del repository e tentativo non autenticato, in sola lettura, della Data API Supabase  
**Modifiche eseguite:** nessuna modifica applicativa, nessuna migrazione, nessuna scrittura su Supabase, nessuna installazione di dipendenze

## Legenda delle evidenze

- **[VERIFICATO]**: informazione osservata direttamente nel repository corrente, in una migration SQL o nella configurazione versionata.
- **[DEDUZIONE]**: conclusione ragionevole derivata dal comportamento del codice, ma non confermata dallo schema o dai dati del database remoto.
- **[NON VERIFICABILE]**: informazione non determinabile dal repository e non confermata dal database remoto.
- **[PROPOSTA]**: componente nuovo suggerito per LND-WATCHER 2.0; non esiste nel progetto corrente.

## Sintesi esecutiva

Analytics Villanovese è un'applicazione Next.js che legge da Supabase dati statistici prodotti principalmente da una pipeline Google Sheets/Google Apps Script. Il calendario di campionato 2026/27 non è memorizzato in PostgreSQL: è codificato staticamente in `lib/championship-calendar.ts`. La tabella `public.matches`, invece, viene alimentata dal foglio `ANALISI_PARTITE` e contiene soltanto quattro colonne usate con certezza: `match_id`, `data`, `partita`, `competizione`.

Il repository non contiene lo schema originario delle tabelle principali (`players`, `matches`, `player_match_stats`, `player_season_stats`, `utenti`, tabelle Veo). Contiene migration complete soltanto per `match_lineups`, `match_substitutions` e `match_events`, oltre a una migration che aggiunge policy di lettura a un elenco di tabelle eventualmente esistenti.

LND-WATCHER non deve scrivere in `matches`, `match_events` o nelle tabelle statistiche correnti:

1. la sincronizzazione completa Apps Script elimina da `matches` le gare non più presenti nel foglio sorgente;
2. formazioni, sostituzioni ed eventi vengono cancellati e reinseriti per partita;
3. le tabelle correnti non modellano stagioni, squadre avversarie, tesseramenti, comunicati, rettifiche o giornate residue;
4. il calendario futuro è statico e non gestisce rinvii, recuperi o annullamenti.

La soluzione più sicura e manutenibile è aggiungere, in una fase successiva e tramite migration, un dominio isolato di tabelle con prefisso `lnd_`, lasciando intatto il flusso Analytics attuale. n8n dovrebbe leggere e scrivere direttamente tramite la Data API Supabase con credenziali server-side, effettuare deduplicazione tramite hash dei PDF e chiavi idempotenti, e inviare Telegram soltanto dopo controlli deterministici e tracciamento della fonte.

---

# 1. Architettura attuale

## 1.1 Stack e struttura del repository

| Area | Evidenza | Stato |
|---|---|---|
| Web application | Next.js App Router, React, TypeScript | **[VERIFICATO]** `app/`, `package.json`, `tsconfig.json` |
| Versioni risolte nel lockfile | Next.js `16.3.6`, React/React DOM `19.3.0`, TypeScript `7.0.2` | **[VERIFICATO]** `package-lock.json` |
| Client Supabase | `@supabase/ssr` `0.12.7`, `@supabase/supabase-js` `2.117.1` | **[VERIFICATO]** `package-lock.json` |
| Database/backend | Supabase/PostgreSQL, Data API PostgREST, Supabase Auth | **[VERIFICATO]** `lib/supabase/*`, `supabase/config.toml` |
| ETL sportivo | Google Apps Script e Google Sheets | **[VERIFICATO]** `apps-script/villanovese_complete.gs` |
| Fonti sportive interne | Veo API, report Veo MHTML, report YouCoach MHTML | **[VERIFICATO]** codice Apps Script |
| Classifica campionato | scraping server-side di una pagina `asdvba.it` | **[VERIFICATO]** `app/api/championship/standings/route.ts` |
| Deploy schema | GitHub Actions esegue dry-run e `supabase db push --remote` su `main` | **[VERIFICATO]** `.github/workflows/deploy-supabase.yml` |
| Edge Functions | Nessuna directory/function Supabase presente | **[VERIFICATO]** repository corrente |
| n8n/Telegram/LND | Nessun workflow, endpoint o integrazione presente | **[VERIFICATO]** repository corrente |

Il flusso dati osservato è:

```text
Veo API + file Veo MHTML + file YouCoach MHTML
                    |
                    v
        Google Apps Script / Google Sheets
                    |
          REST PostgREST con chiave server-side
                    |
                    v
                 Supabase
                    |
       Supabase Auth + RLS + client SSR
                    |
                    v
       API route Next.js -> dashboard React
```

Il calendario futuro segue invece un percorso separato:

```text
array TypeScript statico -> componente React ChampionshipCalendar
                              ^
                              |
           risultati di public.matches associati solo per data
```

## 1.2 Configurazione e accesso Supabase

### Applicazione Next.js

- **[VERIFICATO]** Browser, server API e middleware/proxy usano `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- **[VERIFICATO]** L'autenticazione usa Supabase Auth e cookie SSR; `proxy.ts` richiama `auth.getUser()` e reindirizza gli utenti non autenticati a `/login`.
- **[VERIFICATO]** L'applicazione legge il profilo da `public.utenti` e ammette i ruoli `STAFF` e `GIOCATORE`, entrambi con `attivo = true`.
- **[VERIFICATO]** Un profilo `GIOCATORE` deve avere `player_id`; il codice controlla anche che tale valore esista in `players`.
- **[VERIFICATO]** `.env.local` è escluso da Git. Sono state rilevate solo le variabili necessarie, senza leggere o riportare i valori nel presente documento.

### Google Apps Script e script amministrativi

- **[VERIFICATO]** `villanovese_complete.gs` legge URL Supabase e chiave segreta dalle Script Properties e chiama `/rest/v1/...` con header server-side.
- **[VERIFICATO]** il modulo separato `youcoach_lineups_substitutions.gs` usa i nomi `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nelle Script Properties.
- **[VERIFICATO]** `scripts/import-player-users.mjs` richiede `SUPABASE_SERVICE_ROLE_KEY` e usa le API amministrative Auth per creare utenti; non è parte del runtime web.
- **[DEDUZIONE]** `SUPABASE_SECRET_KEY` usata nello script completo ha privilegi equivalenti a una chiave segreta/service-role, perché effettua insert, update e delete bypassando il normale login applicativo. Il tipo effettivo della chiave non è verificabile senza esporla e non è stato controllato.

### Accesso diretto al database durante questa analisi

- **[VERIFICATO]** è stato tentato esclusivamente l'accesso in sola lettura al documento OpenAPI della Data API, usando la chiave pubblicabile già configurata e senza stampare URL o credenziali.
- **[VERIFICATO]** la Data API ha risposto HTTP `401` sia con sia senza header Bearer.
- **[NON VERIFICABILE]** non è quindi disponibile un accesso diretto autenticato al database remoto. Non sono stati letti record, cataloghi PostgreSQL, conteggi, policy effettive o dati personali.
- **[NON VERIFICABILE]** non è possibile confermare che tutte le migration versionate siano state applicate al database di produzione.

## 1.3 API e processi esistenti

| Endpoint/processo | Funzione | Autenticazione e note | Stato |
|---|---|---|---|
| `GET /api/dashboard` | legge profilo, giocatori, partite, statistiche, formazioni, eventi e dati tattici | sessione Supabase via cookie; profilo attivo `STAFF`/`GIOCATORE`; `Cache-Control: no-store` | **[VERIFICATO]** |
| `GET /api/matches/{matchId}/report` | report completo della singola gara | sessione Supabase via cookie e profilo attivo | **[VERIFICATO]** |
| `GET /api/championship/standings` | scarica e interpreta la classifica esterna | il middleware generale protegge la route; la sorgente esterna non usa Supabase | **[VERIFICATO]** |
| `POST /api/auth/signout` | logout Supabase | cookie sessione | **[VERIFICATO]** |
| Supabase Data API `/rest/v1/{table}` | lettura/scrittura da Apps Script | chiave server-side nelle Script Properties | **[VERIFICATO]** |
| Veo API | elenco/informazioni/statistiche partite | token Veo in Script Properties; team Veo codificato nello script | **[VERIFICATO]** |
| Import YouCoach | legge `.mhtml` da una cartella Google Drive | cartella configurata in Script Properties | **[VERIFICATO]** |
| Import report Veo | legge `.mhtml` da Google Drive | cartella configurata in Script Properties | **[VERIFICATO]** |
| Deploy migration | GitHub Action su push a `main` o avvio manuale | GitHub Secrets; dry-run prima del push | **[VERIFICATO]** |

Non risultano cron job applicativi, Supabase Cron, trigger n8n o trigger `ScriptApp` definiti nel codice. Le funzioni Apps Script sono esposte nel menu del foglio; l'eventuale presenza di trigger configurati direttamente nell'interfaccia Google non è verificabile dal repository.

Il `README.md` cita `DASHBOARD_API_URL` e una Web App Apps Script, ma il codice runtime corrente non legge tale variabile e non contiene `doGet`/`doPost`. **[VERIFICATO]** La documentazione è quindi disallineata rispetto all'implementazione corrente.

---

# 2. Inventario delle tabelle e delle relazioni

## 2.1 Tabelle principali preesistenti

Per le tabelle di questa sezione manca la migration di creazione. Le colonne elencate sono quelle effettivamente lette o scritte dal codice; tipi, default, nullability e vincoli non devono essere considerati confermati, salvo nota esplicita.

### `public.utenti`

Colonne usate: `id`, `player_id`, `nome`, `email`, `ruolo`, `attivo`.

- **[VERIFICATO]** l'app usa `id = auth.uid()` per recuperare il profilo.
- **[VERIFICATO]** i valori di ruolo ammessi dal codice sono `STAFF` e `GIOCATORE`.
- **[DEDUZIONE]** `id` è verosimilmente chiave primaria e riferimento logico a `auth.users.id`.
- **[DEDUZIONE]** `player_id` è un riferimento logico a `players.player_id`.
- **[NON VERIFICABILE]** PK, FK, `CHECK`, indici, tipo del ruolo e policy RLS della tabella.

### `public.players`

Colonne usate: `player_id`, `nome`.

- **[VERIFICATO]** è la rosa/anagrafica dei soli giocatori presenti nel foglio `DISTINTE`, provenienti dall'anagrafica Google Sheets `GIOCATORI`.
- **[VERIFICATO]** `player_id` è destinazione di FK `text` nelle migration di `match_lineups`, `match_substitutions` e `match_events`; deve quindi essere univoco nel database su cui quelle migration sono applicate.
- **[DEDUZIONE]** `player_id` è PK o ha un vincolo `UNIQUE`, ma il repository non permette di distinguere le due alternative.
- **[NON VERIFICABILE]** non esistono colonne di squadra, stagione, data di nascita, numero di tessera o validità del tesseramento osservabili nel codice.

### `public.matches`

Colonne certamente scritte: `match_id`, `data`, `partita`, `competizione`.

- **[VERIFICATO]** `match_id` è destinazione di FK `text` nelle tre migration delle tabelle partita e deve essere univoco nel database di destinazione.
- **[VERIFICATO]** Apps Script invia `data` nel formato `YYYY-MM-DD` oppure `NULL`.
- **[VERIFICATO]** l'app ordina per `data` e tratta il valore come stringa/data ISO.
- **[VERIFICATO]** la sincronizzazione completa esegue upsert su `match_id` e poi elimina dal database ogni match non presente nell'insieme corrente prodotto da `ANALISI_PARTITE`.
- **[DEDUZIONE]** `match_id` è PK o `UNIQUE`.
- **[NON VERIFICABILE]** il tipo SQL di `data` (`date` o `text`) e l'esistenza effettiva di colonne alternative per risultato/casa-trasferta.

Il codice dashboard prova anche nomi alternativi quali `risultato`, `result`, `score`, `punteggio`, `gol_casa`, `gol_trasferta`, `casa_trasferta`, `home_away`, `venue` e `sede`. Questi nomi sono fallback applicativi e **non provano che le colonne esistano**. Lo script di sincronizzazione osservato non le scrive.

### `public.player_match_stats`

Colonne scritte da Apps Script:

`match_id`, `player_id`, `minuti`, `gol`, `gol_per_90`, `tiri`, `tiri_per_90`, `passaggi`, `passaggi_completati`, `passaggi_percento`, `distanza_km`, `distanza_km_per_90`, `sprint`, `sprint_per_90`, `corse_alta_intensita`, `corse_alta_intensita_per_90`, `velocita_max_kmh`, `velocita_media_kmh`, `assist`, `ammonizioni`, `espulsioni`, `tiri_totali`, `tiri_totali_per_90`, `contrasti`, `contrasti_per_90`, `falli`, `falli_per_90`, `coinvolgimenti_gol`, `coinvolgimenti_gol_per_90`.

- **[VERIFICATO]** la chiave logica usata dalla sincronizzazione incrementale è `(match_id, player_id)`.
- **[VERIFICATO]** la sincronizzazione completa cancella tutte le statistiche del match e le reinserisce.
- **[DEDUZIONE]** esistono relazioni logiche verso `matches` e `players`.
- **[NON VERIFICABILE]** PK/FK/UNIQUE reali e tipi SQL.

### `public.player_season_stats`

Colonne scritte da Apps Script:

`player_id`, `presenze`, `minuti`, `gol`, `gol_per_90`, `assist`, `assist_per_90`, `ammonizioni`, `espulsioni`, `tiri`, `tiri_per_90`, `tiri_totali`, `tiri_totali_per_90`, `passaggi`, `passaggi_per_90`, `passaggi_completati`, `passaggi_completati_per_90`, `passaggi_percento`, `distanza_km`, `distanza_km_per_90`, `sprint`, `sprint_per_90`, `corse_alta_intensita`, `corse_alta_intensita_per_90`, `velocita_max_kmh`, `velocita_media_kmh`, `contrasti`, `contrasti_per_90`, `falli`, `falli_per_90`, `coinvolgimenti_gol`, `coinvolgimenti_gol_per_90`, `minuti_per_presenza`, `sprint_per_km`, `corse_alta_intensita_per_km`, `gol_per_tiro`, `minuti_per_gol`, `minuti_per_assist`, `minuti_per_tiro`.

- **[VERIFICATO]** l'upsert usa soltanto `player_id` come conflitto.
- **[VERIFICATO]** non viene scritta alcuna colonna `season`/`stagione`.
- **[DEDUZIONE]** il modello corrente contiene una sola aggregazione stagionale per giocatore e non può rappresentare contemporaneamente 2025/26 e 2026/27 senza modifica di schema.
- **[NON VERIFICABILE]** vincolo univoco effettivo, FK e tipi SQL.

### `public.veo_position_stats`

Colonne scritte: `match_id`, `numero`, `player_id`, `x_media_pct`, `y_media_pct`, `zona_orizzontale`, `zona_verticale`, `fonte`.

- **[VERIFICATO]** chiave logica applicativa: `(match_id, numero)`.
- **[VERIFICATO]** `player_id` può essere assente quando la maglia Veo non è associabile a una distinta.
- **[NON VERIFICABILE]** vincoli e FK reali.

### `public.veo_event_positions`

Colonne scritte: `match_id`, `player_id`, `numero`, `tipo_evento`, `minuto`, `x_pct`, `y_pct`, `zona_orizzontale`, `zona_verticale`, `fonte`.

- **[VERIFICATO]** chiave logica applicativa: combinazione di `match_id`, `numero`, `tipo_evento`, `minuto`, `x_pct`, `y_pct`.
- **[NON VERIFICABILE]** vincoli e FK reali.

## 2.2 Tabelle definite da migration versionate

### `public.match_lineups`

| Colonna | Tipo/vincolo verificato |
|---|---|
| `match_id` | `text NOT NULL`, FK a `matches(match_id)`, `ON DELETE CASCADE` |
| `player_id` | `text NOT NULL`, FK a `players(player_id)`, `ON DELETE CASCADE` |
| `numero` | `integer`, nullable |
| `titolare` | `boolean NOT NULL DEFAULT false` |
| `ordine` | `integer`, nullable |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` |

PK composta: `(match_id, player_id)`. Indice su `match_id`. **[VERIFICATO]**

### `public.match_substitutions`

| Colonna | Tipo/vincolo verificato |
|---|---|
| `id` | `bigint GENERATED ALWAYS AS IDENTITY`, PK |
| `match_id` | `text NOT NULL`, FK a `matches(match_id)`, `ON DELETE CASCADE` |
| `minuto` | `integer NOT NULL` |
| `recupero` | `boolean NOT NULL DEFAULT false` |
| `player_out_id` | `text NOT NULL`, FK a `players(player_id)` |
| `player_in_id` | `text NOT NULL`, FK a `players(player_id)` |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` |

Vincolo univoco: `(match_id, minuto, player_out_id, player_in_id)`. Indice `(match_id, minuto)`. **[VERIFICATO]**

### `public.match_events`

| Colonna | Tipo/vincolo verificato |
|---|---|
| `id` | `bigint GENERATED ALWAYS AS IDENTITY`, PK |
| `match_id` | `text NOT NULL`, FK a `matches(match_id)`, `ON DELETE CASCADE` |
| `event_type` | `text NOT NULL`; valori ammessi: `GOAL`, `OPPONENT_GOAL`, `YELLOW_CARD`, `RED_CARD`, `SECOND_YELLOW_CARD` |
| `minuto` | `integer NOT NULL CHECK (minuto >= 0)` |
| `recupero` | `boolean NOT NULL DEFAULT false` |
| `player_id` | `text`, nullable, FK a `players(player_id)` |
| `player_name` | `text NOT NULL` |
| `related_player_id` | `text`, nullable, FK a `players(player_id)` |
| `related_player_name` | `text`, nullable |
| `fonte` | `text NOT NULL DEFAULT 'YOUCOACH'` |
| `goal_type` | `text`, nullable; solo `RIGORE` o `PUNIZIONE` |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` |

Indice `(match_id, minuto)`. Indice univoco espressione su `(match_id, event_type, minuto, coalesce(player_id,''), coalesce(related_player_id,''))`. **[VERIFICATO]**

`goal_type` non partecipa all'unicità finale: lo script incrementale aggiorna tale campo sull'evento già identificato. **[VERIFICATO]**

## 2.3 Tabelle candidate, non confermate

`app/api/dashboard/route.ts` tenta letture tolleranti all'errore da molte tabelle tattiche candidate:

`player_average_positions`, `tactical_average_positions`, `average_positions`, `posizioni_medie`, `player_shots`, `tactical_shots`, `shot_map`, `mappa_tiri`, `player_tackles`, `tactical_tackles`, `tackle_map`, `mappa_contrasti`, `tactical_events`, `player_tactical_events`, `eventi_tattici`, `tattica`.

Questi nomi sono fallback compatibili con possibili schemi preesistenti. **[NON VERIFICABILE]** Non devono essere inclusi nell'inventario delle tabelle realmente esistenti senza un dump del catalogo remoto.

## 2.4 Relazioni e idempotenza esistenti

### Relazioni confermate da SQL

```text
matches(match_id)
  ├─< match_lineups(match_id)          ON DELETE CASCADE
  ├─< match_substitutions(match_id)    ON DELETE CASCADE
  └─< match_events(match_id)           ON DELETE CASCADE

players(player_id)
  ├─< match_lineups(player_id)         ON DELETE CASCADE
  ├─< match_substitutions(player_out_id)
  ├─< match_substitutions(player_in_id)
  ├─< match_events(player_id)
  └─< match_events(related_player_id)
```

### Relazioni soltanto logiche

- `utenti.player_id -> players.player_id` — **[DEDUZIONE]**.
- `player_match_stats.match_id -> matches.match_id` — **[DEDUZIONE]**.
- `player_match_stats.player_id -> players.player_id` — **[DEDUZIONE]**.
- `player_season_stats.player_id -> players.player_id` — **[DEDUZIONE]**.
- tabelle Veo verso partite/giocatori — **[DEDUZIONE]**.

### Comportamenti idempotenti già presenti

- upsert di `players` su `player_id`;
- upsert di `matches` su `match_id`;
- upsert di `player_season_stats` su `player_id`;
- confronto delle chiavi logiche prima dell'inserimento incrementale;
- cancellazione e reinserimento per partita per statistiche, lineup, sostituzioni ed eventi;
- `Match_ID` YouCoach generato deterministicamente come prefisso data più digest di data e descrizione partita;
- report YouCoach ordinati per ultima modifica e deduplicati per `Match_ID`.

## 2.5 Row Level Security e grant

### `match_lineups` e `match_substitutions`

- RLS abilitata esplicitamente. **[VERIFICATO]**
- `authenticated` riceve grant `SELECT, INSERT, UPDATE, DELETE`; le policy limitano comunque le righe. **[VERIFICATO]**
- policy staff `FOR ALL` quando esiste un profilo `utenti` attivo con ruolo `STAFF`. **[VERIFICATO]**
- policy giocatore iniziale `FOR SELECT` sulle sole righe che coinvolgono il proprio `player_id`. **[VERIFICATO]**
- la migration successiva aggiunge `active_users_read_full_reports`, che permette a qualsiasi `STAFF` o `GIOCATORE` attivo di leggere tutte le righe. **[VERIFICATO nel SQL]**
- `service_role` riceve tutti i privilegi. **[VERIFICATO]**

### `match_events`

- RLS abilitata esplicitamente. **[VERIFICATO]**
- staff attivo: policy `FOR ALL`. **[VERIFICATO]**
- staff e giocatori attivi: lettura completa tramite `active_users_read_full_reports`. **[VERIFICATO]**
- `service_role`: privilegi completi. **[VERIFICATO]**

### Tabelle principali e candidate

La migration `20261020120000_allow_active_users_full_reports.sql` verifica dinamicamente l'esistenza di un elenco di tabelle, concede `SELECT` ad `authenticated` e crea la policy di lettura completa per gli utenti attivi. **[VERIFICATO]**

Tuttavia la stessa migration **non abilita RLS** sulle tabelle preesistenti. Se RLS non era già attiva, la policy non diventa un filtro effettivo. **[NON VERIFICABILE]** Senza accesso al catalogo remoto non è possibile confermare lo stato RLS di `players`, `matches`, `player_match_stats`, `player_season_stats`, `utenti` e tabelle Veo.

---

# 3. Struttura del calendario, squadre e risultati

## 3.1 Dove si trova il calendario

- **[VERIFICATO]** il calendario di campionato è l'array `rounds` in `lib/championship-calendar.ts`.
- **[VERIFICATO]** non esiste nel repository una tabella PostgreSQL, migration o import che memorizzi le 30 fixture future.
- **[VERIFICATO]** `public.matches` viene popolata da `ANALISI_PARTITE`, cioè dall'analisi delle gare importate, non dall'array del calendario.
- **[DEDUZIONE]** `matches` contiene soprattutto gare già importate/analizzate; non si può assumere che contenga il programma futuro.

## 3.2 Identità delle squadre

- **ASD Villanovese:** nome applicativo osservato in README, metadata e logica di parsing. **[VERIFICATO]**
- **Identificativo PostgreSQL della Villanovese:** non esiste una tabella squadre né un `team_id` osservabile. **[NON VERIFICABILE]**
- **Identificativo Veo della squadra:** esiste un UUID hardcoded in Apps Script (`VEO_TEAM_ID`). **[VERIFICATO]** È un identificatore del provider Veo e non deve essere trattato come codice LND/FIGC o identificativo canonico universale.
- **Identificativo LND/FIGC della Villanovese:** assente. **[NON VERIFICABILE]**
- **Identificativi delle avversarie:** assenti; il calendario contiene soltanto stringhe. **[VERIFICATO]**
- **Ufficialità dei nomi:** i nomi seguenti sono esattamente quelli presenti nel codice, ma non sono stati confrontati con l'anagrafica ufficiale LND. **[NON VERIFICABILE]**

## 3.3 Calendario hardcoded 2026/27

La competizione è presentata dalla UI come **Prima Categoria - Girone E**, campionato 2026/2027. Il singolo record TypeScript non contiene `season_id` o `competition_id`; stagione e competizione sono contesto applicativo. **[VERIFICATO]**

L'orario viene valorizzato a `14:30` soltanto per date comprese tra 25 ottobre 2026 e 21 marzo 2027, estremi inclusi. Negli altri casi il valore è `null`, quindi l'orario reale non è disponibile nel codice. **[VERIFICATO]**

| Giornata | Fase | Data | Casa/trasferta Villanovese | Avversaria (stringa del codice) | Ora nel codice |
|---:|---|---|---|---|---|
| 1 | Andata | 2026-09-13 | Trasferta | Polisportiva Real Terme | non valorizzata |
| 2 | Andata | 2026-09-20 | Casa | Union River | non valorizzata |
| 3 | Andata | 2026-09-27 | Trasferta | Pettorazza San Martino | non valorizzata |
| 4 | Andata | 2026-10-04 | Casa | Bocar Juniors ARL | non valorizzata |
| 5 | Andata | 2026-10-11 | Trasferta | Spes Pojana | non valorizzata |
| 6 | Andata | 2026-10-18 | Casa | Due Stelle A.S.D. | non valorizzata |
| 7 | Andata | 2026-10-25 | Trasferta | Rivereel Sossano | 14:30 |
| 8 | Andata | 2026-11-01 | Casa | Virtus Bagnoli Arre ASD | 14:30 |
| 9 | Andata | 2026-11-08 | Trasferta | Turchese | 14:30 |
| 10 | Andata | 2026-11-15 | Casa | Azzurra Due Carrare | 14:30 |
| 11 | Andata | 2026-11-22 | Trasferta | Montagnana | 14:30 |
| 12 | Andata | 2026-11-29 | Trasferta | PSN Legnaro Polverara | 14:30 |
| 13 | Andata | 2026-12-06 | Casa | Scardovari | 14:30 |
| 14 | Andata | 2026-12-13 | Trasferta | Altopolesine | 14:30 |
| 15 | Andata | 2026-12-20 | Casa | Fiessese | 14:30 |
| 1 | Ritorno | 2027-01-10 | Casa | Polisportiva Real Terme | 14:30 |
| 2 | Ritorno | 2027-01-17 | Trasferta | Union River | 14:30 |
| 3 | Ritorno | 2027-01-24 | Casa | Pettorazza San Martino | 14:30 |
| 4 | Ritorno | 2027-01-31 | Trasferta | Bocar Juniors ARL | 14:30 |
| 5 | Ritorno | 2027-02-07 | Casa | Spes Pojana | 14:30 |
| 6 | Ritorno | 2027-02-14 | Trasferta | Due Stelle A.S.D. | 14:30 |
| 7 | Ritorno | 2027-02-21 | Casa | Rivereel Sossano | 14:30 |
| 8 | Ritorno | 2027-02-28 | Trasferta | Virtus Bagnoli Arre ASD | 14:30 |
| 9 | Ritorno | 2027-03-07 | Casa | Turchese | 14:30 |
| 10 | Ritorno | 2027-03-14 | Trasferta | Azzurra Due Carrare | 14:30 |
| 11 | Ritorno | 2027-03-21 | Casa | Montagnana | 14:30 |
| 12 | Ritorno | 2027-04-04 | Casa | PSN Legnaro Polverara | non valorizzata |
| 13 | Ritorno | 2027-04-11 | Trasferta | Scardovari | non valorizzata |
| 14 | Ritorno | 2027-04-18 | Casa | Altopolesine | non valorizzata |
| 15 | Ritorno | 2027-04-25 | Trasferta | Fiessese | non valorizzata |

Alla data dell'analisi, le successive quattro fixture statiche sono:

1. 15 novembre 2026, Villanovese in casa contro Azzurra Due Carrare, ore 14:30;
2. 22 novembre 2026, trasferta contro Montagnana, ore 14:30;
3. 29 novembre 2026, trasferta contro PSN Legnaro Polverara, ore 14:30;
4. 6 dicembre 2026, Villanovese in casa contro Scardovari, ore 14:30.

Queste sono fixture del codice, non dati confermati dal database o dal sito LND. Un rinvio pubblicato dopo l'ultimo aggiornamento del repository non sarebbe rappresentato.

## 3.4 Risultati, rinvii, recuperi e annullamenti

- **[VERIFICATO]** i risultati non sono memorizzati nell'array del calendario.
- **[VERIFICATO]** il componente associa un risultato a una fixture tramite la sola uguaglianza della data e solo per gare classificate come `CAMPIONATO`.
- **[VERIFICATO]** il risultato è ricavato da una stringa eventualmente presente in `partita` o da colonne alternative che il codice prova a leggere, ma che non sono scritte dallo script osservato.
- **[VERIFICATO]** casa/trasferta viene dedotto da colonne alternative, se esistenti, oppure dalla posizione della parola `villanovese` rispetto al separatore nella stringa `partita`.
- **[VERIFICATO]** la distinzione competizione riduce ogni valore contenente `coppa` a `COPPA`; tutto il resto diventa `CAMPIONATO`.
- **[VERIFICATO]** non esiste uno stato strutturato `POSTPONED`, `RESCHEDULED`, `CANCELLED` o equivalente.
- **[NON VERIFICABILE]** non è possibile elencare dal repository partite effettivamente rinviate, recuperate o annullate.

L'associazione per sola data può produrre errori in caso di recupero, doppia gara nella stessa data o cambi di programma. LND-WATCHER necessita di fixture canoniche con squadra casa, squadra ospite, competizione, stagione e stato.

## 3.5 Query SQL delle prossime quattro partite

Non esiste una query PostgreSQL capace di interrogare il calendario hardcoded, perché tale calendario non è nel database. La seguente è l'unica query eseguibile basata esclusivamente su tabella e colonne verificate nel repository:

```sql
SELECT
  match_id,
  data,
  partita,
  competizione
FROM public.matches
WHERE NULLIF(data::text, '')::date >= CURRENT_DATE
  AND partita ILIKE '%Villanovese%'
ORDER BY NULLIF(data::text, '')::date ASC, match_id ASC
LIMIT 4;
```

Limitazioni da non nascondere:

- usa soltanto colonne realmente osservate;
- il cast funziona sia se `data` è `date` sia se è testo ISO, ma fallisce in presenza di valori non convertibili;
- può restituire zero righe perché l'import attuale alimenta `matches` da gare analizzate, non dal calendario futuro;
- presuppone che `partita` contenga la parola `Villanovese`; se tutte le righe della tabella appartengono già alla squadra, il filtro è ridondante;
- non può correggere rinvii o annullamenti, perché non esistono colonne di stato verificate;
- non può restituire ID squadra o avversaria, perché non esistono colonne/team table verificate.

Per n8n questa query è quindi un fallback temporaneo, non la base affidabile del monitoraggio. La base corretta è la futura tabella proposta `lnd_fixtures`.

---

# 4. Struttura delle squadre e dei giocatori

## 4.1 Rosa Villanovese

- **[VERIFICATO]** `players` contiene almeno `player_id` e `nome` e rappresenta i giocatori estratti dalle distinte Villanovese.
- **[VERIFICATO]** `match_lineups` registra titolari/riserve per partita; `match_substitutions` registra entrate e uscite.
- **[VERIFICATO]** il foglio sorgente `GIOCATORI` deve contenere `Player_ID` e `Giocatore`.
- **[NON VERIFICABILE]** il contenuto corrente e completo della rosa, perché i record non sono nel repository e la Data API non è accessibile senza sessione/credenziali adeguate.
- **[NON VERIFICABILE]** validità temporale del tesseramento e stagione di appartenenza.

## 4.2 Rose avversarie

- **[VERIFICATO]** non esiste una tabella squadre o rose avversarie osservabile.
- **[VERIFICATO]** gli eventi `OPPONENT_GOAL` non richiedono `player_id` e possono usare il testo generico `Avversario`.
- **[NON VERIFICABILE]** nomi e identificativi dei giocatori avversari.

## 4.3 Identificativi e omonimie

L'identificatore interno `player_id` è stabile all'interno dell'anagrafica Google Sheets e viene propagato alle tabelle Supabase. Non è dimostrato che coincida con un numero di tessera federale. **[VERIFICATO/DEDUZIONE]**

Il resolver YouCoach corrente:

1. rimuove diacritici;
2. rimuove punteggiatura;
3. converte in maiuscolo;
4. ordina alfabeticamente le parole del nome;
5. blocca l'import se due righe di `GIOCATORI` producono la stessa chiave normalizzata.

Questo riduce i problemi dovuti all'ordine nome/cognome, ma non risolve le omonimie reali. Due tesserati con lo stesso nome normalizzato non sono rappresentabili dal resolver attuale senza un'identità aggiuntiva.

Per LND-WATCHER un tesserato deve essere identificato con questa priorità:

1. **codice federale/numero di matricola**, se pubblicato e lecito da trattare;
2. combinazione di nome normalizzato, data di nascita e squadra valida alla data del comunicato, se tali dati sono presenti nella fonte;
3. nome normalizzato + squadra + stagione + intervallo di tesseramento, con stato `AMBIGUOUS` se restano più candidati;
4. conferma manuale prima di attribuire una squalifica quando la fonte non consente disambiguazione.

Il nome non deve mai essere l'unica chiave primaria. Occorre conservare sia il testo originale del PDF sia la normalizzazione, la pagina, il documento e l'esito della risoluzione.

## 4.4 Trasferimenti e dati disciplinari correnti

- **Storico trasferimenti/cambi squadra:** assente. **[VERIFICATO]**
- **Squadra associata al giocatore:** assente da `players`; l'app assume implicitamente la Villanovese. **[VERIFICATO]**
- **Disciplina interna:** `player_match_stats` contiene conteggi `ammonizioni`/`espulsioni`; `match_events` contiene eventi YouCoach con minuto e tipo. **[VERIFICATO]**
- **Provvedimenti ufficiali LND, diffide, giornate inflitte, scontate o residue:** assenti. **[VERIFICATO]**
- **Storico 2025/26 separato:** non modellato; `player_season_stats` non contiene stagione. **[VERIFICATO]**

La dashboard calcola una progressione disciplinare usando la sequenza hardcoded `[5, 5, 4, 3, 2, 1]` sugli eventi di cartellino. Questo è un calcolo UI, non una regola LND documentata nel repository, non considera rettifiche o giornate scontate e non deve essere riutilizzato come fonte ufficiale. **[VERIFICATO]**

---

# 5. Integrazione Supabase–n8n

## 5.1 Strategia consigliata

LND-WATCHER dovrebbe essere un dominio parallelo, con workflow n8n separati e tabelle `public.lnd_*`. L'applicazione Analytics non deve essere modificata nella prima fase. n8n non dovrebbe usare gli endpoint della dashboard come API di integrazione: richiedono cookie Supabase, profilo applicativo e restituiscono dati aggregati pensati per la UI.

La Data API Supabase già usata dal progetto è l'interfaccia più semplice:

```text
{SUPABASE_URL}/rest/v1/{tabella}
```

Le query REST possono usare `select`, filtri, ordinamento e `limit`; gli upsert possono usare `Prefer: resolution=merge-duplicates` con un vincolo univoco reale nel database. URL e chiavi devono essere configurati nelle credenziali n8n, mai nei nodi esportati o nei log.

### Autenticazione possibile

**MVP a costo minimo:** credenziale Supabase segreta/service-role nel credential store di n8n, accessibile soltanto ai nodi server-side. È coerente con l'attuale Apps Script, ma bypassa RLS e ha privilegi molto ampi.

**Opzione raccomandata per least privilege:** utente/ruolo tecnico dedicato o endpoint server-side ristretto che possa eseguire soltanto operazioni sulle tabelle `lnd_*`. Richiede configurazione aggiuntiva ma riduce l'impatto di una compromissione del workflow.

In entrambi i casi:

- nessuna chiave nel browser o nei messaggi Telegram;
- redazione degli header nei log n8n;
- rotazione periodica;
- `anon` senza accesso alle tabelle `lnd_*`;
- bucket PDF privato, se usato;
- nessun riuso della sessione personale di un utente Analytics.

## 5.2 Pianificazione n8n

Timezone del workflow: `Europe/Rome`, per rispettare ora solare/legale.

Per evitare una corsa indesiderata alle 20:30, usare due schedule:

```text
0,30 15-19 * * 1,3,5
0    20    * * 1,3,5
```

Ciò produce controlli alle 15:00, 15:30, ..., 19:30 e 20:00 di lunedì, mercoledì e venerdì.

Il report prepartita del venerdì deve partire dopo la conclusione del controllo delle 20:00, idealmente come ramo successivo dello stesso run; in alternativa alle 20:05 con verifica che l'ultimo run sia terminato con successo.

## 5.3 Flusso funzionale proposto

### 1. Leggere calendario e squadre da Supabase

Stato attuale: non possibile in modo affidabile, perché il calendario futuro è TypeScript statico e non esistono team ID.

Percorso consigliato:

1. importare il calendario verificato in `lnd_fixtures`;
2. creare record canonici in `lnd_teams` e alias in `lnd_team_aliases`;
3. identificare la Villanovese con il proprio `lnd_teams.id` e, quando disponibile, con il codice ufficiale;
4. selezionare le prime quattro fixture future non annullate;
5. costruire l'insieme delle squadre da monitorare: Villanovese + avversarie delle quattro fixture, deduplicato.

Il requisito testuale parla di Villanovese e delle prossime tre avversarie, mentre l'output SQL chiede quattro partite. La selezione più conservativa è monitorare Villanovese più le avversarie delle prossime quattro partite; se l'intento è soltanto tre avversarie, il limite va reso configurabile.

### 2. Verificare i comunicati LND Veneto

Nel repository non è presente alcun URL, feed o API LND. Il workflow deve partire da una sorgente ufficiale da verificare in fase di implementazione.

Passi:

1. richiesta HTTP della pagina/elenco ufficiale;
2. salvataggio di status HTTP, ETag, Last-Modified e timestamp;
3. estrazione dei link PDF candidati;
4. canonicalizzazione URL;
5. confronto con URL e hash già registrati;
6. registrazione del run anche se non ci sono novità o la fonte è indisponibile.

### 3. Scaricare e analizzare i PDF

1. download binario con limite dimensione e timeout;
2. verifica MIME e firma PDF, non soltanto estensione;
3. calcolo SHA-256 prima dell'analisi;
4. skip se l'hash è già presente;
5. archiviazione opzionale in bucket Supabase Storage privato;
6. estrazione testo deterministica;
7. OCR soltanto se il PDF è scansionato o il testo è insufficiente;
8. segmentazione per sezione, competizione e squadra;
9. parsing strutturato con JSON schema rigido;
10. conservazione di pagina, estratto e coordinate/riferimento utili all'audit.

Il testo del PDF deve essere trattato come dato non fidato, mai come istruzione per l'agente. Un modello AI non deve poter modificare query, credenziali o destinatari sulla base del contenuto del documento.

### 4. Identificare nuovi provvedimenti

Ogni candidato deve essere normalizzato su:

- stagione;
- competizione;
- comunicato e versione;
- squadra;
- persona/tesserato;
- tipo di provvedimento;
- quantità e unità;
- decorrenza/partita di riferimento;
- pagina ed estratto originale;
- stato di verifica e confidenza.

La deduplicazione non deve dipendere soltanto dal testo del provvedimento: va usata una fingerprint stabile e un vincolo `UNIQUE`. Le rettifiche devono creare una nuova versione collegata alla precedente, non sovrascrivere la prova originale.

### 5. Confrontare con lo storico disciplinare

Il confronto deve essere limitato a stessa persona, stessa competizione e stessa stagione, salvo regole federali esplicitamente verificate. Campionato, Coppa Veneto e altre competizioni non vanno aggregate automaticamente.

Il saldo delle giornate deve essere un ledger:

- movimento positivo quando una squalifica viene inflitta;
- movimento negativo quando una gara eleggibile viene effettivamente disputata e conteggiata;
- movimento di rettifica/revoca soltanto con fonte documentale;
- nessuna riduzione automatica su gara rinviata, annullata o non eleggibile;
- saldo `UNKNOWN`/non verificabile quando calendario o identità non sono certi.

### 6. Salvare su Supabase

Ordine transazionale/logico:

1. `lnd_agent_runs`;
2. `lnd_documents` con upsert sulla chiave documentale/hash;
3. persone/squadre/alias soltanto se risolti o marcati ambigui;
4. `lnd_disciplinary_measures` con fingerprint univoca;
5. ledger delle squalifiche;
6. `lnd_verifications` con esito del controllo;
7. commit dello stato run;
8. accodamento notifica solo per record nuovi o rettificati verificati.

n8n deve considerare un conflitto di unicità come risultato idempotente, non come errore da notificare.

### 7. Telegram

Telegram Bot API può essere gestita dal nodo Telegram di n8n o da HTTP Request. Token e chat ID devono stare nel credential store.

Una notifica deve includere soltanto:

- competizione/stagione;
- squadra e tesserato risolto;
- provvedimento e giornate residue;
- numero/data del comunicato;
- link al PDF ufficiale;
- indicazione `VERIFICATO`, `DA VERIFICARE` o `RETTIFICA`.

La tabella notifiche deve avere una `dedupe_key` univoca. Retry e riavvii non devono produrre messaggi duplicati.

### 8. Report prepartita del venerdì

Il report deve essere riferito alla prossima fixture effettivamente valida e mostrare:

- dati partita e ultima verifica del calendario;
- indisponibilità Villanovese;
- indisponibilità avversaria;
- diffidati/provvedimenti pendenti separati per competizione;
- giornate inflitte, scontate, residue;
- fonti PDF e timestamp dell'ultimo controllo;
- elementi ambigui/non verificabili in una sezione distinta.

Se l'ultima verifica LND fallisce, il report non deve presentarsi come aggiornato: deve riportare esplicitamente l'ultimo controllo riuscito.

## 5.4 API esistenti riutilizzabili e limiti

| Superficie | Riutilizzo per n8n | Valutazione |
|---|---|---|
| Supabase Data API `/rest/v1` | sì, per lettura/scrittura delle future `lnd_*` | scelta principale |
| `GET /api/dashboard` | tecnicamente possibile con sessione, ma non consigliato | cookie auth, payload UI, nessun calendario futuro affidabile |
| `GET /api/matches/{id}/report` | non necessario per LND-WATCHER | report interno post-partita |
| `GET /api/championship/standings` | solo come fonte secondaria, non per disciplina | scraping non LND e nessun team ID |
| Veo API | non utile per comunicati LND | dati performance/partita |
| Google Sheets/Apps Script | possibile sorgente transitoria del calendario, ma accoppia ulteriormente i sistemi | preferire Supabase canonico |
| Edge Functions | non presenti | possibile hardening futuro |
| API LND | non presente nel repository | da verificare prima dell'implementazione |

---

# 6. Proposta di nuove tabelle

Questa sezione è interamente **[PROPOSTA]**. Nessuna tabella è stata creata.

Per ridurre l'impatto sulla configurazione Supabase corrente, si propone il prefisso `public.lnd_*`. In alternativa si può usare uno schema dedicato, ma `supabase/config.toml` espone oggi soltanto `public` e `graphql_public`, quindi uno schema nuovo richiederebbe ulteriore configurazione Data API.

## 6.1 Anagrafiche e calendario

### `lnd_seasons`

| Campo | Scopo |
|---|---|
| `id uuid PK` | identità interna |
| `code text UNIQUE NOT NULL` | es. `2025/26`, `2026/27` |
| `starts_on date`, `ends_on date` | validità |
| `active boolean` | selezione operativa |
| `created_at`, `updated_at` | audit |

### `lnd_competitions`

| Campo | Scopo |
|---|---|
| `id uuid PK` | identità |
| `season_id FK` | stagione obbligatoria |
| `official_code text NULL` | codice ufficiale, se disponibile |
| `official_name text NOT NULL` | nome sorgente |
| `normalized_name text NOT NULL` | matching |
| `kind text CHECK` | `LEAGUE`, `COPPA_VENETO`, `OTHER` |
| `region text` | es. Veneto |

Unicità consigliata sul codice ufficiale per stagione, se presente; fallback controllato su stagione + nome normalizzato.

### `lnd_teams`

| Campo | Scopo |
|---|---|
| `id uuid PK` | identità canonica |
| `official_code text NULL` | codice LND/FIGC verificato |
| `official_name text NOT NULL` | denominazione corrente |
| `normalized_name text NOT NULL` | matching tecnico |
| `active boolean` | stato |
| `verification_status text` | `VERIFIED`, `UNVERIFIED`, `AMBIGUOUS` |

Indice univoco parziale su `official_code` quando non nullo. Non rendere il solo nome universalmente univoco.

### `lnd_team_aliases`

Campi: `id`, `team_id FK`, `alias`, `normalized_alias`, `source_document_id NULL`, `valid_from`, `valid_to`, `verified`. Vincolo univoco su alias normalizzato e intervallo/contesto appropriato.

### `lnd_fixtures`

| Campo | Scopo |
|---|---|
| `id uuid PK` | identità fixture |
| `fixture_key text UNIQUE NOT NULL` | chiave idempotente stabile |
| `season_id`, `competition_id` | contesto obbligatorio |
| `matchday text NULL`, `leg text NULL` | giornata/fase |
| `home_team_id`, `away_team_id` | FK squadre, diverse tra loro |
| `scheduled_at timestamptz` | data/ora corrente |
| `original_scheduled_at timestamptz NULL` | data originaria |
| `status text CHECK` | `SCHEDULED`, `POSTPONED`, `RESCHEDULED`, `PLAYED`, `CANCELLED`, `UNKNOWN` |
| `home_score`, `away_score` | nullable |
| `official_match_code text NULL` | codice fonte |
| `source_document_id NULL` | prova dell'ultimo aggiornamento |
| `supersedes_fixture_id NULL` | rettifica/versione, se necessaria |
| `verified_at` | ultimo controllo |

Vincoli: squadre diverse; punteggi entrambi null o entrambi valorizzati; indici su `scheduled_at`, `status`, `home_team_id`, `away_team_id`.

## 6.2 Tesserati e appartenenza

### `lnd_persons`

Campi principali: `id uuid PK`, `federation_member_id text NULL`, `given_name`, `family_name`, `display_name`, `normalized_name`, `birth_date NULL`, `verification_status`, `created_from_document_id`, timestamp.

Indice univoco parziale su `federation_member_id`. Nessun `UNIQUE` sul solo nome.

### `lnd_registrations`

Campi: `id`, `person_id FK`, `team_id FK`, `season_id FK`, `valid_from`, `valid_to`, `status`, `source_document_id`, `verification_status`, timestamp. Questa tabella gestisce trasferimenti e cambi squadra senza riscrivere la persona.

### `lnd_monitor_targets`

Campi: `id`, `team_id NULL`, `person_id NULL`, `active`, `valid_from`, `valid_to`, `reason`, `created_at`. `CHECK` per imporre esattamente uno tra team e persona. Serve per registrare in modo esplicito Villanovese, avversarie correnti e tesserati da seguire.

## 6.3 Fonti documentali

### `lnd_sources`

Campi: `id`, `name`, `source_type`, `base_url`, `official boolean`, `active`, `last_success_at`, `created_at`, `updated_at`. Rappresenta la pagina ufficiale/elenco, non il singolo PDF.

### `lnd_documents`

| Campo | Scopo |
|---|---|
| `id uuid PK` | identità documento/versione |
| `source_id FK` | sorgente |
| `season_id FK` | stagione |
| `competition_id NULL` | se il comunicato è specifico |
| `document_type` | comunicato, rettifica, allegato |
| `bulletin_number text NULL` | numero ufficiale |
| `published_at timestamptz NULL` | data pubblicazione |
| `canonical_url text NOT NULL` | URL normalizzato |
| `content_sha256 text UNIQUE NOT NULL` | deduplicazione contenuto |
| `http_etag`, `http_last_modified` | controllo remoto |
| `storage_path text NULL` | PDF in bucket privato |
| `mime_type`, `size_bytes` | validazione |
| `extraction_status` | `PENDING`, `TEXT`, `OCR`, `FAILED` |
| `extracted_text_sha256` | integrità estrazione |
| `replaces_document_id NULL` | rettifica/sostituzione |
| `discovered_run_id` | audit |
| `created_at` | audit |

Vincoli ulteriori: unicità anche su una chiave documentale normalizzata (`source + stagione + tipo + numero + versione`) per gestire URL che cambiano senza duplicare il comunicato.

## 6.4 Provvedimenti e squalifiche

### `lnd_disciplinary_measures`

| Campo | Scopo |
|---|---|
| `id uuid PK` | identità immutabile |
| `measure_fingerprint text UNIQUE` | idempotenza semantica |
| `document_id FK`, `page_number` | fonte precisa |
| `source_excerpt text`, `excerpt_sha256` | prova e integrità |
| `season_id`, `competition_id` | separazione obbligatoria |
| `team_id NULL`, `person_id NULL` | entità risolta |
| `raw_team_name`, `raw_person_name` | testo originale |
| `fixture_id NULL` | gara collegata, se identificabile |
| `measure_type text CHECK` | `WARNING`, `DIFFIDA`, `SUSPENSION`, `EXPULSION`, `FINE`, `OTHER` |
| `quantity numeric NULL`, `unit text NULL` | es. giornate/importo |
| `effective_from date NULL` | decorrenza |
| `record_status text CHECK` | `ACTIVE`, `SUPERSEDED`, `REVOKED` |
| `verification_status text CHECK` | `PARSED`, `VERIFIED`, `AMBIGUOUS`, `UNVERIFIABLE`, `REJECTED` |
| `confidence numeric` | supporto al triage, non prova |
| `supersedes_measure_id NULL` | rettifica |
| `verified_by`, `verified_at` | audit umano/automatico |
| `created_at` | audit |

La fingerprint deve includere almeno documento/versione, stagione, competizione, entità risolta o testo grezzo, tipo, quantità e decorrenza. Una rettifica crea un nuovo record e collega/supera il precedente.

### `lnd_suspension_ledger`

Campi: `id`, `measure_id FK`, `person_id FK`, `team_id FK`, `season_id FK`, `competition_id FK`, `fixture_id NULL`, `movement_type` (`IMPOSED`, `SERVED`, `CORRECTION`, `REVOCATION`), `delta_gamedays integer`, `balance_after integer NULL`, `source_document_id`, `verification_status`, `occurred_on`, `created_at`.

Vincoli:

- saldo mai negativo quando è verificabile;
- una sola movimentazione `SERVED` per persona/competizione/fixture;
- nessun consumo su fixture rinviata/annullata;
- separazione assoluta per stagione e competizione;
- rettifiche append-only, non update distruttivi.

Una vista futura `lnd_current_suspensions` può calcolare inflitte, scontate e residue dai movimenti verificati, senza duplicare il saldo come fonte primaria.

## 6.5 Verifiche, notifiche e report

### `lnd_agent_runs`

Campi: `id`, `scheduled_for`, `started_at`, `finished_at`, `workflow_version`, `status`, `scope jsonb`, `documents_seen`, `documents_new`, `measures_new`, `error_code`, `error_summary`, `created_at`. Chiave univoca su workflow + istante pianificato per impedire doppi run.

### `lnd_verifications`

Campi: `id`, `run_id FK`, `source_id FK`, `document_id NULL`, `team_id NULL`, `fixture_id NULL`, `result` (`NEW`, `UNCHANGED`, `NOT_FOUND`, `AMBIGUOUS`, `SOURCE_UNAVAILABLE`, `ERROR`), `http_status`, `evidence jsonb`, `checked_at`. Registra anche i controlli senza novità.

### `lnd_notifications`

Campi: `id`, `run_id`, `measure_id NULL`, `report_id NULL`, `channel`, `destination_ref` non sensibile o hashato, `dedupe_key text UNIQUE`, `payload_sha256`, `status`, `attempt_count`, `provider_message_id NULL`, `sent_at`, `last_error`, timestamp.

Non salvare il token Telegram. Il payload completo può essere omesso o cifrato se contiene dati personali non necessari.

### `lnd_prematch_reports`

Campi: `id`, `fixture_id FK`, `generated_at`, `data_cutoff_at`, `content_markdown`, `content_sha256`, `verification_status`, `source_run_id`, `notification_id NULL`, timestamp. Unicità consigliata su fixture + cutoff/hash per evitare duplicati.

## 6.6 RLS e privilegi proposti

1. RLS abilitata su tutte le `lnd_*`.
2. Nessun privilegio a `anon`.
3. Nessun accesso automatico agli utenti Analytics nella prima fase.
4. Scrittura consentita solo all'identità tecnica n8n o tramite service-role server-side.
5. Eventuale lettura futura dell'app tramite viste read-only e policy dedicate.
6. PDF in bucket privato; URL firmati a breve scadenza quando necessari.
7. Log delle modifiche con `created_at`, `updated_at` e, per le rettifiche, record append-only.

Poiché `auto_expose_new_tables` non è impostato a `false` in `supabase/config.toml`, una nuova tabella `public` può essere raggiungibile dalla Data API secondo i grant di default del progetto. Ogni migration LND dovrà includere esplicitamente `REVOKE`, RLS e policy: non va lasciata la sicurezza ai default.

---

# 7. Rischi, criticità e compatibilità

## 7.1 Rischi funzionali

| Rischio | Impatto | Mitigazione |
|---|---|---|
| Calendario statico e fuori database | avversarie errate dopo rinvii/recuperi | `lnd_fixtures` come fonte canonica verificata |
| Associazione risultati per sola data | match errato o duplicato | usare team ID, competizione e fixture key |
| Nessun team ID | matching fragile sui nomi | tabella squadre + alias + codice ufficiale |
| Nessuna rosa avversaria | impossibile attribuire con certezza | anagrafica LND dedicata e stati ambigui |
| Omonimie | squalifica attribuita alla persona sbagliata | ID federale o identità composita + revisione |
| `player_season_stats` senza stagione | sovrapposizione storici | nuove tabelle sempre con `season_id` |
| Competizione ridotta a coppa/non coppa | regole disciplinari confuse | `lnd_competitions.kind` e ID separati |
| Nessuno stato rinvio/annullamento | giornate residue errate | fixture status e ledger verificato |
| PDF rettificato allo stesso URL | modifica non rilevata | hash contenuto e versionamento |
| PDF scansionato | estrazione vuota o parziale | detection + OCR + stato qualità |
| regole soglie cartellini hardcoded nella UI | falso calcolo diffida/squalifica | non riusare; basarsi sui comunicati ufficiali |

## 7.2 Rischi di integrazione con il sistema esistente

1. **Cancellazione di righe esterne in `matches`:** la sync completa elimina i match non presenti nel foglio. Non inserire fixture LND in questa tabella.
2. **Sovrascrittura di `match_events`:** la sync YouCoach cancella e reinserisce gli eventi per partita. Non inserire qui provvedimenti LND.
3. **Assenza migration base:** una migration LND non deve presumere PK/FK non verificate sulle tabelle storiche. Preferire nuove anagrafiche e collegamenti nullable fino al dump dello schema.
4. **Policy dinamiche:** l'esistenza della policy non dimostra che RLS sia attiva sulle tabelle base.
5. **API UI non stabile come contratto:** `/api/dashboard` contiene logica di presentazione e fallback, non una API versionata per agenti esterni.
6. **README non allineato:** non basare n8n su `DASHBOARD_API_URL` senza una verifica separata del deployment Apps Script.
7. **Duplicazione di codice Apps Script:** il file completo e il modulo YouCoach separato contengono implementazioni sovrapposte e nomi di proprietà diversi. Non assumere quale versione sia effettivamente deployata.

## 7.3 Rischi di sicurezza

- compromissione della service-role in n8n: accesso ampio al progetto;
- chiavi incluse negli export dei workflow o nei log;
- PDF malevoli o prompt injection nel testo;
- link PDF non ufficiali o redirect verso host non autorizzati;
- dati personali dei tesserati conservati oltre il necessario;
- notifiche Telegram a chat errata o duplicate;
- bucket PDF pubblico;
- SQL dinamico costruito dal contenuto AI;
- mancata separazione tra dato estratto, dato verificato e inferenza.

Mitigazioni minime: allowlist host ufficiali, limiti download, scansione MIME, parser in sandbox, JSON schema, query parametrizzate/PostgREST filters costruiti da valori validati, credential store, log redatti, RLS, retention, hash, audit e revisione manuale degli ambigui.

## 7.4 Soluzione più semplice e meno costosa

La soluzione con il miglior rapporto costo/manutenzione è:

1. n8n già ospitato o self-hosted, senza nuovo microservizio;
2. Supabase Data API diretta;
3. nuove tabelle `lnd_*` nello stesso progetto ma isolate;
4. PDF privati in Supabase Storage soltanto se serve conservarli; in alternativa URL + hash + estratto;
5. estrazione testuale deterministica prima dell'AI;
6. chiamata AI soltanto per documenti nuovi e sezioni candidate, non a ogni polling;
7. Telegram dal nodo nativo;
8. nessuna modifica all'app Analytics fino a quando il watcher non è stabile.

L'uso di ETag/Last-Modified e SHA-256 evita di riscaricare o rianalizzare lo stesso PDF. Una fase “shadow mode” senza notifiche riduce il rischio prima dell'attivazione.

---

# 8. Piano di implementazione progressivo

## Fase 0 — Verifica prerequisiti

- ottenere un dump read-only dello schema remoto (`pg_catalog`, PK, FK, indici, RLS, grant);
- confermare le migration applicate;
- identificare URL ufficiali LND Veneto e struttura dei comunicati;
- acquisire codici ufficiali di Villanovese, competizioni e avversarie;
- verificare calendario 2025/26 e 2026/27, inclusi recuperi;
- documentare regole disciplinari per ogni competizione;
- definire base giuridica, minimizzazione e retention dei dati personali;
- chiarire se monitorare tre o quattro prossime avversarie.

## Fase 1 — Fondazione dati isolata

- migration per `lnd_seasons`, `lnd_competitions`, `lnd_teams`, alias e `lnd_fixtures`;
- RLS/revoke espliciti;
- import controllato dei calendari 2025/26 e 2026/27;
- query di selezione Villanovese + prossime fixture;
- nessuna modifica a tabelle Analytics esistenti.

## Fase 2 — Collector documentale

- `lnd_sources`, `lnd_documents`, `lnd_agent_runs`, `lnd_verifications`;
- schedule lun/mer/ven 15:00–20:00;
- conditional GET, hash e deduplicazione;
- archiviazione PDF privata opzionale;
- alert tecnico solo su errori persistenti della fonte.

## Fase 3 — Parser in shadow mode

- estrazione testo/OCR;
- parsing strutturato;
- mapping squadra/persona;
- memorizzazione candidati come `PARSED`/`AMBIGUOUS`;
- confronto umano con un campione di comunicati di entrambe le stagioni;
- nessuna notifica sportiva automatica.

## Fase 4 — Disciplina e rettifiche

- `lnd_disciplinary_measures`, registrazioni e ledger;
- regole separate per competizione;
- gestione rettifiche/revoche;
- calcolo giornate scontate soltanto da fixture verificate;
- test di idempotenza, replay e concorrenza.

## Fase 5 — Telegram e report prepartita

- `lnd_notifications` con dedupe key;
- notifiche solo per novità/rettifiche verificate;
- report venerdì dopo il controllo delle 20:00;
- indicazione visibile dell'ultimo controllo riuscito e delle ambiguità.

## Fase 6 — Hardening e osservabilità

- identità n8n least-privilege o gateway ristretto;
- rotazione credenziali;
- metriche su polling, PDF, parsing, ambiguità e notifiche;
- backup e retention;
- runbook per fonte indisponibile, PDF illeggibile e rettifica urgente;
- eventuale vista read-only per integrare LND-WATCHER nella dashboard, solo dopo stabilizzazione.

---

# 9. Informazioni non verificabili dal repository

Elenco preciso dei punti che richiedono accesso al database, alle piattaforme o a fonti esterne:

1. schema SQL completo e tipi delle tabelle create prima delle migration versionate;
2. PK, FK, `UNIQUE`, `CHECK`, default e indici di `utenti`, `players`, `matches`, statistiche e tabelle Veo;
3. stato RLS effettivo e policy/grant correnti delle tabelle base;
4. effettiva applicazione in produzione di tutte le migration Git;
5. elenco reale delle tabelle presenti, incluse le tabelle tattiche candidate;
6. contenuto, quantità, qualità e aggiornamento dei record Supabase;
7. valore e natura delle credenziali; nessun segreto è stato letto o riportato;
8. identificativo ufficiale LND/FIGC della ASD Villanovese;
9. codici ufficiali delle avversarie e ufficialità delle denominazioni nel calendario TypeScript;
10. calendario ufficiale corrente dopo eventuali variazioni, rinvii, recuperi o annullamenti;
11. presenza di fixture future in `public.matches` e risultato effettivo della query SQL proposta;
12. dati storici completi della stagione 2025/26;
13. rose attuali Villanovese e avversarie;
14. numeri di tessera, date di nascita, trasferimenti e periodi di tesseramento;
15. corrispondenza tra `player_id` interno e identità federale;
16. provvedimenti disciplinari ufficiali, diffide e giornate residue;
17. regole LND applicabili alle soglie e alla consumazione delle squalifiche per ciascuna competizione;
18. URL ufficiali, feed/API, modalità di pubblicazione e struttura PDF LND Veneto;
19. necessità e qualità OCR dei PDF reali;
20. presenza/configurazione di un'istanza n8n e relativo piano/hosting;
21. bot Telegram, chat di destinazione e policy di notifica;
22. bucket Supabase Storage disponibile e relative policy;
23. deployment effettivo della Web App Apps Script citata dal README;
24. trigger temporali configurati manualmente in Google Apps Script;
25. quale dei due moduli Apps Script YouCoach sia effettivamente installato/deployato;
26. ambiente di hosting Next.js e URL pubblico dell'app;
27. disponibilità attuale delle fonti Veo, YouCoach, Google Drive e pagina classifica;
28. base giuridica, tempi di conservazione e destinatari autorizzati per dati personali e disciplinari.

## Conclusione

Il progetto offre componenti riutilizzabili importanti — Supabase, Data API, Auth, pipeline Apps Script, ID interni dei giocatori e un calendario 2026/27 leggibile dal codice — ma non possiede ancora il modello dati necessario per un watcher disciplinare ufficiale e multi-squadra.

LND-WATCHER 2.0 deve partire da un dominio dati separato e auditabile. Il primo prerequisito tecnico non è il parser AI, ma la creazione di identità canoniche per stagione, competizione, squadra, fixture e tesserato. Solo dopo questa base è sicuro automatizzare PDF, rettifiche, giornate residue e notifiche.
