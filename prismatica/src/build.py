# Prismatica — unisce core.js e il catalogo colori Bambu Lab dentro app.html e scrive il file pronto per FilamentBox.
# Uso: python3 prismatica/src/build.py   (dalla radice del repository)
import os, json
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.join(here, '..', '..')
core = open(os.path.join(here, 'core.js'), encoding='utf-8').read()
app = open(os.path.join(here, 'app.html'), encoding='utf-8').read()

# Catalogo per «Libreria completa»: codice prodotto Bambu Lab -> (materiale, finitura).
# Esclusi i supporti (S..), i multicolore (A05), i traslucidi (A17, G01) e i fosforescenti (A12):
# nella wall art il colore stampato non corrisponde al codice esadecimale.
FAMILIES = {
    'A00': ('PLA', 'PLA Basic'), 'A01': ('PLA', 'PLA Matte'), 'A02': ('PLA', 'PLA Metal'), 'A06': ('PLA', 'PLA Silk+'),
    'A07': ('PLA', 'PLA Marble'), 'A08': ('PLA', 'PLA Sparkle'), 'A09': ('PLA', 'PLA Tough'), 'A10': ('PLA', 'PLA Tough+'),
    'A11': ('PLA', 'PLA Aero'), 'A15': ('PLA', 'PLA Galaxy'), 'A16': ('PLA', 'PLA Wood'),
    'A18': ('PLA', 'PLA Lite'), 'A50': ('PLA', 'PLA-CF'),
    'B00': ('ABS', 'ABS'), 'B01': ('ASA', 'ASA'), 'B02': ('ASA', 'ASA Aero'), 'B50': ('ABS', 'ABS-GF'), 'B51': ('ASA', 'ASA-CF'),
    'C00': ('PC', 'PC'), 'C01': ('PC', 'PC FR'),
    'G00': ('PETG', 'PETG Basic'), 'G02': ('PETG', 'PETG HF'), 'G50': ('PETG', 'PETG-CF'),
    'N04': ('PA', 'PAHT-CF'), 'N08': ('PA', 'PA6-GF'), 'U02': ('TPU', 'TPU for AMS'),
}
src = open(os.path.join(root, 'server', 'public', 'vendor', 'bambu-colors.js'), encoding='utf-8').read()
colors = json.loads(src[src.index('{'):src.rindex('}') + 1])
seen, cat = set(), []
for code, (hexv, name) in sorted(colors.items()):
    fam = FAMILIES.get(code[:3])
    if not fam or name.lower() == 'clear': continue
    cname = name.replace('For AMS ', '').replace('Tough ', '').replace('Lite ', '').replace('Glow ', '')
    key = (hexv.upper(), fam[1])
    if key in seen: continue
    seen.add(key); cat.append([hexv.upper(), fam[0], fam[1], cname])

out = app.replace('/*__CORE__*/', core).replace('/*__CATALOG__*/', json.dumps(cat, ensure_ascii=False, separators=(',', ':'))[1:-1])
dest = os.path.join(root, 'server', 'public', 'prismatica', 'index.html')
open(dest, 'w', encoding='utf-8').write(out)
print('Prismatica scritta in', os.path.relpath(dest), len(out), 'byte ·', len(cat), 'colori nel catalogo')
