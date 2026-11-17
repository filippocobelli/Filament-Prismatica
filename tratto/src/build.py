# Tratto — unisce librerie, core.js e il profilo Orca della P1S dentro app.html e scrive il file pronto per FilamentBox.
# Uso: python3 tratto/src/build.py   (dalla radice del repository)
import os
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.join(here, '..', '..')
rd = lambda *p: open(os.path.join(here, *p), encoding='utf-8').read()
libs = '\n'.join([
    '/* Clipper 6.4.2 · Angus Johnson · Boost Software License 1.0 */\n' + rd('vendor', 'clipper.min.js'),
    rd('vendor', 'libtess.min.js'),
    '/* fflate 0.8.2 · 101arrowz · MIT */\n' + rd('vendor', 'fflate.min.js'),
])
core, base, app = rd('core.js'), rd('p1s-base.json'), rd('app.html')
for name, part in (('librerie', libs), ('core.js', core), ('profilo', base)):
    if '</script' in part.lower(): raise SystemExit(name + ' contiene </script')
out = app.replace('/*__LIBS__*/', libs, 1).replace('/*__CORE__*/', core, 1).replace('/*__BASE__*/', base, 1)
dest = os.path.join(root, 'server', 'public', 'tratto', 'index.html')
os.makedirs(os.path.dirname(dest), exist_ok=True)
open(dest, 'w', encoding='utf-8').write(out)
print('Tratto scritto in', os.path.relpath(dest), len(out), 'byte')
