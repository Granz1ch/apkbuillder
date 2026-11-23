#!/usr/bin/env python3
"""Shows where Cyrillic text is left in the project (translation control)."""
import re
import sys
import glob
import os

CYR = re.compile(r'[А-Яа-яЁё]')
roots = sys.argv[1:] or ['src', 'index.html', 'public/manifest.webmanifest', 'README.md']

files = []
for r in roots:
    if os.path.isfile(r):
        files.append(r)
    else:
        for dirpath, _, names in os.walk(r):
            if 'node_modules' in dirpath:
                continue
            for n in names:
                files.append(os.path.join(dirpath, n))

total = 0
for f in sorted(files):
    try:
        text = open(f, encoding='utf-8').read()
    except (UnicodeDecodeError, OSError):
        continue
    hits = [(i + 1, ln) for i, ln in enumerate(text.split('\n')) if CYR.search(ln)]
    if hits:
        total += len(hits)
        print(f'{f}: {len(hits)}')
        for n, ln in hits[:6]:
            print(f'   {n}: {ln.strip()[:110]}')
        if len(hits) > 6:
            print(f'   … {len(hits) - 6} more')

print(f'\nLines with Cyrillic: {total}')
