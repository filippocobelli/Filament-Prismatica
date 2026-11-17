# Tratto

Tratto usa una Bambu Lab **P1S** come **plotter a penna** o come **plotter da taglio** con il kit **UMTS** di Falu ([MakerWorld 2029113](https://makerworld.com/models/2029113)). Da un'immagine, da un SVG o da un disegno generativo crea un **3MF per Orca Slicer** con tutte le impostazioni del kit e le pause per montare e togliere il modulo.

Versione 0.3. È inclusa nelle edizioni **Full** e **Lite** (pulsante **Tratto** nella barra in basso). Si può usare anche da sola: è un file HTML unico, senza server.

## Il flusso, in sei passi

1. **Utensile**: Stabilo point 88, POSCA, lama da taglio o penna personalizzata. Per ognuno: come montarlo, Z‑offset, velocità, Z‑hop, accelerazione e passate. I valori si salvano nel browser, utensile per utensile.
2. **Foglio**: schema del piatto con l'area esclusa del profilo UMTS e l'area utile (≈ 206 × 199 mm). Il foglio va a **29 mm dalla parete destra** e **41 mm da quella posteriore**. Una correzione X/Y sposta tutti i file se il tratto cade fuori posto.
3. **Disegno**:
   - *Immagine*: tratteggio incrociato, contorni (isolinee), linee a tratto (scheletro), onde, spirale, linea continua (TSP).
   - *Generativo*: campo di flusso, topografia, creste, Truchet, spirografo, armonografo, moiré, labirinto. «🎲 Variante» cambia il seme, «✨ A caso» cambia anche lo stile.
   - *SVG*: ogni colore del tratto diventa un gruppo (una penna); le forme piene si possono riempire a tratteggio.
   - *Adesivi ✂*: dal soggetto (meglio PNG trasparente) un file **disegno** a penna e un file **taglio** con la sagoma e il margine scelto; oppure griglie di cerchi e rettangoli per etichette.
   - *Tavola tecnica*: tavola quotata con cornice, cartiglio e, se vuoi, carta millimetrata (vedi sotto).
   - *Calibrazione*: cornice dell'area utile con tacche ogni 10 mm, test di pressione con pausa a ogni passata, prova a vuoto.
4. **Colori**: ogni gruppo è un cambio di penna, con nome, colore e numero di passate.
5. **File**: riepilogo di strati e pause, download del 3MF (e dell'SVG).
6. **In stampa**: la sequenza da seguire e i problemi comuni.

## Tavola tecnica

Disegni in stile tavola quotata, con cornice a riferimenti di zona, cartiglio (titolo, materiale, scala, autore, data) e testo a tratto singolo (font Hershey) leggibile anche con la penna da 0,4 mm.

**Da foto**
- Fino a tre foto: fronte, fianco, retro. Meglio oggetto dritto su sfondo uniforme, foto da lontano con lo zoom (meno prospettiva).
- Inserisci l'**altezza reale** dell'oggetto: tutte le quote vengono ricalcolate in scala da lì.
- Tratto ricava la sagoma, i dettagli interni (cursore «Dettagli interni») e le quote: larghezza e altezza totali più le larghezze nei punti caratteristici (spalle, colli) e le loro altezze dalla base (cursore «Quote di dettaglio»).
- Le misure sono stime ricavate dalla foto.

**Da STL / 3MF**
- Carica un STL (binario o ASCII) o un 3MF, anche quelli salvati da Bambu Studio e Orca.
- Vista frontale, dall'alto e laterale disposte con il metodo europeo (primo diedro) o americano, più la vista isometrica.
- Spigoli vivi (angolo regolabile) e contorni; le parti nascoste tratteggiate; quote d'ingombro vere.
- Scala scelta in automatico tra valori normalizzati (1:1, 1:2, 2:1…) e scritta nel cartiglio.

Gruppi: **Griglia** (se attivata, si disegna per prima), **Disegno** (oggetto, cornice, cartiglio) e **Quote**, con le pause per cambiare penna. Con «quote con una seconda penna» spento, disegno e quote stanno nello stesso gruppo.

## Cosa c'è nel 3MF

È un progetto di Orca Slicer (stampante *Bambu Lab P1S 0.4 nozzle*, processo *0.20mm Standard @BBL X1C*, filamento *Generic PLA*) con le modifiche del profilo UMTS:

| | |
|---|---|
| Stampante | Z‑offset dell'utensile, area esclusa `0x0, 258x0, 258x55, 48x55, 48x258, 0x258`, retrazione 0,01 mm (sblocca lo Z‑hop), Z‑hop normale su ogni spostamento, niente wipe, start senza linea di spurgo (opzione) |
| Processo | strato 0,10 mm, larghezze 0,40 mm, 1 perimetro **Arachne**, niente riempimenti, gusci, brim, torre e timelapse con movimento |
| Filamento | 180 °C (evita l'errore di estrusione a freddo), flusso 0,01, piano 25 °C, ventole spente, nessun rallentamento per raffreddamento |

Ogni tratto è una striscia larga 0,40 mm e alta uno strato: Arachne la percorre con **una sola linea centrale**. Le direzioni del tratteggio stanno su strati diversi, così le linee che si incrociano non si fondono.

Gli strati:

1. **strato a vuoto** senza modulo: la testina sale alla quota compensata;
2. **pausa** `M400 U1`: monti UMTS con la prima penna;
3. le passate di ogni gruppo, con una pausa prima di ogni cambio penna (e, se vuoi, prima di ogni passata);
4. **pausa finale**: togli UMTS prima del G‑code di fine, poi interrompi (l'ultimo strato gira a vuoto).

## In stampa

- Stampante in **modalità solo LAN** e **Orca Slicer**: con Bambu Studio la compensazione Z non viene applicata.
- Apri il 3MF e carica le impostazioni del progetto. L'avviso di G‑code modificato riguarda lo start senza linea di spurgo; quello di regioni sospese si ignora.
- Non usare «Centra» o «Disponi»: la posizione è quella del foglio.
- Lascia il filamento caricato e disattiva il timelapse nell'invio.
- **In caso di collisione spegni subito la stampante.** Mai finire la stampa con il modulo montato.

Le prime volte segui le fasi di prova dell'autore (solo base, set senza penna, taratura in tempo reale): sono nel passo 6.

## Lama e adesivi

- Con il modulo di taglio originale l'autore indica di partire dal profilo Stabilo e tarare Z a mano.
- Per i porta‑lama tipo Roland (corpo ~11,5 mm) serve il remix [Sistema di taglio per P1 X1](https://makerworld.com/models/3564112) di rostkuchen: il porta‑lama sta più in basso, lo Z‑offset va misurato.
- Materiale su supporto siliconato, fissato con nastro; lama che sporge appena più del materiale; 20–30 mm/s, 2 passate.
- Disegno e taglio usano la stessa posizione: tra i due file il foglio non si muove.

## Sviluppo

- Sorgenti in `tratto/src/`: `app.html` (interfaccia), `core.js` (algoritmi, mesh, 3MF), `tavola.js` (tavole tecniche), `font-futural.json` (font Hershey a tratto), `vendor/` (Clipper, libtess, fflate), `p1s-base.json` (profilo Orca risolto).
- `python3 tratto/src/build.py` scrive `server/public/tratto/index.html`; poi `npm run build:lite` in `tools/` aggiorna la Lite.
- `python3 tratto/src/mkbase.py <OrcaSlicer>/resources/profiles/BBL` rigenera il profilo da una versione nuova di Orca (oggi 2.5.1).
