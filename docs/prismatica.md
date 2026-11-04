# Prismatica

Prismatica trasforma un'immagine in una **wall art 3D a triangoli**: un telaio a incastro con centinaia di pezzi in rilievo, ognuno con un colore e una punta orientata, che insieme ricompongono l'immagine. Genera i file di stampa già divisi in **piatti numerati, uno per colore**, quindi l'AMS non serve.

Versione 1.7. È inclusa nelle edizioni **Full** e **Lite**. Si può usare anche da sola, senza inventario.

## Il flusso

1. **Immagine**: carica un JPG o PNG (anche trascinandolo). Viene ritagliata alle proporzioni dell'opera.
2. **Dimensioni e pezzi**: larghezza e altezza dell'opera finita in mm e numero di pezzi desiderato (oppure il lato del triangolo). Il reticolo è di triangoli equilateri; una cornice piena riempie i bordi.
3. **Colori**:
   - *Solo i miei filamenti*: Prismatica sceglie, tra le bobine disponibili, i colori che rendono meglio l'immagine. Filtri per materiale e residuo minimo. Puoi cambiare a mano il filamento di ogni colore.
   - *Liberi, presi dall'immagine*: i colori vengono estratti dall'immagine (k-means) e li modifichi con il selettore.
4. **Forma del pezzo**: Corno, Piramide, Cupola, Spillo, Pinna o Piatto. Altezza minima e massima, con l'altezza guidata da luminosità, distanza dal centro, colore, casuale o costante. Lo spostamento della punta inclina la forma.
5. **Orientamento delle punte**: vortice attorno a un centro (con torsione), lungo i contorni dell'immagine, verso le zone chiare, angolo fisso o casuale, più una variazione casuale.
6. **Stampa e telaio**: piano di stampa (A1 mini, Ender 3, MK4, X1/P1/A1, 300, 350), margini, distanza tra i pezzi, telaio a incastro con spessore, costole e gioco, colore del telaio, numero inciso sotto i pezzi, carta per la dima.

L'anteprima ha tre viste: **Opera** (3D finita), **Piatti** (ogni piatto sul piano di stampa) e **Colori 2D** (mappa con i numeri).

## Il pezzo

Ogni pezzo ha tre parti: un **tappo** che entra nel foro del telaio (con gli angoli smussati per l'incastro), una **base** che copre la cella e la **forma** in rilievo. Sotto il tappo è inciso il **numero** del pezzo, leggibile girandolo, se il triangolo è abbastanza grande (lato da circa 20 mm in su). Altrimenti vale la mappa dei piatti.

## Il pacchetto di stampa (.zip)

- `3MF/`: un file per piatto. Ogni pezzo è un oggetto separato chiamato `#numero`.
- `STL/`: gli stessi piatti in STL binario.
- `Dima_1a1_e_mappa_piatti.pdf`: riepilogo, mappa dei fogli, dima in scala 1:1 e mappa di ogni piatto.
- `assemblaggio.csv`: numero, colore, piatto, posizione e altezza di ogni pezzo.
- `LEGGIMI.txt`: istruzioni.

I piatti si chiamano per esempio `P03_Viola_2di4`: un piatto = un filamento. Il telaio è diviso in tasselli (`Telaio_TA1`, `TB2`…) che entrano nel piano di stampa e si incollano sulla dima.

## La dima per stampanti A4

La dima è vettoriale, in millimetri veri, divisa in fogli **A4** (oppure A3 o Letter), con l'orientamento che usa meno fogli.

- Ogni foglio si sovrappone di **10 mm** a quello a sinistra e a quello sopra.
- La **linea rossa TAGLIA** passa al centro dei **crocini di registro**: tagli lì e fai combaciare le mezze croci con quelle del foglio sotto.
- Una pagina **Mappa dei fogli** mostra come sono disposti (A1, A2, B1…) e ogni foglio ha una mini-mappa con la sua posizione.
- Due **barre da 50 mm** (orizzontale e verticale) per controllare la scala: stampa al 100%, "dimensioni effettive".
- Ogni cella riporta numero del pezzo e lettera del colore; c'è un'opzione **risparmio inchiostro** senza riempimenti.

## Color mixing (Bambu Studio 2.5.3+)

Per i colori che nessun filamento rende bene, Prismatica propone un **mix** di 2 o 3 filamenti tuoi (es. 3:2), che Bambu Studio stampa alternando gli strati.

- Ogni colore ha il suo switch **Mix Bambu**: lo accendi solo dove ti serve.
- Se il mix migliora molto il colore compare il consiglio, con la stima di **spurgo** (grammi) e **tempo** in più con AMS.
- Con lo switch acceso Prismatica ti dice **quali filamenti caricare nell'AMS** e in che rapporto, e nella Full se sono già caricati e in quale slot.
- Nel 3MF il colore del piatto è il risultato stimato del mix: in Bambu Studio crei il filamento misto (*Aggiungi filamento misto*) con il rapporto indicato e lo assegni al piatto.
- Su una stampante a ugello singolo con AMS ogni cambio comporta uno spurgo: per questo il mix è facoltativo, colore per colore.

## Prismatica e l'inventario

| | Inventario | Aggiornamento |
|---|---|---|
| **Full** | dal server (`/api/spools`) | in tempo reale (eventi dal server, consumi di Home Assistant compresi) |
| **Lite** | dal browser (stessi dati di FilamentBox Lite) | in tempo reale tra schede dello stesso browser |
| **Da sola** | nessuno: colori dall'immagine, oppure "Carica elenco JSON" | — |

Il file JSON accettato è un elenco di bobine con almeno il colore esadecimale; riconosce anche il formato di `/api/spools` e i backup di FilamentBox. Le bobine con stesso colore e materiale vengono sommate.

## Montaggio

1. Stampa la dima, unisci i fogli e incollala su un pannello rigido.
2. Stampa i tasselli del telaio e incollali sulla dima seguendo le etichette `T…`.
3. Stampa i piatti dei pezzi, un colore per volta.
4. Inserisci ogni pezzo nella cella con lo stesso numero. Se l'incastro è duro, aumenta il gioco e rigenera.

Consigli di stampa: strato 0,2 mm, 2-3 perimetri, riempimento 10-15%, nessun supporto.
