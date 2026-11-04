# Home Assistant (edizioni Smart e Full)

FilamentBox usa Home Assistant per tre cose: leggere gli slot AMS, sapere quale slot sta stampando e ricevere i grammi a fine stampa.

## Requisiti

- Integrazione **Bambu Lab** per Home Assistant (HACS → *ha-bambulab*), con la stampante e l'AMS configurati.
- Un **token di accesso a lungo termine**: in HA, Profilo → Sicurezza → Token di accesso a lungo termine → Crea.

## Entità

I nomi delle entità dipendono dal **nome della stampante** in HA e dalla **lingua** di HA. FilamentBox ne usa nove:

| Campo in Settings | Predefinito (stampante `p1s`, HA in italiano) | Cosa contiene |
|---|---|---|
| Slot AMS 1…4 | `sensor.p1s_ams_slot_1` … `_4` | Filamento nello slot; attributi `active`, `remain`, `type`, `color` |
| Bobina esterna | `sensor.p1s_bobina_esterna_bobina_esterna` | Supporto bobina esterno |
| Stato di stampa | `sensor.p1s_stato_di_stampa` | `running`, `pause`, `finish`… |
| Grammi della stampa | `sensor.p1s_grammatura_stampa` | Grammi previsti del lavoro |
| Metri della stampa | `sensor.p1s_lunghezza_stampa` | Metri previsti del lavoro |
| Nome del lavoro | `sensor.p1s_nome_attivita` | Nome del file in stampa |

Per trovare i tuoi: HA → **Strumenti per sviluppatori → Stati**, filtra per il nome della stampante. Con HA in un'altra lingua o una stampante con un altro nome, i nomi cambiano: inseriscili in **Settings → Connessione Home Assistant → Entità della stampante** e salva. I campi vuoti usano il predefinito.

## Webhook di fine stampa

In **Settings → Home Assistant Webhook** FilamentBox genera il blocco YAML già compilato con l'indirizzo del server, il token e le tue entità:

1. La parte `rest_command` va in `configuration.yaml`.
2. La parte `automation` diventa una nuova automazione (Impostazioni → Automazioni → Crea → Modifica in YAML).
3. Riavvia Home Assistant.

L'indirizzo nel YAML è quello con cui hai aperto FilamentBox. Home Assistant deve poterlo raggiungere: di solito è l'indirizzo interno del server (`http://<ip-del-server>:3025`). Se apri FilamentBox da un indirizzo pubblico, correggilo prima di incollare.

**Rigenera token** invalida il vecchio token del webhook: aggiorna anche il YAML in HA.

## Come viene scelta la bobina

1. Durante la stampa il server legge ogni 20 secondi lo stato e gli slot, e si annota lo slot più usato (anche la bobina esterna).
2. A fine stampa usa lo slot che HA indica come attivo; se nessuno lo è più, usa quello annotato.
3. Toglie i grammi dalla bobina associata a quello slot. Per le Bambu Lab originali usa invece il residuo in percentuale letto dall'AMS.
4. Se lo slot non ha una bobina associata, il consumo resta **da assegnare** in Statistics.

Il tracciamento mostra una stampa a un colore. Per le stampe multicolore il consumo viene attribuito allo slot più usato.
