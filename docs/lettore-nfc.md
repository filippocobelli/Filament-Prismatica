# Lettore NFC fisico (edizioni Smart e Full)

Un piccolo lettore da mettere vicino alla stampante. Avvicini la bobina con il tag: FilamentBox la riconosce, e con un pulsante la assegni a uno slot dell'AMS. Il lettore sa anche scrivere i tag al posto del telefono.

Firmware: [`nfc-reader/FilamentBoxNFC/FilamentBoxNFC.ino`](../nfc-reader/FilamentBoxNFC/FilamentBoxNFC.ino), versione 1.1.

## Cosa fa

- **Legge i tag OpenTag3D** (NTAG213/215/216) scritti da FilamentBox o da altre app, e quelli che hanno solo l'UID.
- **Legge i tag RFID originali Bambu Lab** (Mifare Classic): materiale, tipo, colore, peso e temperature. Le chiavi di lettura si ricavano dall'UID del tag, come descritto dal [Bambu Research Group](https://github.com/Bambu-Research-Group/RFID-Tag-Guide). Una bobina Bambu nuova viene creata in libreria da sola.
- **Assegna lo slot AMS**: dopo una lettura riuscita hai 4 secondi per premere il pulsante 1, 2, 3 o 4 volte. La bobina viene associata a quello slot.
- **Scrive i tag**: dal dettaglio di una bobina in FilamentBox premi **📟 Scrivi via lettore fisico (PN532)** e avvicini un tag vuoto entro 2 minuti.
- **Heartbeat ogni 30 secondi**: in Settings → Lettore NFC fisico vedi se è collegato, il segnale WiFi e se il PN532 risponde.

## Hardware

| Componente | Note |
|---|---|
| Wemos **D1 Mini** (ESP8266) | Qualsiasi clone va bene |
| Modulo **PN532** | In modalità **SPI**: DIP switch **1 OFF, 2 ON** |
| Pulsante (facoltativo) | Per scegliere lo slot AMS dopo la lettura |
| Tag **NTAG215** adesivi | Uno per bobina, riutilizzabili |
| Alimentatore USB 5 V | Anche quello della stampante |

### Collegamenti

| PN532 | D1 Mini |
|---|---|
| VCC | 3V3 |
| GND | GND |
| SCK | D5 (GPIO14) |
| MISO | D6 (GPIO12) |
| MOSI | D7 (GPIO13) |
| SS | **D2 (GPIO4)** |

Non usare **D8** per SS: è un pin di avvio dell'ESP8266 e, se non è basso all'accensione, la scheda si blocca in un ciclo di riavvii.

**Pulsante**: un lato su **D1 (GPIO5)**, l'altro su **GND**. Non serve la resistenza, perché c'è il pull-up interno.

### LED della scheda

| Lampeggio | Significato |
|---|---|
| 3 lampi lenti | Operazione riuscita (lettura, scrittura, slot assegnato) |
| 6 lampi veloci | Errore (server non raggiungibile, tag non scrivibile…) |
| 2 lampi lunghi ogni 30 s | Il PN532 non risponde: controlla cavi e DIP switch |
| Un lampo breve | Pressione del pulsante contata |

## Installazione del firmware

1. **Arduino IDE** → Impostazioni → *URL aggiuntivi per il Gestore schede*: `https://arduino.esp8266.com/stable/package_esp8266com_index.json`. Poi Gestore schede → installa **esp8266**.
2. Scheda: **LOLIN(WEMOS) D1 R2 & mini**.
3. Librerie:
   - **PN532 di Elechouse**: scarica lo zip da [github.com/elechouse/PN532](https://github.com/elechouse/PN532), estrailo e copia le cartelle `PN532` e `PN532_SPI` (puoi copiare anche le altre) nella cartella `libraries` di Arduino (`Documenti/Arduino/libraries`). Non usare "Aggiungi libreria da .zip", perché lo zip contiene più librerie insieme.
   - **ArduinoJson** 6.x di Benoit Blanchon (Gestore librerie).
   - **Crypto** di Rhys Weatherley (Gestore librerie), che serve per i tag Bambu Lab.
4. Apri `FilamentBoxNFC.ino` e compila la sezione **CONFIGURA QUI** in alto:

   ```cpp
   const char* WIFI_SSID     = "NOME_RETE_WIFI";
   const char* WIFI_PASSWORD = "PASSWORD_WIFI";
   const String FILAMENTBOX_URL = "http://192.168.1.50:3025";   // IP del server FilamentBox
   const String WEBHOOK_TOKEN = "INCOLLA_QUI_IL_TOKEN";        // Settings → Home Assistant Webhook
   ```

   Usa l'indirizzo interno del server (IP e porta), non un indirizzo pubblico: il lettore parla in HTTP sulla rete di casa.
5. Carica sulla scheda e apri il Monitor seriale a **115200**. All'avvio vedi la versione, il firmware del PN532, le reti WiFi trovate e l'IP ottenuto.

Non pubblicare mai la tua copia dello sketch con password e token compilati.

### Se il WiFi cade

Il firmware forza la modalità 802.11g, disattiva il risparmio energetico e si riconnette ogni 15 secondi. Con alcune reti mesh (es. TP-Link Deco) l'ESP8266 può comunque perdere la connessione: nell'app del router disattiva **Fast Roaming** (ed eventualmente **Beamforming**).

Nel Monitor seriale, durante la connessione, i numeri tra parentesi sono lo stato del WiFi: `[1]` rete non trovata, `[4]` connessione fallita, `[6]` password errata, `[3]` connesso.

## Protocollo

Il lettore usa questi endpoint del server, con il token del webhook (`?token=…`):

| Endpoint | Quando | Contenuto |
|---|---|---|
| `POST /api/webhook/reader-heartbeat` | Ogni 30 s | `pn532_ok`, `ip`, `rssi`, `uptime_sec` |
| `POST /api/webhook/nfc-scan` | A ogni tag letto | `uid`, `format` (`opentag3d`, `bambu_native`, `ndef_other`, `uid_only`), `material`, `color_hex`, `color_name`, `brand`, `detailed_type`, `weight`, temperature |
| `PUT /api/spools/:id/assign-slot` | Dopo le pressioni del pulsante | `amsSlot` (1-4) |
| `GET /api/nfc-write-job` | Ogni 3 s | Se c'è un tag da scrivere riceve il payload OpenTag3D |
| `POST /api/nfc-write-job/complete` | Dopo la scrittura | `success`, `uid` |

Cosa fa il server con una lettura:

- **Tag già associato** a una bobina: aggiorna i dati della bobina con quelli del tag.
- **Tag Bambu Lab originale** non ancora associato: crea la bobina da solo.
- **Tag sconosciuto**: lo restituisce all'interfaccia, che ti propone di associarlo a una bobina.

## Senza lettore

In tutte le edizioni, Lite compresa, dal dettaglio della bobina puoi scaricare il file del tag **OpenTag3D** e scriverlo con il telefono (es. NFC Tools Pro → Write Dump).
