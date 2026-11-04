# Come funziona FilamentBox

Quello che segue vale per tutte le edizioni, salvo dove è indicato.

## Home: la libreria delle bobine

- Le bobine sono raggruppate per materiale (PLA, PETG, ABS, TPU…), con filtri e ricerca per nome, marca o colore.
- Ogni bobina mostra il residuo in grammi e una barra. Lo **stato** si calcola da solo: *disponibile*, *in esaurimento* (sotto il 15% del peso totale) o *vuota*.
- Toccando una bobina apri il dettaglio: modifica, consumo a mano, sigillata/aperta, slot AMS, tag NFC.

## Aggiungere bobine (pulsante +)

- **Manuale**: marca, nome, materiale, colore (nome e tinta), peso totale e residuo, temperature, posizione, sigillata.
- **Barcode**: inquadri il codice a barre della confezione con la fotocamera. FilamentBox cerca il prodotto online (UPCitemdb, Open Food Facts) e prova a riconoscere materiale, colore e peso dal titolo. Con i filamenti non sempre trova qualcosa.
- **Etichetta con Claude AI**: fotografi l'etichetta e Claude compila marca, prodotto, materiale, colore con codice esadecimale, peso e temperature. Prima di salvare controlli e correggi. Serve una chiave API ([claude-api.md](claude-api.md)).
- **Import da fattura**: carichi il PDF di una fattura del Bambu Lab Store. FilamentBox legge ogni riga (prodotto, colore, quantità, prezzo, SKU) e crea una bobina per pezzo. Prima di confermare puoi togliere righe, cambiare quantità e colori, scegliere la posizione e segnarle come sigillate. Se carichi due volte la stessa fattura ti avvisa. Il PDF viene letto nel browser e non viene salvato. Per ora sono riconosciute solo le fatture Bambu Lab.

## Scaffali

Ogni posizione (box, scaffale, cassetto) è disegnata come uno scaffale con le bobine viste di lato: l'altezza del filamento indica quanto ne resta. Con la matita imposti nome, capienza e aspetto (Box, Legno, Ripiano). In testa vedi quante bobine sono sigillate e aperte e se la posizione è piena.

**Sigillata / aperta**: le bobine nuove si possono segnare come sigillate. Diventano aperte da sole al primo consumo o quando le carichi nell'AMS.

## AMS

- **Smart e Full**: la vista mostra i 4 slot letti da Home Assistant (colore, tipo, residuo dell'AMS). Tocchi uno slot per associargli la bobina della libreria. Il consumo a fine stampa va alla bobina associata allo slot usato.
- **Lite**: gli slot li assegni a mano. Non servono per i consumi, ma Prismatica li usa per dirti cosa è già caricato.

## Consumi

- **A mano** (tutte le edizioni): dettaglio bobina → *Log print manually* → grammi e nome della stampa.
- **Automatici** (Smart e Full): a fine stampa Home Assistant chiama il webhook con i grammi; FilamentBox li toglie dalla bobina dello slot che era attivo ([home-assistant.md](home-assistant.md)). I consumi senza slot noto finiscono in Statistics come **da assegnare**.

## Statistiche

Peso totale disponibile, bobine da riordinare, ripartizione per materiale e ultime stampe, con la possibilità di assegnare a una bobina i consumi rimasti senza slot.

## Tag NFC

- **File OpenTag3D** (tutte le edizioni): dal dettaglio bobina scarichi un file `.bin` nel formato aperto OpenTag3D e lo scrivi su un tag NTAG215 con il telefono (es. NFC Tools Pro → Write Dump).
- **Lettore fisico** (Smart e Full): avvicinando una bobina col tag al lettore D1 Mini + PN532, FilamentBox la riconosce; i tag Bambu Lab originali creano la bobina da soli. Il lettore può anche scrivere i tag al posto del telefono ([lettore-nfc.md](lettore-nfc.md)).

## Settings

| Sezione | Lite | Smart | Full |
|---|---|---|---|
| Claude AI (chiave, modello, test) | ✅ | ✅ | ✅ |
| Backup dei dati | ✅ | ✅ | ✅ |
| Connessione e entità Home Assistant | — | ✅ | ✅ |
| AMS Sync da Home Assistant | — | ✅ | ✅ |
| Stato del lettore NFC | — | ✅ | ✅ |
| Webhook e YAML per Home Assistant | — | ✅ | ✅ |

In basso a destra trovi sempre versione, edizione e modello Claude in uso.
