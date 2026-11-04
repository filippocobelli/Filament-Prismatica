# Filament-Prismatica

**FilamentBox**, l'inventario dei filamenti per la stampa 3D, con **Prismatica**, il generatore di wall art 3D a triangoli che usa i filamenti che hai davvero.

Versione **2.0.2** · Prismatica **1.6**

FilamentBox esiste in tre edizioni. L'interfaccia è la stessa: cambia solo cosa c'è dietro.

| | **Lite** | **Smart** | **Full** |
|---|---|---|---|
| Serve un server | No | Sì (Docker) | Sì (Docker) |
| Dove gira | Browser su PC, tablet o telefono, anche offline | Server di casa (NAS, mini PC, Raspberry Pi) | Server di casa |
| Dove stanno i dati | Nel browser (localStorage) | `db.json` sul server | `db.json` sul server |
| Libreria bobine, scaffali, sigillata/aperta | ✅ | ✅ | ✅ |
| Import da fattura Bambu Lab (PDF) | ✅ | ✅ | ✅ |
| Scanner barcode | ✅ | ✅ | ✅ |
| Scansione etichetta con Claude AI | ✅ chiave nel browser | ✅ chiave sul server | ✅ chiave sul server |
| Slot AMS | Assegnati a mano | Letti da Home Assistant | Letti da Home Assistant |
| Consumi automatici a fine stampa | — (si registrano a mano) | ✅ webhook Home Assistant | ✅ webhook Home Assistant |
| Lettore NFC fisico (D1 Mini + PN532) | — | ✅ | ✅ |
| File tag OpenTag3D da scrivere col telefono | ✅ | ✅ | ✅ |
| Prismatica | ✅ | — | ✅ |
| Più dispositivi vedono gli stessi dati | No (backup/ripristino manuale) | ✅ | ✅ |

## Quale scegliere

- **Lite**: vuoi solo l'inventario e Prismatica, senza installare niente. Apri `lite/index.html` dallo zip del repository oppure la versione online su GitHub Pages (`https://<utente>.github.io/Filament-Prismatica/app/`). → [docs/edizione-lite.md](docs/edizione-lite.md)
- **Smart**: hai Home Assistant con una stampante Bambu Lab e vuoi che i consumi si scalino da soli, con il lettore NFC vicino all'AMS. → [docs/edizione-smart.md](docs/edizione-smart.md)
- **Full**: come Smart, più Prismatica collegata all'inventario in tempo reale. → [docs/edizione-full.md](docs/edizione-full.md)

## Guide

- [Edizione Lite](docs/edizione-lite.md): uso dal web, da PC senza internet, installazione come app, backup
- [Edizione Smart](docs/edizione-smart.md): installazione con Docker, Home Assistant, lettore NFC
- [Edizione Full](docs/edizione-full.md): Smart + Prismatica
- [Come funziona FilamentBox](docs/funzionamento.md): bobine, scaffali, AMS, consumi, fatture, statistiche
- [Prismatica](docs/prismatica.md): dall'immagine ai piatti di stampa numerati
- [Chiave API Claude](docs/claude-api.md): scansione intelligente delle etichette in tutte le edizioni
- [Home Assistant](docs/home-assistant.md): entità, webhook, automazione
- [Lettore NFC](docs/lettore-nfc.md): hardware e protocollo
- [Backup e migrazione tra edizioni](docs/backup.md)
- [Storico delle versioni](CHANGELOG.md)

## Struttura del repository

```
server/            edizioni Smart e Full (Node.js + Express, un solo file server.js)
  public/          interfaccia web, Prismatica, librerie (pdf.js, ZXing)
  docker-compose.full.yml / docker-compose.smart.yml
lite/              edizione Lite pronta all'uso (generata, non modificarla a mano)
site/              pagina del progetto (italiano e inglese) pubblicata con GitHub Pages
prismatica/src/    sorgenti di Prismatica (app.html + core.js)
tools/             build-lite.mjs: rigenera lite/ da server/public
docs/              guide
```

Per modificare FilamentBox si lavora su `server/public/`; poi `cd tools && npm install && npm run build:lite` rigenera l'edizione Lite. Prismatica si modifica in `prismatica/src/` e si ricompila con `python3 prismatica/src/build.py`.

## Dati personali

Nel repository non ci sono dati personali: niente inventario, token, chiavi, indirizzi IP o nomi di rete. I file con dati e segreti (`db.json`, `ha_config.json`, `claude_config.json`) restano solo sul tuo server e sono esclusi da `.gitignore`.

## Licenza

MIT, vedi [LICENSE](LICENSE).

## Componenti di terze parti

- [pdf.js](https://github.com/mozilla/pdf.js) (Apache 2.0): lettura delle fatture PDF
- [ZXing](https://github.com/zxing-js/browser) (Apache 2.0): scanner barcode
- [three.js](https://threejs.org) (MIT): anteprima 3D di Prismatica
- Tabella colori Bambu Lab ricavata dal database pubblico BambuMan
