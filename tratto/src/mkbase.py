# Tratto — rigenera printers-base.json dai profili di sistema di Orca Slicer (cartella resources/profiles/BBL).
# Per ogni stampante risolve ereditarietà e template di stampante, processo 0.20 mm Standard e filamento Generic PLA.
# Tratto applica sopra le impostazioni UMTS (vedi buildProjectConfig in core.js).
# Uso: python3 tratto/src/mkbase.py /percorso/OrcaSlicer/resources/profiles/BBL
import json, os, sys, glob
BASE = sys.argv[1]
idx = {}
for f in glob.glob(os.path.join(BASE, '**', '*.json'), recursive=True):
    try: d = json.load(open(f, encoding='utf-8'))
    except Exception: continue
    if isinstance(d, dict) and 'name' in d: idx[d['name']] = d
def resolve(name):
    d = idx[name]; out = {}
    if d.get('inherits'): out.update(resolve(d['inherits']))
    for inc in d.get('include', []): out.update(resolve(inc))
    out.update(d); return out
DROP = {'name','inherits','from','setting_id','instantiation','include','type','compatible_printers','compatible_printers_condition','compatible_prints','compatible_prints_condition','renamed_from','description','filament_id','is_custom_defined','version'}
clean = lambda d: {k: v for k, v in d.items() if k not in DROP}
PRINTERS = {
    'P1S': ('Bambu Lab P1S 0.4 nozzle', '0.20mm Standard @BBL X1C', 'Generic PLA'),
    'P1P': ('Bambu Lab P1P 0.4 nozzle', '0.20mm Standard @BBL P1P', 'Generic PLA'),
    'X1C': ('Bambu Lab X1 Carbon 0.4 nozzle', '0.20mm Standard @BBL X1C', 'Generic PLA'),
    'A1':  ('Bambu Lab A1 0.4 nozzle', '0.20mm Standard @BBL A1', 'Generic PLA @BBL A1'),
    'A1M': ('Bambu Lab A1 mini 0.4 nozzle', '0.20mm Standard @BBL A1M', 'Generic PLA @BBL A1M'),
}
out = {}
for key, (m, p, f) in PRINTERS.items():
    M, P, F = resolve(m), resolve(p), resolve(f)
    out[key] = {'machine': clean(M), 'process': clean(P), 'filament': clean(F), 'names': {'machine': m, 'process': p, 'filament': f},
                'filament_id': F.get('filament_id', 'GFL99'), 'print_compatible_printers': P.get('compatible_printers', [])}
dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'printers-base.json')
json.dump(out, open(dest, 'w', encoding='utf-8'), separators=(',', ':'))
print('Profili scritti in', dest, os.path.getsize(dest), 'byte')
