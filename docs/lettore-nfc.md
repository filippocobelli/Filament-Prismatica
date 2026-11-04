# Lettore NFC fisico (edizioni Smart e Full)

Un piccolo lettore da mettere vicino alla stampante: avvicini la bobina col tag e FilamentBox la riconosce. Può anche scrivere i tag al posto del telefono.

## Hardware

| Componente | Note |
|---|---|
| Wemos **D1 Mini** (ESP8266) | Qualsiasi clone va bene |
| Modulo **PN532** | Collegato in **SPI**: DIP switch **1 OFF, 2 ON** |
| Tag **NTAG215** adesivi | Uno per bobina, riutilizzabili |
| Alimentatore USB 5 V | Anche quello della stampante |

## Firmware

Lo sketch Arduino `FilamentBoxNFC.ino` non è ancora nel repository. Prima di aggiungerlo vanno tolti la password del WiFi e il token: nel file pubblicato saranno solo segnaposto da compilare.

Nel firmware si configurano: nome e password della rete WiFi, indirizzo del server FilamentBox (`http://<ip-del-server>:3025`) e token del webhook (Settings → Home Assistant Webhook).

Con le reti mesh (es. TP-Link Deco) l'ESP8266 può perdere la connessione: il firmware forza la modalità 802.11g e si riconnette da solo. Se non basta, disattiva il *Fast Roaming* nell'app del router.

## Protocollo

Il lettore usa tre endpoint del server, tutti con il token del webhook (`?token=…` oppure header `X-FilamentBox-Token`):

| Endpoint | Quando | Contenuto |
|---|---|---|
| `POST /api/webhook/reader-heartbeat` | Ogni 30 s | `pn532_ok`, `ip`, `rssi`, `uptime_sec` |
| `POST /api/webhook/nfc-scan` | A ogni tag letto | `uid`, `format` (`opentag3d`, `bambu_native`, `uid_only`…), `material`, `color_hex`, `color_name`, `brand`, `weight`, temperature |
| `GET /api/nfc-write-job` → `POST /api/nfc-write-job/complete` | Ogni pochi secondi | Se c'è un tag da scrivere riceve il payload OpenTag3D e conferma l'esito con `success` e `uid` |

Cosa fa il server con una lettura:

- **Tag già associato** a una bobina: aggiorna i dati della bobina con quelli del tag.
- **Tag Bambu Lab originale** non ancora associato: crea la bobina da solo.
- **Tag sconosciuto**: lo restituisce all'interfaccia, che ti propone di associarlo a una bobina.

In Settings → **Lettore NFC fisico** vedi se il lettore è collegato, l'ultimo contatto, il segnale WiFi e lo stato del PN532.

## Senza lettore

In tutte le edizioni, Lite compresa, dal dettaglio della bobina puoi scaricare il file del tag **OpenTag3D** e scriverlo con il telefono (es. NFC Tools Pro → Write Dump).
