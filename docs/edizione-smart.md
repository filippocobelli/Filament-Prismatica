# Edizione Smart

FilamentBox su un server di casa, collegato a Home Assistant e al lettore NFC fisico. Non include Prismatica (se la vuoi, usa la [Full](edizione-full.md): cambia una sola variabile).

## Cosa serve

- Un computer sempre acceso con Docker: NAS, mini PC, Proxmox, Raspberry Pi 4/5.
- Home Assistant con l'integrazione **Bambu Lab** (HACS → *ha-bambulab*) e la stampante configurata.
- Facoltativo: lettore NFC D1 Mini + PN532 ([lettore-nfc.md](lettore-nfc.md)).
- Facoltativo: chiave API Claude per la scansione delle etichette ([claude-api.md](claude-api.md)).

## Installazione con Docker (Portainer o docker compose)

1. Copia **il contenuto** della cartella `server/` in una cartella del server, per esempio `/opt/filamentbox`. Devono esserci `server.js`, `package.json` e `public/`.
2. Crea lo stack con `server/docker-compose.smart.yml`. In Portainer: **Stacks → Add stack → Web editor**, incolla il file e controlla il percorso del volume.
3. Avvia lo stack. Al primo avvio il container installa Express e crea `db.json`.
4. Controlla i log: deve comparire `FilamentBox v2.0.1 (smart) in ascolto sulla porta 3025`.
5. Apri `http://<indirizzo-del-server>:3025`.

Senza Docker: `cd server && npm install && FB_EDITION=smart node server.js` (serve Node.js 20 o più recente).

### Variabili d'ambiente

| Variabile | Valore | A cosa serve |
|---|---|---|
| `FB_EDITION` | `smart` | Edizione Smart (senza Prismatica). `full` o assente = Full |
| `PORT` | `3025` | Porta del server |
| `ANTHROPIC_API_KEY` | `sk-ant-…` | Chiave Claude (facoltativa, si può inserire anche da Settings) |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Modello predefinito (si cambia anche da Settings) |

### File creati sul server (non vanno su git)

| File | Contenuto |
|---|---|
| `db.json` | Bobine, posizioni, consumi, fatture importate, token del webhook |
| `ha_config.json` | URL e token di Home Assistant, nomi delle entità |
| `claude_config.json` | Chiave e modello Claude, se inseriti da Settings |

Sono esclusi da `.gitignore`. Fai il backup di questi tre file, oppure usa Settings → Backup dei dati.

## Configurazione

1. **Settings → Connessione Home Assistant**: URL (es. `http://homeassistant.local:8123`) e un *token di accesso a lungo termine* (in HA: Profilo → Sicurezza → Token di accesso a lungo termine). Salva e premi **Test**.
2. **Entità della stampante**: apri la sezione sotto il test e controlla i nomi. Quelli predefiniti valgono per una stampante chiamata `p1s` con Home Assistant in italiano. Guida: [home-assistant.md](home-assistant.md).
3. **Home Assistant Webhook**: copia il blocco YAML generato. Contiene già l'indirizzo del server, il token e le tue entità. Incollalo in HA (`configuration.yaml` + automazione) e riavvia HA.
4. **Vista AMS → associa le bobine agli slot**: i consumi vengono scalati solo dalle bobine associate a uno slot.
5. Facoltativo: **Settings → Claude AI** per la scansione delle etichette.
6. Facoltativo: lettore NFC, che si configura nel firmware con l'indirizzo del server e il token del webhook.

## Come lavora con Home Assistant

- Ogni 20 secondi, mentre la stampante lavora, il server legge da HA quale slot AMS è attivo e se lo annota.
- A fine stampa HA chiama il webhook con i grammi usati. Il server li toglie dalla bobina dello slot che ha visto attivo.
- Le bobine **Bambu Lab originali** usano la percentuale residua letta dal tag RFID dell'AMS, più precisa. Le altre usano la sottrazione dei grammi.
- Se lo slot resta sconosciuto, il consumo finisce tra i log **da assegnare** in Statistics e lo attribuisci tu con un tocco.
- Se lo stesso webhook arriva due volte entro 60 secondi, il secondo viene ignorato.
- **Sincronizza pesi reali da HA** (vista AMS) riallinea le bobine Bambu Lab ai valori dell'AMS.

## Accesso da fuori casa

FilamentBox non ha un login proprio. Non esporlo su internet aprendo porte sul router: usa una VPN (Tailscale, WireGuard) o un tunnel con autenticazione (es. Cloudflare Tunnel + Cloudflare Access).

## Aggiornare

Sostituisci `server.js` e la cartella `public/` con quelli nuovi del repository e riavvia lo stack. `db.json`, `ha_config.json` e `claude_config.json` restano.

**Se arrivi dalla 1.x**: la 2.0 legge il database esistente senza modifiche. Le entità di Home Assistant hanno gli stessi nomi predefiniti di prima, quindi il tracciamento continua a funzionare. Il blocco YAML del webhook ora usa l'indirizzo con cui apri FilamentBox: se lo apri da un indirizzo pubblico (tunnel), sostituiscilo con quello interno del server prima di incollarlo in HA.
