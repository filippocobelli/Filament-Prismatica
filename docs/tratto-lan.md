# Tratto · Serve la modalità LAN?

*[English version](en/tratto-lan.md)*

**Non per forza.** Tratto crea un 3MF che apri in **Orca Slicer**, dove lo affetti. Il file affettato arriva alla stampante in uno di due modi.

| | Scheda microSD | Invio diretto in LAN |
|---|---|---|
| Modifiche alla stampante | nessuna | modalità **Solo LAN** + **Modalità sviluppatore** |
| Tempo la prima volta | 2 minuti | 5–10 minuti |
| Tempo le volte dopo | togli e rimetti la scheda | un clic da Orca |
| Cosa perdi | niente | app Bambu Handy e cloud, finché è attiva |

## 1 · Scheda microSD (nessuna modifica)

1. In Orca affetta il piatto.
2. Menu del pulsante di invio → **Esporta il file G‑code della piastra** (`.gcode.3mf`) e salvalo sulla scheda microSD della stampante.
3. Inserisci la scheda nella stampante e avvia la stampa dal display (scheda SD → file).

L'autore di UMTS ha verificato la compensazione Z con Orca in modalità solo LAN. Il file sulla scheda è lo stesso che Orca invierebbe in LAN, ma la prima volta stampa la **Cornice area** senza penna e controlla che la testina resti alla quota giusta.

## 2 · Invio diretto da Orca in LAN

Dai firmware del 2025 (X1 dall’inizio del 2025, P1 01.08.02.00 e A1 01.05.00.00 da giugno 2025) le stampanti Bambu accettano programmi non ufficiali come Orca solo in **Modalità sviluppatore**, che funziona soltanto insieme alla modalità **Solo LAN**.

Sulla stampante:

1. Apri le impostazioni di rete (**WLAN**) dal display.
2. Attiva **Solo LAN** (LAN Only) e conferma.
3. Nello stesso menu attiva **Modalità sviluppatore** (Developer Mode).
4. Annota **indirizzo IP** e **codice di accesso** mostrati nella pagina.

In Orca Slicer:

1. Apri la scheda **Dispositivo** e aggiungi la stampante con IP e codice di accesso.
2. Se Orca non la trova, usa come nome della stampante il suo numero di serie.
3. Affetta e premi **Stampa piatto**: il file parte direttamente.

### Cosa cambia finché è attiva

- Niente app **Bambu Handy**, stampa da remoto e servizi cloud di Bambu.
- **Home Assistant** con l'integrazione Bambu Lab continua a funzionare, ma in modalità locale (IP, numero di serie e codice di accesso). Se oggi l'integrazione passa dal cloud, va riconfigurata, e con lei i sensori che usa FilamentBox.
- Si torna indietro spegnendo gli stessi due interruttori.

## Il consiglio

Per provare Tratto usa la **scheda microSD**: non tocchi niente. Passa alla LAN se plotti spesso e ti pesa spostare la scheda, sapendo che perdi l'app e il cloud finché resta attiva.
