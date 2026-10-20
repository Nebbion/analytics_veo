# Villanovese Analytics — Auth V3

Dashboard privata ASD Villanovese, stagione 2026/2027.

## Sicurezza V3
- Supabase Auth per autenticazione.
- Profilo applicativo in `public.utenti`.
- Ruoli ammessi: `STAFF` e `GIOCATORE`.
- `GIOCATORE` deve avere un `Player_ID` associato.
- `GIOCATORE` vede il proprio profilo personale, la dashboard squadra, la
  tattica completa e i report partita completi.
- Le sezioni `Minuti` e `Confronto` restano visibili soltanto a `STAFF`.
- Il browser chiama soltanto `/api/dashboard`; l'URL Apps Script è usato server-side tramite `DASHBOARD_API_URL`.
- Gli asset pubblici non sono protetti dal middleware.
- Cache disabilitata per i dati dashboard.
- Header HTTP di sicurezza di base.

## Limite attuale
L'endpoint Google Apps Script resta una Web App separata e, se pubblicata con accesso pubblico, può essere chiamata direttamente conoscendone l'URL. Questa è la ragione per cui la V3 usa Apps Script solo server-side nella dashboard. Per la sicurezza definitiva dei dati statistici è prevista la migrazione delle statistiche in Supabase con RLS.

## Avvio
1. Copia `.env.example` in `.env.local`.
2. Imposta `NEXT_PUBLIC_SUPABASE_URL`.
3. Imposta `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Imposta `DASHBOARD_API_URL` con l'URL `/exec` della Web App Apps Script.
5. `npm install`
6. `npm run dev`
7. Apri `http://localhost:3000`.

## Configurazione utenti
La tabella Supabase `public.utenti` deve contenere:
`id | player_id | nome | email | ruolo | attivo`

Per `STAFF`, `player_id` può essere vuoto.
Per `GIOCATORE`, `player_id` deve corrispondere al `Player_ID` presente nelle statistiche.

## Deploy database da GitHub

Le migration in `supabase/migrations` vengono applicate automaticamente al database
di produzione quando una modifica a quella directory viene inviata su `main`.

Configurare una sola volta questi GitHub Actions Secrets:

- `SUPABASE_ACCESS_TOKEN`: personal access token Supabase limitato al progetto.
- `SUPABASE_PROJECT_ID`: project ref del progetto Supabase.
- `SUPABASE_DB_PASSWORD`: password del database del progetto.

Il workflow `.github/workflows/deploy-supabase.yml` esegue prima il dry-run e poi
`supabase db push`. Dopo l'attivazione di questo flusso, tutte le modifiche allo
schema devono passare da una nuova migration Git.
