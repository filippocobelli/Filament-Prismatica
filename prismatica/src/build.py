# Prismatica — unisce core.js dentro app.html e scrive il file pronto per FilamentBox.
# Uso: python3 prismatica/src/build.py   (dalla radice del repository)
import os
here = os.path.dirname(os.path.abspath(__file__))
core = open(os.path.join(here, 'core.js'), encoding='utf-8').read()
app = open(os.path.join(here, 'app.html'), encoding='utf-8').read()
out = app.replace('/*__CORE__*/', core)
dest = os.path.join(here, '..', '..', 'server', 'public', 'prismatica', 'index.html')
open(dest, 'w', encoding='utf-8').write(out)
print('Prismatica scritta in', os.path.relpath(dest), len(out), 'byte')
