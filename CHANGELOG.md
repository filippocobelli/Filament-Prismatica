# Storico delle versioni

## FilamentBox 2.0.4 · Prismatica 1.7

Link Ko-fi per le donazioni: sezione «Supporta il progetto» in Settings, pulsante in Prismatica, pagina del progetto, README e pulsante Sponsor di GitHub (`.github/FUNDING.yml`).

## FilamentBox 2.0.3

Aggiunto il firmware del lettore NFC (`nfc-reader/`, v1.1: indirizzo del server in una sola costante, versione stampata all'avvio) e la guida completa con collegamenti, librerie e LED.

## FilamentBox 2.0.2

Pagina del progetto in italiano e inglese (`site/`, pubblicata con GitHub Pages insieme all'app in `/app/`), licenza MIT. Nessuna modifica al funzionamento.

## FilamentBox 2.0.1

Prima versione pubblica nel repository Filament-Prismatica: documentazione aggiornata, nessuna modifica al funzionamento.

## FilamentBox 2.0.0 · Prismatica 1.6

- **Tre edizioni**: Lite (senza server, dati nel browser, con Prismatica), Smart (server + Home Assistant + lettore NFC) e Full (tutto). Stessa interfaccia: `edition.js` dice cosa mostrare.
- **Lite**: API locale nel browser (`local-api.js`), funziona da file e offline, installabile come app da GitHub Pages; Prismatica con three.js incluso e aggiornamenti tra schede.
- **Claude AI in Settings**: chiave, modello e test in tutte le edizioni; sul server anche con `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`. Modello visibile accanto alla versione.
- **Backup e ripristino JSON** in tutte le edizioni.
- **Home Assistant**: entità configurabili da Settings; il YAML del webhook usa l'indirizzo reale del server e le tue entità; salvare la configurazione non cancella più il token se il campo è vuoto.
- Percorsi relativi, icone e manifest per l'installazione come app, scanner barcode ZXing incluso.
- Rimossi dal codice indirizzi IP e riferimenti personali.

## 1.7.0
Import di bobine in blocco da fattura Bambu Lab (PDF letto nel browser con pdf.js, colori da tabella Bambu), avviso per fatture già importate.

## 1.6.1
Prismatica 1.5: dima A4/A3/Letter con fascia di sovrapposizione e crocini, mappa dei fogli, risparmio inchiostro.

## 1.6.0
Prismatica servita su `/prismatica/`; eventi in tempo reale su `/api/events`.

## 1.5.1
Consumi: il server ricorda lo slot attivo durante la stampa; niente più bobina scelta a caso; webhook duplicati ignorati.

## 1.5.0
Vista Scaffali; bobine sigillate/aperte.

## 1.4.0
Lettore NFC fisico (heartbeat, coda di scrittura), sincronizzazione pesi da Home Assistant.

## Prismatica
- **1.7**: link Ko-fi.
- **1.6**: supporto edizione Lite, link a FilamentBox, testi senza riferimenti personali.
- **1.5**: dima con sovrapposizione e crocini, mappa dei fogli, carta A4/A3/Letter, risparmio inchiostro.
- **1.4**: integrazione con FilamentBox (inventario, eventi in tempo reale, slot AMS nei mix).
- **1.3**: color mixing Bambu per colore, con stima dello spurgo.
- **1.2**: inventario aggiornato in tempo reale.
- **1.1**: palette dai filamenti disponibili.
- **1.0**: prima versione.
