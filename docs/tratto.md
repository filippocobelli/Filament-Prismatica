# Tratto

*[English version](en/tratto.md)*

Tratto usa una Bambu Lab **X1 Carbon, P1S, P1P, A1 o A1 mini** come **plotter a penna** o come **plotter da taglio** con il kit **UMTS** di Falu ([MakerWorld 2029113](https://makerworld.com/models/2029113)). Da un'immagine, da un SVG o da un disegno generativo crea un **3MF per Orca Slicer** con tutte le impostazioni del kit e le pause per montare e togliere il modulo.

Versione 0.9. È inclusa nelle edizioni **Full** e **Lite** (pulsante **Tratto** nella barra in basso). Si può usare anche da sola: è un file HTML unico, senza server.

## Lingua

L'interfaccia è in italiano e in inglese. Tratto segue la lingua del browser; il pulsante **EN / IT** nell'intestazione la cambia, e `?lang=en` o `?lang=it` nell'indirizzo la impone. La scelta resta salvata nel browser. Nomi dei gruppi, nomi delle parti nel 3MF, nomi dei file e testi delle tavole tecniche (cartiglio, nomi delle viste) seguono la lingua scelta.

## Il flusso, in sei passi

1. **Stampante e utensile**: scegli la stampante (X1C, P1S, P1P; A1 e A1 mini da verificare, vedi sotto), poi Stabilo point 88, POSCA, lama da taglio o penna personalizzata. Per ognuno: come montarlo, Z‑offset, velocità, Z‑hop, accelerazione e passate. I valori si salvano nel browser, utensile per utensile e stampante per stampante. Con **Profili salvati** dai un nome alla taratura di una penna (Z‑offset, velocità, Z‑hop, accelerazione, larghezza, passate e correzione X/Y) e la ritrovi quando la rimonti.
2. **Foglio**: schema del piatto con l'area esclusa del profilo UMTS e l'area utile (≈ 206 × 199 mm su X1/P1). Su X1/P1 il foglio va a **29 mm dalla parete destra** e **41 mm da quella posteriore**; sulle A1 il piatto si muove, quindi il foglio va tagliato perché non sporga e fissato sui quattro lati. Una correzione X/Y sposta tutti i file se il tratto cade fuori posto.
3. **Disegno**:
   - *Immagine*: tratteggio incrociato, contorni (isolinee), linee a tratto (scheletro), onde, spirale, linea continua (TSP), puntinato (stippling), schizzo (segmenti corti alla DrawingBot).
   - *Generativo*: campo di flusso, topografia, creste, Truchet, spirografo, armonografo, moiré, labirinto, Schotter (omaggio a Georg Nees), rosone, tunnel, nastri, bolle, op‑art, automi cellulari, albero, girasole, eco (una linea ripetuta a passo costante, aperta o a contorni concentrici). Lo spirografo ha anche i cursori per i denti della ruota e la distanza della penna. «🎲 Variante» cambia il seme, «✨ A caso» cambia anche lo stile.
   - *SVG*: ogni colore del tratto diventa un gruppo (una penna); le forme piene si possono riempire a tratteggio. Sotto il file compare l'elenco di quello che non verrà disegnato (testi, immagini, cloni «use», ritagli, maschere, filtri), con il modo di sistemarlo.
   - *Adesivi ✂*: dal soggetto (meglio PNG trasparente) un file **disegno** a penna e un file **taglio** con la sagoma e il margine scelto; oppure griglie di cerchi e rettangoli per etichette.
   - *Mappa*: piantina di una città da OpenStreetMap (vedi sotto).
   - *Tavola tecnica*: tavola quotata con cornice, cartiglio e, se vuoi, carta millimetrata (vedi sotto).
   - *Calibrazione*: cornice dell'area utile con tacche ogni 10 mm, test di pressione con pausa a ogni passata, prova a vuoto.
4. **Colori**: ogni gruppo è un cambio di penna, con nome, colore e numero di passate.
5. **File**: riepilogo di strati e pause, download del 3MF (e dell'SVG).
6. **In stampa**: la sequenza da seguire e i problemi comuni.

## Stampanti

| Stampante | Stato | Area utile | Foglio |
|---|---|---|---|
| X1 Carbon, P1S, P1P | valori di Falu per UMTS | ≈ 206 × 199 mm | A4, a 29 mm da destra e 41 mm dal retro |
| A1 | da verificare | ≈ 206 × 235 mm | A4 tagliato a 210 × 250 mm, centrato |
| A1 mini | da verificare | ≈ 157 × 163 mm | 172 × 176 mm, centrato |

X1C, P1S e P1P hanno la stessa testina: valgono lo Z‑offset (+17 mm Stabilo, +20 mm POSCA) e l'area esclusa pubblicati da Falu. Per A1 e A1 mini UMTS ha una versione per la testina, ma Falu non pubblica Z‑offset e area esclusa: lo Z‑offset si misura (ugello sul piatto, poi alzi Z finché l'utensile tocca) e l'area di Tratto è prudenziale. Prima di disegnare fai **Calibrazione → Cornice area** senza penna. Nell'invio da Orca, sulle A1 disattiva anche il livellamento del piatto: l'ugello caldo toccherebbe il foglio.

Ogni 3MF usa il profilo ufficiale di Orca di quella stampante (`printers-base.json`, rigenerato con `tratto/src/mkbase.py`). Tratto toglie solo lo spurgo: la linea davanti al piatto su X1/P1, le linee di prova sulle A1.

### Perché sempre Orca Slicer

- Ogni modello ha la sua sequenza di avvio (azzeramento, controlli, riscaldamento) che il firmware si aspetta: Orca la genera dal profilo ufficiale, sempre aggiornato.
- Orca ha lo **Z‑offset** nel profilo stampante, il trucco su cui si basa UMTS; Bambu Studio non ce l'ha.
- Le pause per montare il modulo e cambiare penna diventano pause vere della stampante.
- L'anteprima di Orca mostra il percorso reale con le alzate della penna. Il simulatore di Tratto mostra l'ordine indicativo, quello esatto lo decide Orca.
- Il file finale è un normale `.gcode.3mf` che la stampante accetta via LAN o da scheda microSD.

## Strumenti per non sbagliare

- **Unisci tratti vicini** (passo 4, Effetti): due tratti con gli estremi a meno di 0,3 mm diventano uno solo. La penna si alza meno e non lascia puntini dove si riappoggia. A 0 è spento.
- **Simulatore** (pulsante «▶ simula» sull'anteprima): riproduce il disegno con play/pausa, velocità (1×–100×) e barra per scorrere. Mostra posizione, penna su/giù, gruppo e passata. L'ordine è quello di Tratto; quello finale lo decide Orca, che lo mostra nella sua anteprima.
- **Controlli** (passo 5): area utile, spurgo tolto davvero dalla sequenza di avvio, Z‑hop sufficiente, Z‑offset plausibile, velocità e accelerazione entro i limiti della stampante, temperature, pause al posto giusto, tratti così corti da diventare puntini. Un errore blocca il download.
- **Quadrato 20 mm** (Calibrazione): quadrato con croce al centro. Se i lati non misurano 20 mm la penna balla nel supporto; se la croce è fuori posto correggi X/Y; se il tratto è irregolare ritocca lo Z‑offset. Poi salva la penna nei profili.

## Mappe

Cerca una città o un indirizzo: Tratto scarica strade, ferrovie, fiumi e laghi da **OpenStreetMap** e le quote dai **Terrain Tiles** (Mapzen, AWS Open Data), poi disegna la piantina con titolo, paese e coordinate sotto, in stile poster.

- **Larghezza della zona** da 0,3 a 8 km; se la cambi, i dati si riscaricano da soli.
- Strati: strade (le principali più spesse, con due tratti in più ai lati), vie di servizio e pedonali, ferrovie e tram, acqua, curve di livello (distanza in metri; in montagna sale da sola per non superare circa 30 curve), edifici, cornice, titolo e coordinate.
- Tre penne, ognuna con la sua pausa: **curve di livello** (arancione), **acqua** (blu), **strade e testo** (nero). I colori si cambiano al passo 4.
- Titolo e sottotitolo si possono riscrivere; in basso a destra c'è l'attribuzione «(C) OpenStreetMap contributors», richiesta dalla licenza ODbL.
- Serve internet: la ricerca usa Nominatim, i dati Overpass. Se le quote non arrivano, la mappa esce senza curve di livello.

## Effetti

Nel passo 4, per qualsiasi disegno:

- **Effetto a mano**: le linee tremano appena, come disegnate a mano (0–3 mm).
- **Copia sfalsata**: lo stesso disegno ripassato da un'altra penna spostato di poco in X e Y, come una stampa fuori registro. È un gruppo in più, con la sua pausa di cambio penna.

I tagli con la lama non vengono toccati.

## Più colori, più penne

Ogni penna è un gruppo: nel file c'è una pausa prima di ciascuno per cambiare pennarello, e il foglio non si muove, quindi i colori combaciano.

- *Immagine*: con «Penne (colori)» da 2 a 6 Tratto divide l'immagine nei suoi colori principali (il bianco resta carta) e disegna ogni colore con lo stile scelto: tratteggio, contorni, linee a tratto, onde, spirale, linea continua o puntinato. Ogni colore si può cambiare con quello del pennarello che hai: le zone vanno alla penna di colore più vicino. «↺ Colori dall'immagine» torna ai colori ricavati dall'immagine. L'ordine è dal colore più chiaro al più scuro.
- *Generativo*: con «Penne (colori)» da 2 a 6 le linee si dividono tra le penne a fasce orizzontali, a fasce verticali, ad anelli dal centro, a caso o a turno. I colori si scelgono al passo 4.
- *SVG*: ogni colore del tratto è già una penna.
- *Tavola tecnica*: disegno e quote possono usare due penne.

Cambiando penna, inserisci la nuova con la stessa sporgenza della precedente.

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

È un progetto di Orca Slicer con il profilo ufficiale della stampante scelta (per la P1S: stampante *Bambu Lab P1S 0.4 nozzle*, processo *0.20mm Standard @BBL X1C*, filamento *Generic PLA*) e le modifiche del profilo UMTS:

| | |
|---|---|
| Stampante | Z‑offset dell'utensile, area esclusa (X1/P1: `0x0, 258x0, 258x55, 48x55, 48x258, 0x258`), retrazione 0,01 mm (sblocca lo Z‑hop), Z‑hop normale su ogni spostamento, niente wipe, start senza linea di spurgo (opzione) |
| Processo | strato 0,10 mm, larghezze 0,40 mm, 1 perimetro **Arachne**, niente riempimenti, gusci, brim, torre e timelapse con movimento |
| Filamento | 180 °C (evita l'errore di estrusione a freddo), flusso 0,01, piano 25 °C, ventole spente, nessun rallentamento per raffreddamento |

Ogni tratto è una striscia larga 0,40 mm e alta uno strato: Arachne la percorre con **una sola linea centrale**. Le direzioni del tratteggio stanno su strati diversi, così le linee che si incrociano non si fondono.

Gli strati:

1. **strato a vuoto** senza modulo: la testina sale alla quota compensata;
2. **pausa** `M400 U1`: monti UMTS con la prima penna;
3. le passate di ogni gruppo, con una pausa prima di ogni cambio penna (e, se vuoi, prima di ogni passata);
4. **pausa finale**: togli UMTS prima del G‑code di fine, poi interrompi (l'ultimo strato gira a vuoto).

## In stampa

- **Orca Slicer**, non Bambu Studio (non applica lo Z‑offset). Il file arriva alla stampante via LAN o con la scheda microSD: vedi [Modalità LAN](tratto-lan.md).
- Apri il 3MF e carica le impostazioni del progetto. L'avviso di G‑code modificato riguarda lo start senza linea di spurgo; quello di regioni sospese si ignora.
- Non usare «Centra» o «Disponi»: la posizione è quella del foglio.
- Lascia il filamento caricato. Nell'invio disattiva timelapse e calibrazione dinamica del flusso; sulle A1 anche il livellamento del piatto.
- **In caso di collisione spegni subito la stampante.** Mai finire la stampa con il modulo montato.

Le prime volte segui le fasi di prova dell'autore (solo base, set senza penna, taratura in tempo reale): sono nel passo 6.

## Lama e adesivi

- Con il modulo di taglio originale l'autore indica di partire dal profilo Stabilo e tarare Z a mano.
- Per i porta‑lama tipo Roland (corpo ~11,5 mm) serve il remix [Sistema di taglio per P1 X1](https://makerworld.com/models/3564112) di rostkuchen: il porta‑lama sta più in basso, lo Z‑offset va misurato.
- Materiale su supporto siliconato, fissato con nastro; lama che sporge appena più del materiale; 20–30 mm/s, 2 passate.
- Disegno e taglio usano la stessa posizione: tra i due file il foglio non si muove.

## Sviluppo

- Sorgenti in `tratto/src/`: `app.html` (interfaccia), `core.js` (algoritmi, mesh, 3MF), `tavola.js` (tavole tecniche), `i18n.js` e `i18n-en.json` (interfaccia in inglese), `font-futural.json` (font Hershey a tratto), `vendor/` (Clipper, libtess, fflate), `p1s-base.json` (profilo Orca risolto).
- `python3 tratto/src/build.py` scrive `server/public/tratto/index.html`; poi `npm run build:lite` in `tools/` aggiorna la Lite.
- `python3 tratto/src/mkbase.py <OrcaSlicer>/resources/profiles/BBL` rigenera il profilo da una versione nuova di Orca (oggi 2.5.1).
- Testi nuovi nell'interfaccia: scrivili in italiano in `app.html`, poi aggiungi l'inglese in `i18n-en.json` (chiave = testo italiano con i numeri sostituiti da `#`). Apri l'app con `?lang=en&i18n=misses` e leggi `TRATTO_I18N_MISSES` nella console per trovare quello che manca.
