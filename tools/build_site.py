#!/usr/bin/env python3
"""把 src/ 與 data/ 組成單一、可離線開啟的 index.html。

用法:
    python3 tools/build_site.py              # 產生 index.html
    python3 tools/build_site.py --fragment X # 另外輸出不含 <html>/<head> 外殼的版本到 X
"""
import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


def build():
    template = read('src/template.html')
    css = read('src/style.css')
    emblems = []
    for f in sorted((ROOT / 'assets/emblems').glob('*.png')):
        b64 = base64.b64encode(f.read_bytes()).decode()
        emblems.append(f'  --emblem-{f.stem}: url("data:image/png;base64,{b64}");')
    css += '\n:root {\n' + '\n'.join(emblems) + '\n}\n'
    data = read('data/core.js') + '\n' + read('data/factions.js')
    app = read('src/app.js')
    for name, chunk in (('data', data), ('app', app)):
        if '</script' in chunk.lower():
            raise SystemExit(f'{name} 內含 </script>，會截斷頁面')
    html = (template.replace('/*STYLE*/', css)
            .replace('/*DATA*/', data)
            .replace('/*APP*/', app))
    head, body = html.split('<!--BODY-->')
    return head.strip(), body.strip()


def main():
    head, body = build()
    full = ('<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            f'{head}\n</head>\n<body>\n{body}\n</body>\n</html>\n')
    (ROOT / 'index.html').write_text(full, encoding='utf-8')
    print(f'index.html  {len(full.encode()) / 1024:.0f} KB')
    if '--fragment' in sys.argv:
        out = Path(sys.argv[sys.argv.index('--fragment') + 1])
        out.write_text(head + '\n' + body + '\n', encoding='utf-8')
        print(f'{out}  {out.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    main()
