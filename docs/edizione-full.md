# Edizione Full

Tutto insieme: l'edizione [Smart](edizione-smart.md) (server, Home Assistant, lettore NFC) più **Prismatica**, collegata all'inventario in tempo reale.

## Installazione

È identica alla Smart, con due differenze:

- usa `server/docker-compose.full.yml`, oppure imposta `FB_EDITION=full` (è anche il valore predefinito se la variabile manca);
- nei log compare `FilamentBox v2.0.4 (full) in ascolto sulla porta 3025 · Prismatica su /prismatica/`.

Segui la guida della [Smart](edizione-smart.md) per Docker, Home Assistant, lettore NFC e Claude.

## Prismatica collegata all'inventario

Si apre dal pulsante **Prismatica** nella barra in basso, oppure da `http://<server>:3025/prismatica/`.

- Legge le bobine da `/api/spools` e mostra solo i filamenti disponibili (esclude le bobine esaurite e quelle sotto il residuo minimo che scegli).
- Si aggiorna **in tempo reale**: il server avvisa Prismatica con un canale di eventi (`/api/events`) a ogni consumo registrato da Home Assistant, a ogni bobina aggiunta e a ogni cambio di slot. Se il canale cade, Prismatica rilegge comunque l'inventario ogni 15 secondi.
- Per ogni colore dell'opera mostra i grammi necessari e quelli che hai, in arancione se non bastano.
- Nel color mixing ti dice se un filamento è **già nell'AMS** e in quale slot, perché lo sa da Home Assistant.

Funzionamento completo: [prismatica.md](prismatica.md).

## Passare da Smart a Full (e viceversa)

Cambia `FB_EDITION` nello stack e riavvialo. I dati non cambiano.
