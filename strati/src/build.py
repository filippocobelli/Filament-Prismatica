# Strati — unisce librerie (da Tratto), core.js, caratteri e profili Orca delle stampanti dentro app.html
# e scrive il file pronto per FilamentBox.
# Uso: python3 strati/src/build.py   (dalla radice del repository)
import os, base64
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.join(here, '..', '..')
rd = lambda *p: open(os.path.join(*p), encoding='utf-8').read()
tratto = os.path.join(root, 'tratto', 'src')
libs = '\n'.join([
    '/* Clipper 6.4.2 · Angus Johnson · Boost Software License 1.0 */\n' + rd(tratto, 'vendor', 'clipper.min.js'),
    rd(tratto, 'vendor', 'libtess.min.js'),
    '/* fflate 0.8.2 · 101arrowz · MIT */\n' + rd(tratto, 'vendor', 'fflate.min.js'),
])
# Caratteri (sottoinsieme latino, woff2): Luckiest Guy (Apache 2.0); Bangers, Anton, Bowlby One, Titan One (SIL OFL 1.1)
fonts = []
for name in ('LuckiestGuy', 'Bangers', 'Anton', 'BowlbyOne', 'TitanOne'):
    b = base64.b64encode(open(os.path.join(here, 'fonts', name + '.woff2'), 'rb').read()).decode()
    fonts.append("@font-face{font-family:'%s';src:url(data:font/woff2;base64,%s) format('woff2');font-display:block}" % (name, b))
core, base, app = rd(here, 'core.js'), rd(tratto, 'printers-base.json'), rd(here, 'app.html')
for name, part in (('librerie', libs), ('core.js', core), ('profili', base)):
    if '</script' in part.lower(): raise SystemExit(name + ' contiene </script')
out = app.replace('/*__FONTS__*/', '\n'.join(fonts), 1).replace('/*__LIBS__*/', libs, 1).replace('/*__CORE__*/', core, 1).replace('/*__BASE__*/', base, 1)
dest = os.path.join(root, 'server', 'public', 'strati', 'index.html')
os.makedirs(os.path.dirname(dest), exist_ok=True)
open(dest, 'w', encoding='utf-8').write(out)
print('Strati scritto in', os.path.relpath(dest), len(out), 'byte')
