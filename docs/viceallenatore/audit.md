# Audit verificato prima dell'implementazione

Data: 20 novembre 2026. Repository: `/Users/michelemarini/workspace/villanovese-analytics`; branch iniziale `main`, sincronizzato con `origin/main`. Una nota utente `Villanovese_Analytics_Viceallenatore_AI_Codex.md` era già non tracciata e non è stata modificata.

## Architettura reale

- Next.js App Router, React, TypeScript; pagine principali `app/page.tsx` e `app/matches/[matchId]/page.tsx`; CSS globale e componenti di report riutilizzabili. Nessuna suite di componenti UI esterna.
- Supabase Auth via `@supabase/ssr`, cookie server e `proxy.ts`. `public.utenti` ha ruoli `STAFF` e `GIOCATORE`, flag `attivo`, `player_id`. La dashboard legge dati tramite API server e Apps Script; il report partita legge le tabelle Supabase. Non tutti i dati Analytics sono ancora in Supabase.
- `public.matches(match_id text)` e `public.players(player_id text)` sono identificativi canonici referenziati dalle migration già presenti. `match_lineups` lega player e partita e contiene `numero`, `titolare`; l'elenco prepartita non viene presunto ufficiale. `match_events` ha gol/cartellini YouCoach. Tabelle Veo già interrogate: `veo_position_stats`, `veo_event_positions`. La squadra avversaria nel flusso Analytics è testo in `matches.partita`, non una FK a un club. Il registro LND ha `lnd_seasons`, `lnd_teams`, `lnd_fixtures` separati; non esiste una mappatura verificata verso ogni partita Analytics.
- Migration Supabase sotto `supabase/migrations`; workflow `.github/workflows/deploy-supabase.yml` pubblica su produzione dopo push/merge su `main`. Nessuna migrazione nuova è stata inviata a produzione. README documenta l'uso di Vercel/Apps Script ma nel repository non è presente una configurazione Vercel da assumere come fonte di verità operativa.
- Gli import report esistenti sono Google Apps Script (`apps-script/youcoach_lineups_substitutions.gs`, `villanovese_complete.gs`), non parser MHTML locali. Nessun file `.mhtml`, PDF di piano o video reale era nel repository all'audit.

## Mac e strumenti, output verificato

- `system_profiler`: MacBook Pro `Mac17,2`, chip Apple M5, CPU 10 core (4 performance, 6 efficiency), RAM 16 GB, GPU Apple M5 10 core, Metal supportato; macOS 26.6.2 (25G83). Identificativi hardware personali esclusi da questo documento.
- `df -h .` all'audit: volume 460 GiB, 402 GiB usati, 13 GiB liberi (97%). Dopo la pulizia automatica Homebrew: 18 GiB liberi (96%). Video 4K/proxy richiedono controllo dello spazio prima di elaborare.
- `python3 --version`: 3.14.5; Homebrew `/opt/homebrew/bin/brew`; Codex CLI presente. PyTorch non presente: `torch.backends.mps.is_available()` non è stato eseguito. Hardware Metal non implica una misurazione PyTorch MPS.
- All'audit `ffmpeg`/`ffprobe` assenti. Installati poi con Homebrew: FFmpeg/ffprobe 9.0.2. Creato `local_engine/.venv`, con PyMuPDF 1.28.2 e ReportLab 4.5.1. Nessun pacchetto CV installato.
- Licenze: [PyMuPDF/MuPDF](https://pymupdf.readthedocs.io/en/latest/about.html) sono AGPL o commerciali; verificare le condizioni prima di distribuire un prodotto chiuso. [FFmpeg](https://ffmpeg.org/legal.html) è principalmente LGPL con componenti opzionali GPL; la build Homebrew installata include `--enable-gpl` e `--enable-libx264`. Codec/brevetti richiedono verifica per distribuzione. Ultralytics/pesi non sono installati in fase 1; una eventuale fase CV richiede audit separato della versione e dei pesi scelti.

## Scelta d'integrazione

Opzione B: motore Python/FFmpeg sul Mac + SQLite locale + bundle JSON versionato importato manualmente nella nuova area di Analytics. Il browser può aprire un video o PDF con file picker locale senza inviare l'originale. Il bundle contiene hash e metadati, non `local_path`. Le annotazioni, approvazioni e revisioni fatte nella UI passano attraverso la sessione Supabase staff e RLS. Questo evita la dipendenza da richieste HTTPS verso `localhost` da un sito pubblicato. Il manifest locale è sotto `data/local/matches/<hash del match_id>/` per evitare traversal e nomi non portabili; l'ID originale resta nel DB e nel bundle.

## Rischi e limiti verificati

- Il video e i due MHTML reali sono stati forniti e importati nel manifest locale del Match_ID canonico `3998683`. Il primo marcatore compare come candidato al 12′ nel cartellino Veo e al 13′ nella cronaca YouCoach; gli originali e i due valori restano separati per la revisione dello staff. Il parser non valida automaticamente KPI, marcatori o titolari. Il PDF del piano gara non è ancora presente nei file locali verificati.
- Una follow-cam può perdere movimenti senza palla. La UI richiede osservabilità e pertinenza; nessun episodio mancante viene contato come corretto.
- Lo stack Supabase locale completo non è partito perché la porta 54322 è occupata da un altro progetto. La migration è stata provata su PostgreSQL 17 isolato, con fixture delle tabelle canoniche, non sul database reale del progetto. Gli ID in `matches` e `players` sono stati inferiti dalle FK e query già presenti, non verificati contro un dump live.
- Il report usa un'esportazione esplicita dalla UI. La prima fase non contiene CV, inferenza autonoma di ricorrenza o LLM.

## Test iniziali

`node --test tests/*.test.mjs`: 22/22 passati. `npm run build`: passato. `local_engine/.venv/bin/python -m unittest discover -s tests -p 'test_viceallenatore_local.py'`: 8/8 passati con fixture sintetiche (MHTML nei formati reali, PDF, video 4K, proxy, clip, contratto evento, persistenza, rimappatura SHA-256, report). La migration è stata applicata con successo su PostgreSQL 17 isolato con fixture delle tabelle canoniche; le asserzioni coprono FK, RLS staff/giocatore/anon, immutabilità, audit, intervalli, sincronizzazione, flusso finding→allenamento→follow-up e rifiuto di fonti cross-match. Lo stack Supabase locale completo non è partito perché un altro progetto occupa la porta 54322; non è stato interrotto. Il benchmark di cinque minuti sul video reale è in [benchmark.md](benchmark.md).
