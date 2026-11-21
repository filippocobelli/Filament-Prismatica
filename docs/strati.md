# Strati · lettere a colori in rilievo

*[English version](en/strati.md)*

Strati trasforma una parola in **lettere a colori in rilievo**: dentro ogni lettera c'è un'illustrazione, e ogni colore sta a un'altezza diversa. La stampante cambia filamento solo a quelle quote, quindi bastano pochi cambi anche con 4–5 colori, con l'AMS oppure a mano.

Versione 0.1. Si apre dal pulsante **Strati** di FilamentBox (edizioni Lite e Full) o da `strati/index.html`. Interfaccia in italiano e inglese.

## Come funziona

1. **Testo**: scrivi la parola (vai a capo per più righe) e scegli il carattere fra Luckiest Guy, Bangers, Anton, Bowlby One, Titan One e Arial Black. Poi scegli la forma:
   - **Lettere unite**: le lettere si sovrappongono e diventano una scritta sola. Il limite è il piatto: tutta la scritta deve starci. Con *Spaziatura* e *Interlinea* negative le lettere si toccano; *Ingrossa* le allarga e aiuta a farne un pezzo unico.
   - **Lettere separate**: ogni lettera è un pezzo a sé con un piatto tutto per lei, quindi può essere alta quasi quanto il piatto (fino a ≈ 240 mm sulle stampanti da 256 mm). Si appendono una accanto all'altra.
2. **Immagini**: caricane una o più (JPG, PNG, WebP).
   - *Una per lettera*: senza scelta vanno alle lettere nell'ordine di caricamento; per ogni lettera puoi scegliere l'immagine, lo zoom e lo spostamento per centrare il soggetto.
   - *Una per tutta la scritta*: l'immagine viene ritagliata dalle lettere (anche con le lettere separate, ognuna ne prende la sua parte).
   - Rendono meglio i disegni con pochi colori pieni e contorni netti (stile fumetto o adesivo). Senza immagini Strati mostra un disegno di esempio.
3. **Colori**: Strati trova da 2 a 6 colori nelle immagini. In cima alla lista c'è il colore più alto, in fondo il più basso; con ▲▼ cambi l'ordine. Se FilamentBox ha bobine, per ogni colore puoi scegliere un filamento e il colore diventa quello della bobina (i flessibili sono esclusi). Il **colore del corpo** è la base e i fianchi della lettera: di solito lo stesso del bordo in cima.
   - **Dettaglio minimo** toglie i puntini che un ugello da 0,4 mm non stampa bene.
   - **Bordo in cima** è la cornice più alta attorno a ogni lettera, anche dove due lettere si sovrappongono, nel colore più in alto.
4. **Spessori**: il *corpo* è la parte piena della lettera; ogni colore sta un *salto* più in alto del precedente. Con 0,6 mm (3 strati da 0,2 mm) il colore sotto non traspare.
5. **File**: scegli la stampante (X1 Carbon, P1S, P1P, A1, A1 mini) e il cambio colore:
   - **Automatico (AMS)**: il 3MF ha già i filamenti e i cambi per strato; in Bambu Studio o Orca li vedi sul cursore degli strati. Abbini ogni filamento allo slot dell'AMS e affetti.
   - **A mano (pause)**: per stampanti senza AMS. La stampa si ferma alle quote giuste; cambi la bobina dal display e riprendi.
   - Con le lettere unite scarichi un 3MF; con le lettere separate uno ZIP con un 3MF per lettera.
   - Il riepilogo mostra i filamenti con i grammi stimati e l'elenco dei cambi; i controlli dicono se un pezzo non sta sul piatto o se la scritta unita è in più pezzi staccati.

## Come è fatto il pezzo

Ogni lettera è una pila di lastre: il corpo da 0 al suo spessore, poi una lastra per colore, ciascuna grande quanto la zona dei pixel di quel colore *o di un colore più alto*. Così ogni colore si vede dall'alto alla sua quota, e ogni cambio di filamento avviene a una quota sola per tutto il piatto. È la stessa tecnica delle lettere che si vedono sui social, fatta in automatico: maschera della lettera, colori ridotti a pochi, mappa delle altezze nell'ordine scelto, estrusione.

La torre di spurgo è spenta: il filamento si scarica nello scivolo e la lettera può usare tutto il piatto. Si riaccende in Bambu Studio/Orca se preferisci.

## Consigli

- 4 colori (scuro, due medi, chiaro) bastano per quasi tutti i disegni a fumetto; il più scuro in basso e il più chiaro in alto è l'ordine che rende meglio.
- Un AMS tiene 4 bobine: con 5–6 colori servono due AMS, una bobina esterna o le pause.
- Le lettere separate grandi richiedono ore e decine di grammi per colore: il riepilogo dà una stima prima di stampare.

## Caratteri

Luckiest Guy (Apache 2.0), Bangers, Anton, Bowlby One e Titan One (SIL Open Font License 1.1), inclusi come sottoinsieme latino.
