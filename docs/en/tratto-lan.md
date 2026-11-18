# Tratto · Do I need LAN mode?

*[Versione italiana](../tratto-lan.md)*

**Not necessarily.** Tratto builds a 3MF that you open and slice in **Orca Slicer**. The sliced file reaches the printer in one of two ways.

| | microSD card | Direct send over LAN |
|---|---|---|
| Printer changes | none | **LAN Only** mode + **Developer Mode** |
| First time | 2 minutes | 5–10 minutes |
| Every time after | take the card out and back in | one click from Orca |
| What you lose | nothing | Bambu Handy app and cloud, while it is on |

## 1 · microSD card (no changes)

1. Slice the plate in Orca.
2. Send button menu → **Export plate sliced file** (`.gcode.3mf`) and save it to the printer's microSD card.
3. Put the card in the printer and start the print from the screen (SD card → file).

The UMTS author verified the Z compensation with Orca in LAN-only mode. The file on the card is the same one Orca would send over LAN, but the first time print the **Area frame** without a pen and check that the toolhead stays at the right height.

## 2 · Direct send from Orca over LAN

Since the 2025 firmware (X1 from early 2025, P1 01.08.02.00 and A1 01.05.00.00 from June 2025) Bambu printers accept unofficial software such as Orca only in **Developer Mode**, which works only together with **LAN Only** mode.

On the printer:

1. Open the network settings (**WLAN**) on the screen.
2. Turn on **LAN Only** and confirm.
3. In the same menu turn on **Developer Mode**.
4. Write down the **IP address** and **access code** shown on the page.

In Orca Slicer:

1. Open the **Device** tab and add the printer with IP and access code.
2. If Orca cannot find it, use the printer's serial number as its name.
3. Slice and press **Print plate**: the file goes straight to the printer.

### What changes while it is on

- No **Bambu Handy** app, remote printing or Bambu cloud services.
- **Home Assistant** with the Bambu Lab integration keeps working, but in local mode (IP, serial number and access code). If the integration uses the cloud today, it must be reconfigured, and with it the sensors FilamentBox uses.
- Switch the same two toggles off to go back.

## Our advice

To try Tratto, use the **microSD card**: nothing changes on the printer. Move to LAN if you plot often and moving the card gets annoying, knowing you lose the app and the cloud while it is on.
