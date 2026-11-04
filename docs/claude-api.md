# Chiave API Claude: scansione intelligente delle etichette

Con una chiave API di Anthropic puoi fotografare l'etichetta di una bobina: Claude legge marca, prodotto, materiale, colore (con il codice esadecimale), peso e temperature, e compila il form. Prima di salvare controlli tu i dati.

La funzione è **facoltativa**: senza chiave FilamentBox funziona lo stesso (inserimento manuale, barcode, import da fattura).

## 1. Ottenere la chiave

1. Vai su [console.anthropic.com](https://console.anthropic.com) e accedi.
2. **Billing**: aggiungi del credito. L'API si paga a consumo ed è separata dall'abbonamento a Claude.ai.
3. **API Keys → Create Key**: dalle un nome (es. "FilamentBox") e copia la chiave `sk-ant-…`. Viene mostrata una volta sola.
4. Consigliato: in **Limits** imposta un tetto di spesa mensile basso.

Ogni scansione è una foto ridotta a 900 px più una risposta breve: costa una frazione di centesimo con Sonnet, ancora meno con Haiku.

## 2. Collegarla a FilamentBox

### Edizione Lite

1. **Settings → Claude AI**.
2. Incolla la chiave, scegli il modello, premi **Salva** e poi **Test**.

La chiave viene salvata **solo in quel browser** (localStorage) e la foto parte dal browser direttamente verso `api.anthropic.com`, senza passare da altri server. Su ogni dispositivo la inserisci di nuovo. Chi usa quel browser può usare la chiave: non salvarla su computer condivisi e tieni basso il tetto di spesa. **Rimuovi chiave** la cancella.

### Edizioni Smart e Full

Due modi, a scelta:

- **Variabile d'ambiente (consigliato)**: nello stack Docker imposta `ANTHROPIC_API_KEY=sk-ant-…` e riavvia. La chiave non passa mai dal browser e ha la precedenza su quella di Settings.
- **Da Settings**: Settings → Claude AI → incolla → Salva. Viene salvata sul server in `claude_config.json` (escluso da git).

In entrambi i casi la foto va dal browser al tuo server, che la inoltra ad Anthropic. Il telefono non vede mai la chiave.

## 3. Scegliere il modello

In Settings → Claude AI c'è il selettore del modello, e il modello attivo compare anche in basso a destra accanto alla versione. Nelle edizioni con server il predefinito si cambia anche con `ANTHROPIC_MODEL`.

| Modello | Quando |
|---|---|
| `claude-sonnet-5-5` | Predefinito: legge bene anche etichette piccole o storte |
| `claude-haiku-5-5` | Più economico e veloce, sufficiente per etichette nitide |
| `claude-opus-5-5` | Il più accurato, più costoso: utile solo per etichette difficili |
| `claude-sonnet-4-6` | Versione precedente, se un modello nuovo desse problemi |

Se in futuro un modello viene ritirato, scegline un altro dal menu: non serve toccare il codice.

## 4. Usarla

Pulsante **+** → **Scan barcode / label** → scheda **🤖 AI Label Scan** → scatta o scegli l'immagine → controlla i campi → **Usa questi dati**.

Consigli: inquadra solo l'etichetta, con buona luce e senza riflessi. Il colore esadecimale è una stima: confrontalo con la bobina vera.

## Problemi comuni

| Messaggio | Causa |
|---|---|
| *Chiave Claude non configurata* | Nessuna chiave salvata o variabile vuota |
| *invalid x-api-key* | Chiave copiata male o revocata |
| *credit balance is too low* | Credito esaurito su console.anthropic.com |
| *model not found* | Modello non disponibile per il tuo account: scegline un altro |
| Errore di rete nella Lite | Il browser è offline o blocca la richiesta ad `api.anthropic.com` |

## Privacy

Le foto vengono inviate ad Anthropic solo quando premi la scansione e servono solo a leggere l'etichetta. FilamentBox non le conserva.
