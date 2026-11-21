# Strati · colour relief lettering

*[Versione italiana](../strati.md)*

Strati turns a word into **colour relief lettering**: every letter holds an illustration, and every colour sits at its own height. The printer changes filament only at those heights, so a few changes are enough even with 4–5 colours, with an AMS or by hand.

Version 0.1. It opens from the **Strati** button in FilamentBox (Lite and Full editions) or from `strati/index.html`. Interface in English and Italian.

## How it works

1. **Text**: type the word (new line for more rows) and pick the typeface: Luckiest Guy, Bangers, Anton, Bowlby One, Titan One or Arial Black. Then pick the shape:
   - **Joined letters**: letters overlap and become one sign. The bed is the limit: the whole sign must fit. Negative *Spacing* and *Line gap* make letters touch; *Thicken* widens them and helps make a single piece.
   - **Separate letters**: each letter is its own piece with a whole bed to itself, so it can be almost as tall as the bed (up to ≈ 240 mm on 256 mm printers). You hang them side by side.
2. **Images**: load one or more (JPG, PNG, WebP).
   - *One per letter*: with no choice they go to the letters in loading order; for each letter you can pick the image, zoom and offset to centre the subject.
   - *One for the whole text*: the image is cut out by the letters (with separate letters too, each takes its own part).
   - Drawings with few flat colours and crisp outlines (comic or sticker style) work best. Without images Strati shows a sample drawing.
3. **Colours**: Strati finds 2 to 6 colours in the images. The top of the list is the highest colour, the bottom the lowest; ▲▼ change the order. If FilamentBox has spools, you can pick a filament for each colour and the colour becomes the spool's (flexible filaments are excluded). The **body colour** is the base and sides of the letter: usually the same as the top rim.
   - **Smallest detail** removes specks a 0.4 mm nozzle cannot print well.
   - **Top rim** is the tallest frame around every letter, also where two letters overlap, in the highest colour.
4. **Heights**: the *body* is the solid part of the letter; each colour sits one *step* above the previous one. At 0.6 mm (three 0.2 mm layers) the colour below does not show through.
5. **File**: pick the printer (X1 Carbon, P1S, P1P, A1, A1 mini) and the colour change:
   - **Automatic (AMS)**: the 3MF already holds the filaments and the per-layer changes; in Bambu Studio or Orca you see them on the layer slider. Match each filament to its AMS slot and slice.
   - **By hand (pauses)**: for printers without an AMS. The print pauses at the right heights; swap the spool from the screen and resume.
   - Joined letters give one 3MF; separate letters give a ZIP with one 3MF per letter.
   - The summary lists the filaments with estimated grams and the changes; the checks tell you if a piece does not fit the bed or if a joined sign is in several separate parts.

## How the piece is built

Each letter is a stack of slabs: the body from 0 to its thickness, then one slab per colour, each covering the pixels of that colour *or of any higher colour*. So every colour shows from above at its height, and each filament change happens at a single height for the whole plate. It is the technique behind the letters you see on social media, automated: letter mask, colours reduced to a few, height map in the chosen order, extrusion.

The prime tower is off: filament is purged into the chute and the letter can use the whole bed. Turn it back on in Bambu Studio/Orca if you prefer.

## Tips

- 4 colours (dark, two mid tones, light) are enough for most comic drawings; darkest at the bottom and lightest on top works best.
- An AMS holds 4 spools: with 5–6 colours you need two AMS units, an external spool or pauses.
- Big separate letters take hours and tens of grams per colour: the summary gives an estimate before printing.

## Typefaces

Luckiest Guy (Apache 2.0), Bangers, Anton, Bowlby One and Titan One (SIL Open Font License 1.1), included as a Latin subset.
