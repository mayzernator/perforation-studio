"""Assemble the offline app page from the shared editor sources in ../perf."""
import os, re, shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, '..', 'perf')
OUT = os.path.join(ROOT, 'app')
NM = os.path.join(ROOT, 'fonts-src', 'node_modules')

shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(os.path.join(OUT, 'fonts'))
os.makedirs(os.path.join(OUT, 'vendor'))

ui = open(os.path.join(SRC, 'ui.html')).read()
core = open(os.path.join(SRC, 'core.js')).read()
presets = open(os.path.join(SRC, 'presets.js')).read()

# fonts: bundled woff2 instead of Google Fonts
faces = [
    ('Barlow', 'barlow', [400, 500, 600]),
    ('Barlow Semi Condensed', 'barlow-semi-condensed', [500, 600, 700]),
    ('JetBrains Mono', 'jetbrains-mono', [400, 500]),
]
css = []
for family, pkg, weights in faces:
    for w in weights:
        fn = f'{pkg}-latin-{w}-normal.woff2'
        shutil.copy(os.path.join(NM, '@fontsource', pkg, 'files', fn), os.path.join(OUT, 'fonts', fn))
        css.append(f"@font-face{{font-family:'{family}';font-style:normal;font-weight:{w};font-display:block;src:url(fonts/{fn}) format('woff2')}}")
shutil.copy(os.path.join(NM, 'three', 'build', 'three.min.js'), os.path.join(OUT, 'vendor', 'three.min.js'))

head_remote = re.compile(r'<link rel="preconnect"[^>]*>\n|<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>\n|<script src="https://cdnjs\.cloudflare\.com/ajax/libs/jszip[^>]*></script>\n')
ui, n = head_remote.subn('', ui)
assert n == 4, n
ui = ui.replace("s.src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';", "s.src='vendor/three.min.js';")
assert 'cdnjs' not in ui and 'googleapis' not in ui
ui = ui.replace('/*CORE*/', core).replace('/*PRESETS*/', presets)

csp = ("default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
       "font-src 'self'; img-src 'self' data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'")
page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        f'<meta http-equiv="Content-Security-Policy" content="{csp}">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
        '<style>' + ''.join(css) + '</style>\n</head>\n<body>\n' + ui + '\n</body>\n</html>\n')
open(os.path.join(OUT, 'index.html'), 'w').write(page)
print('app/index.html', len(page), 'bytes;', len(css), 'font faces; three.js bundled')
