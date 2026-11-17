# Tratto

*[Versione italiana](../tratto.md)*

Tratto turns a Bambu Lab **P1S** into a **pen plotter** or a **cutting plotter** with Falu's **UMTS** kit ([MakerWorld 2029113](https://makerworld.com/models/2029113)). From an image, an SVG or a generative drawing it builds a **3MF for Orca Slicer** with all the kit settings and the pauses to mount and remove the module.

Version 0.8. It is included in the **Full** and **Lite** editions (the **Tratto** button in the bottom bar). It also works on its own: it is a single HTML file, no server needed.

## Language

The interface is in Italian and English. Tratto follows the browser language; the **EN / IT** button in the header switches it, and `?lang=en` or `?lang=it` in the address forces it. The choice is saved in the browser. Group names, part names in the 3MF, file names and the text on technical drawings (title block, view names) follow the chosen language.

## The flow, in six steps

1. **Tool**: Stabilo point 88, POSCA, cutting blade or a custom pen. For each one: how to mount it, Z‑offset, speed, Z‑hop, acceleration and passes. Values are saved in the browser, tool by tool.
2. **Sheet**: a diagram of the plate with the UMTS profile's excluded area and the usable area (≈ 206 × 199 mm). The sheet goes **29 mm from the right wall** and **41 mm from the rear wall**. An X/Y correction shifts every file if the line lands in the wrong spot.
3. **Drawing**:
   - *Image*: cross‑hatching, contours (isolines), line art (skeleton), waves, spiral, single continuous line (TSP), stippling, sketch (short segments, DrawingBot style).
   - *Generative*: flow field, topography, ridges, Truchet, spirograph, harmonograph, moiré, maze, Schotter (a tribute to Georg Nees), rosette, tunnel, ribbons, bubbles, op‑art, cellular automata, tree, sunflower, echo (one line repeated at a constant spacing, open or as concentric outlines). The spirograph also has sliders for the wheel teeth and the pen distance. «🎲 Variation» changes the seed, «✨ Random» changes the style too.
   - *SVG*: each stroke colour becomes a group (one pen); solid shapes can be filled with hatching.
   - *Stickers ✂*: from the subject (a transparent PNG works best) a pen **drawing** file and a **cut** file with the outline and the chosen margin; or grids of circles and rectangles for labels.
   - *Map*: a city map from OpenStreetMap (see below).
   - *Technical drawing*: a dimensioned drawing with border, title block and, if you like, graph paper (see below).
   - *Calibration*: usable‑area frame with ticks every 10 mm, pressure test with a pause at every pass, dry run.
4. **Colours**: each group is a pen change, with name, colour and number of passes.
5. **File**: summary of layers and pauses, download of the 3MF (and of the SVG).
6. **Printing**: the sequence to follow and common problems.

## Maps

Search for a city or an address: Tratto downloads streets, railways, rivers and lakes from **OpenStreetMap** and elevation from the **Terrain Tiles** (Mapzen, AWS Open Data), then draws the map with title, country and coordinates underneath, poster style.

- **Area width** from 0.3 to 8 km; when you change it the data is downloaded again on its own.
- Layers: streets (main roads thicker, with two extra strokes alongside), service roads and footpaths, railways and trams, water, contour lines (interval in metres), buildings, border, title and coordinates.
- Three pens, each with its own pause: **contour lines** (orange), **water** (blue), **streets and text** (black). Colours can be changed in step 4.
- Title and subtitle can be rewritten; bottom right there is the «(C) OpenStreetMap contributors» attribution required by the ODbL licence.
- Internet is needed: search uses Nominatim, data comes from Overpass. If elevation doesn't arrive, the map comes out without contour lines.

## Effects

In step 4, for any drawing:

- **Hand‑drawn effect**: lines wobble slightly, as if drawn by hand (0–3 mm).
- **Offset copy**: the same drawing traced again by another pen, shifted a little in X and Y, like a misregistered print. It is one more group, with its own pen‑change pause.

Blade cuts are left untouched.

## More colours, more pens

Each pen is a group: the file has a pause before each one to change marker, and the sheet doesn't move, so the colours line up.

- *Image*: with «Pens (colours)» from 2 to 6 Tratto splits the image into its main colours (white stays paper) and draws each colour in the chosen style: hatching, contours, line art, waves, spiral, single line or stippling. Each colour can be changed to match the marker you have: areas go to the pen with the closest colour. «↺ Colours from the image» goes back to the colours taken from the image. The order is from the lightest colour to the darkest.
- *Generative*: with «Pens (colours)» from 2 to 6 the lines are split between the pens in horizontal bands, vertical bands, rings from the centre, at random or in turn. Colours are chosen in step 4.
- *SVG*: each stroke colour is already a pen.
- *Technical drawing*: drawing and dimensions can use two pens.

When changing pen, insert the new one with the same protrusion as the previous one.

## Technical drawing

Drawings in the style of a dimensioned engineering sheet, with a border with zone references, a title block (title, material, scale, author, date) and single‑stroke text (Hershey font) that stays readable with a 0.4 mm pen.

**From photo**
- Up to three photos: front, side, back. Best with the object upright on a plain background, shot from a distance with zoom (less perspective).
- Enter the **real height** of the object: every dimension is scaled from it.
- Tratto finds the outline, the inner details («Inner details» slider) and the dimensions: overall width and height plus the widths at characteristic points (shoulders, necks) and their heights from the base («Detail dimensions» slider).
- Measurements are estimates taken from the photo.

**From STL / 3MF**
- Load an STL (binary or ASCII) or a 3MF, including those saved by Bambu Studio and Orca.
- Front, top and side views laid out in first‑angle (European) or third‑angle (American) projection, plus the isometric view.
- Sharp edges (adjustable angle) and outlines; hidden parts dashed; real overall dimensions.
- The scale is picked automatically among standard values (1:1, 1:2, 2:1…) and written in the title block.

Groups: **Grid** (if enabled, drawn first), **Drawing** (object, border, title block) and **Dimensions**, with pauses to change pen. With «dimensions with a second pen» off, drawing and dimensions share one group.

## What is in the 3MF

It is an Orca Slicer project (printer *Bambu Lab P1S 0.4 nozzle*, process *0.20mm Standard @BBL X1C*, filament *Generic PLA*) with the UMTS profile changes:

| | |
|---|---|
| Printer | tool Z‑offset, excluded area `0x0, 258x0, 258x55, 48x55, 48x258, 0x258`, 0.01 mm retraction (unlocks Z‑hop), normal Z‑hop on every travel, no wipe, start without purge line (option) |
| Process | 0.10 mm layer, 0.40 mm widths, 1 **Arachne** wall, no infill, shells, brim, prime tower or timelapse moves |
| Filament | 180 °C (avoids the cold‑extrusion error), flow 0.01, bed 25 °C, fans off, no cooling slowdown |

Each stroke is a strip 0.40 mm wide and one layer high: Arachne follows it with **a single centre line**. Hatching directions sit on different layers, so crossing lines don't merge.

The layers:

1. **dry layer** without the module: the toolhead rises to the compensated height;
2. **pause** `M400 U1`: mount the UMTS with the first pen;
3. the passes of each group, with a pause before every pen change (and, if you want, before every pass);
4. **final pause**: remove the UMTS before the end G‑code, then stop (the last layer runs dry).

## Printing

- Printer in **LAN‑only mode** and **Orca Slicer**: Bambu Studio does not apply the Z compensation.
- Open the 3MF and load the project settings. The modified G‑code warning is about the start without purge line; the floating regions warning can be ignored.
- Don't use «Center» or «Arrange»: the position is the sheet's.
- Leave the filament loaded and turn off timelapse when sending.
- **If anything collides, switch the printer off at once.** Never finish the print with the module mounted.

The first few times follow the author's test stages (base only, set without pen, live calibration): they are in step 6.

## Blade and stickers

- With the original cutting module the author says to start from the Stabilo profile and calibrate Z by hand.
- Roland‑style blade holders (body ~11.5 mm) need rostkuchen's remix [Sistema di taglio per P1 X1](https://makerworld.com/models/3564112): the holder sits lower, so the Z‑offset must be measured.
- Material on a silicone backing, taped down; blade sticking out just past the material; 20–30 mm/s, 2 passes.
- Drawing and cut use the same position: the sheet must not move between the two files.

## Development

- Sources in `tratto/src/`: `app.html` (interface), `core.js` (algorithms, meshes, 3MF), `tavola.js` (technical drawings), `i18n.js` and `i18n-en.json` (English interface), `font-futural.json` (Hershey stroke font), `vendor/` (Clipper, libtess, fflate), `p1s-base.json` (resolved Orca profile).
- `python3 tratto/src/build.py` writes `server/public/tratto/index.html`; then `npm run build:lite` in `tools/` updates the Lite edition.
- `python3 tratto/src/mkbase.py <OrcaSlicer>/resources/profiles/BBL` regenerates the profile from a new Orca version (currently 2.5.1).
- New interface text: write it in Italian in `app.html`, then add the English to `i18n-en.json` (key = Italian text with numbers replaced by `#`). Open the app with `?lang=en&i18n=misses` and read `TRATTO_I18N_MISSES` in the console to find what is still missing.
