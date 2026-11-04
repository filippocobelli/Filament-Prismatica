# Edizione Lite

FilamentBox senza server. È una pagina web che funziona da sola: il browser fa anche da "server" e salva i dati in locale. Include Prismatica.

## Tre modi per usarla

### 1. Dal PC, senza internet (consigliato per iniziare)

1. Scarica il repository: su GitHub **Code → Download ZIP**, poi estrai lo zip (la cartella si chiama `Filament-Prismatica-main`).
2. Apri la cartella `lite` e fai doppio clic su `index.html`. Usa Chrome, Edge o Firefox.
3. Fine: puoi aggiungere bobine, importare fatture e aprire Prismatica dal pulsante in basso.

Funziona anche senza connessione. Serve internet solo per la scansione con Claude e per la ricerca dei barcode online.

Per averla "come un programma", crea un collegamento sul desktop a `lite/index.html`.

### 2. Dal web, con GitHub Pages

Il repository contiene il workflow `.github/workflows/pages.yml`, che pubblica la cartella `lite/` a ogni modifica.

1. Su GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Vai in **Actions → Pubblica FilamentBox Lite → Run workflow** (oppure fai un push su `main`).
3. Dopo un minuto l'indirizzo compare in Settings → Pages: `https://<utente>.github.io/Filament-Prismatica/`.

Se fai un fork, Pages funziona gratis finché il fork è pubblico; su un repository privato serve un piano a pagamento.

### 3. Installata come app (PC, Android, iPhone)

Dalla versione su GitHub Pages:

- **Chrome / Edge su PC**: icona "Installa" nella barra degli indirizzi. Si apre in una finestra sua, con l'icona sul desktop, e funziona offline.
- **Android**: menu ⋮ → **Installa app**.
- **iPhone / iPad**: Safari → Condividi → **Aggiungi alla schermata Home**.

## Dove stanno i dati

- Bobine, scaffali, consumi e fatture importate sono salvati **nel browser** che usi (localStorage), con la chiave `filamentbox-db`.
- Ogni browser e ogni dispositivo ha i suoi dati. Il PC e il telefono **non** si sincronizzano da soli.
- Se cancelli i dati di navigazione del sito, cancelli anche l'inventario.

Per questo, fai ogni tanto un backup: **Settings → Backup dei dati → Esporta backup**. Con "Ripristina" carichi il file su un altro browser o dispositivo, oppure in un'edizione Smart o Full ([docs/backup.md](backup.md)).

## Cosa c'è e cosa no

C'è tutto l'inventario: libreria, scaffali, sigillata/aperta, consumi registrati a mano, statistiche, import da fattura Bambu Lab, scanner barcode, scansione etichette con Claude, file tag OpenTag3D da scrivere con il telefono e Prismatica.

Non ci sono Home Assistant, consumi automatici e lettore NFC fisico: servono un server sempre acceso, quindi sono nelle edizioni Smart e Full. La vista **AMS** resta, ma gli slot li assegni a mano. Servono a Prismatica per dirti quali filamenti sono già caricati quando usi il color mixing.

## Prismatica nella Lite

Si apre dal pulsante **Prismatica** in basso. Legge le bobine dallo stesso browser e si aggiorna da sola quando cambi qualcosa in FilamentBox, anche con le due pagine aperte in schede diverse. Funziona offline: three.js è incluso nel file. Guida completa: [prismatica.md](prismatica.md).

## Scansione etichette con Claude

Settings → **Claude AI** → incolla la chiave → Salva → Test. La chiave resta solo in quel browser. Dettagli e consigli di sicurezza: [claude-api.md](claude-api.md).

## Aggiornare la Lite

- **Da file**: scarica di nuovo il repository e sostituisci la cartella `lite`. I dati restano, perché sono nel browser e non nei file. Fai comunque un backup prima.
- **Da GitHub Pages**: si aggiorna da sola. Se resti su una versione vecchia, ricarica la pagina due volte (la prima scarica la nuova versione in cache).

Il numero di versione è in basso a destra e nel file `lite/edition.js`.
