# Backup e migrazione tra edizioni

**Settings → Backup dei dati** funziona uguale in tutte le edizioni.

- **Esporta backup** scarica `filamentbox-backup-AAAA-MM-GG.json` con bobine, posizioni, consumi e fatture importate.
- **Ripristina** carica un file di backup e **sostituisce** i dati attuali (prima chiede conferma).

Il backup **non** contiene token, chiavi API né configurazioni di Home Assistant.

## Passare da un'edizione all'altra

| Da → a | Come |
|---|---|
| Lite → Smart/Full | Esporta dalla Lite, installa il server, ripristina dal server |
| Smart/Full → Lite | Esporta dal server, apri la Lite, ripristina |
| Lite su un altro PC o telefono | Esporta, copia il file, ripristina sull'altro dispositivo |
| Smart ↔ Full | Niente da fare: cambia solo `FB_EDITION` |

Dopo un passaggio da Lite a server, associa le bobine agli slot dalla vista AMS: nella Lite gli slot erano assegnati a mano.

## Backup del server

Sulle edizioni Smart e Full puoi anche copiare i file della cartella del server: `db.json` (dati e token del webhook), `ha_config.json` e `claude_config.json`. Questi contengono segreti: tienili fuori da git e da cartelle condivise.
