# Confronto piano–video sui corner offensivi · prototipo locale

## Che cosa è stato implementato

La nuova sezione **Corner a favore · piano e video** è dentro `/viceallenatore`. Recupera dal manifest locale il video già importato e le pagine del PDF intitolate “angolo offensivo”. Per Montagnana recupera le varianti **un braccio alto**, **due braccia alte**, **mano in testa** alle pagine 6, 7 e 8. Non richiede di reinserire partita, percorso video o PDF.

Il motore Python opzionale `local_engine/corner_engine.py` esegue:

1. rendering degli schemi, estrazione proposta delle icone e del reticolo del mezzo campo;
2. scansione rada del proxy con un rilevatore di persone;
3. proposta di finestre con raggruppamenti da verificare;
4. analisi di una clip fino a due minuti a 2 fotogrammi al secondo, con tracce provvisorie e compensazione proposta della camera;
5. confronto geometrico delle posizioni dopo conferma dello schema e della prospettiva;
6. confronto inizio–fine dei movimenti solo se il movimento atteso è stato chiarito, l'abbinamento della traccia è verificato e la compensazione della camera è disponibile;
7. persistenza locale di schemi, revisioni, clip e risultati, con snapshot di piano e checksum. Gli stessi input e la stessa versione del rilevatore riusano la cache.

Il numero della traccia non è una maglia e non è un'identità. Il colore della maglia propone un confronto anonimo dell'occupazione degli spazi; gli abbinamenti nominali restano da verificare. Non vengono creati giocatori o riscritti eventi Analytics.

## Uso del prototipo

Nell'app avviata sul Mac seleziona la gara, poi vai a **Corner a favore · piano e video**. Scegli lo schema recuperato dal PDF. L’allenatore ha chiarito che le icone cerchiate sono alternative secondo il lato della battuta. Questa interpretazione è memorizzata localmente e vincolata al checksum del PDF, con le etichette trascritte dal disegno come riferimenti di ruolo, non come identità riconosciute nel video. Nel piano di Montagnana il riferimento raffigurato è la battuta da sinistra e le posizioni cerchiate sono le alternative da destra. Il sistema presenta 10 posizioni per lato in ciascuno dei tre schemi, senza sommare le alternative. Il lato si intende guardando la porta avversaria. Gli schemi completi restano da confermare prima del confronto.

La ricerca mostra poche miniature per volta, con tutte le altre disponibili. Ciascuna è una **scena candidata**, non un corner accertato. Seleziona una finestra, affina l'intervallo se necessario e premi **Analizza questo episodio**. La clip viene estratta dall'originale e visualizzata direttamente nella pagina, senza passaggio JSON/PDF.

Nell’episodio indica il lato della battuta soltanto quando è verificabile nel video. Le verifiche salvano il lato e lo snapshot del piano; un lato non verificato o un ruolo ancora duplicato rendono il confronto non valutabile. Il selettore dello schema permette di vedere le due disposizioni senza reinserire i nomi. La distinzione delle alternative non viene trasformata in un movimento atteso.

Per un confronto metrico servono quattro riferimenti dell'area di rigore nel fotogramma. Se non sono visibili, il risultato resta non valutabile. Le coordinate dello schema usano un mezzo campo convenzionale 68×52,5 m; il riferimento dell'area usa 40,32×16,5 m. Lo scarto in metri è una proposta dipendente da disegno, prospettiva e verifica dei riferimenti, non una misura certificata. Non è usato per dichiarare automaticamente errore tattico.

## Setup una volta

Questo Mac ha già dipendenze e pesi installati. Per replicare:

```sh
local_engine/.venv/bin/python -m pip install -r local_engine/requirements-cv.txt
```

Scaricare il checkpoint ufficiale indicato dal catalogo [Torchvision](https://docs.pytorch.org/vision/stable/models/faster_rcnn) in:

```text
data/local/models/torch/hub/checkpoints/fasterrcnn_mobilenet_v3_large_fpn-fb6a3cc7.pth
```

Il motore verifica il prefisso SHA-256 ufficiale prima del caricamento. Non scarica altri modelli durante l'analisi. [Torchvision](https://github.com/pytorch/vision/blob/main/LICENSE) usa BSD-3-Clause per il codice; i pesi sono il checkpoint COCO_V1 ufficiale e restano locali, senza redistribuzione nel repository. La licenza del codice non è usata come dichiarazione di licenza delle immagini di addestramento. PyTorch/OpenCV e relative dipendenze sono isolati nel venv; i vincoli PyMuPDF/FFmpeg restano quelli dell'audit precedente.

## Privacy e accesso

Le route Node `/api/viceallenatore/local` e `/api/viceallenatore/media` richiedono la sessione STAFF attiva esistente. Sono abilitate solo su loopback e rifiutano Vercel. I POST richiedono lo stesso Origin. I comandi usano argomenti separati e JSON su stdin, mai shell interpolata. I file visibili sono una whitelist di immagini/clip dentro il manifest della partita, con controllo `realpath`; non vengono serviti manifest, originali o percorsi arbitrari. Le clip supportano Range HTTP e hanno cache privata disabilitata.

Le elaborazioni e revisioni sono sotto `data/local/matches/<hash-id>/corners/`, già ignorata da Git. Nessuna migration o scrittura al database remoto è necessaria per questo prototipo.

## Prova reale e limiti

Sul video Montagnana da circa un'ora e 55 minuti:

- il rilevatore SSDLite iniziale perdeva quasi tutti i giocatori piccoli nei campioni controllati ed è stato scartato;
- il modello usato è Faster R-CNN MobileNetV3 Large FPN COCO_V1, con PyTorch 2.15.0 e Torchvision 0.29.2;
- scansione di 461 fotogrammi a intervalli di 15 secondi: **122,18 secondi CPU**, senza errore;
- ha proposto **57 raggruppamenti**, che non equivalgono ai tre corner a favore indicati dal report. La selezione contiene falsi positivi e non è un rilevatore di corner già validato;
- su una finestra tecnica di 30 secondi, tempo video 35:45–36:15: 60 fotogrammi elaborati, clip dall'originale e trasformazioni della camera proposte per i 60 fotogrammi. La correttezza delle tracce e delle trasformazioni non è stata misurata contro annotazioni di verità a terra;
- nei processi di benchmark `torch.backends.mps.is_available()` restituiva `False`; i tempi sono CPU, non GPU;
- le tre pagine del PDF producono 12, 12 e 13 icone candidate: questo dimostra la necessità di chiarire alternative, posizioni finali e possibili falsi positivi, non che ci siano quei numeri di giocatori in campo.

**Non è ancora verificato un giudizio tattico sui corner reali.** Il significato dei cerchi è stato chiarito. Prima di un giudizio tattico servono ancora la conferma della disposizione completa, almeno un episodio etichettato come corner a favore, la verifica della prospettiva e delle tracce. Non sono implementati riconoscimento affidabile del segnale con le braccia, lettura automatica dei numeri, re-identificazione certa, valutazione dei blocchi o sincronismi. Il primo passo successivo è validare un corner e uno schema, poi misurare e ridurre i falsi positivi su altri episodi.
