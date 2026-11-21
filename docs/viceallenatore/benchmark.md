# Benchmark locale sul video reale

Misura del 20 novembre 2026 sul MacBook Pro Apple M5, 16 GB RAM, FFmpeg 9.0.2. Fonte: filmato della partita di Coppa Villanovese–Montagnana del 6 settembre 2026, Match_ID `3998683`. I file originali e il campione elaborato restano locali e ignorati da Git.

| Misura | Risultato |
| --- | ---: |
| Video sorgente | H.264, 1920×1080, 30000/1001 fps |
| Durata sorgente | 6907,868 s (1 h 55 min 7,868 s) |
| Dimensione sorgente | 4.027.657.439 byte |
| Campione elaborato | primi 300,033 s |
| Proxy campione | H.264, preset `veryfast`, CRF 28, AAC, massimo 1080p |
| Tempo reale del campione | 27,35 s |
| Memoria residente massima del processo | 559.546.368 byte |
| Dimensione proxy campione | 52.585.262 byte |

La misurazione usa `/usr/bin/time -l` e un'estrazione di cinque minuti dal video reale. Il sorgente è già 1080p: la conversione non riduce la risoluzione. Il risultato del campione non è una misura del tempo o della dimensione del proxy completo. Lo spazio libero prima del proxy completo era circa 11 GiB, controllato con `df -h .`.

Il proxy completo è stato creato e verificato con `ffprobe`: H.264/AAC, 1920×1080, 6907,868 s, **1.270.645.271 byte**. La sua esecuzione non è stata avviata sotto un cronometro di benchmark, quindi non riporto un tempo preciso. Una clip tecnica dei primi 10 s è stata estratta dall'originale e verificata con `ffprobe`: durata 10,010 s, 5.648.785 byte. La clip prova l'elaborazione del file, non è un episodio tattico annotato.

PyTorch non è installato: nessun benchmark MPS o di riconoscimento tattico è stato eseguito. Il flusso attuale indicizza, crea proxy e clip; le conclusioni tattiche richiedono annotazione e revisione staff.

## Primo prototipo corner · 21 novembre 2026

Rilevamento persone CPU con Faster R-CNN MobileNetV3 Large FPN: 461 fotogrammi dell'intera gara, un campione ogni 15 s, elaborati in 122,18 s. Sono stati proposti 57 raggruppamenti da verificare, non 57 corner. Nessuna accuratezza di riconoscimento corner o conformità tattica è stata stimata. Dettagli, dipendenze e limiti in [corner-prototype.md](corner-prototype.md).
