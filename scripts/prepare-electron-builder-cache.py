#!/usr/bin/env python3
"""Pre-populate electron-builder caches for Windows release builds.
Downloads winCodeSign, NSIS, and NSIS-resources archives from
electron-builder-binaries releases and extracts them (skipping
symlinks where needed)."""

import urllib.request, os, subprocess, shutil, ssl, sys

CACHE = os.path.join(os.environ['LOCALAPPDATA'], 'electron-builder', 'Cache')
SEVEN_ZIP = os.path.join('node_modules', '7zip-bin', 'win', 'x64', '7za.exe')

ARCHIVES = [
    # Name, version, URL, skip-symlinks
    ('winCodeSign', 'winCodeSign-2.6.0',
     'winCodeSign-2.6.0/winCodeSign-2.6.0.7z', True),
    ('nsis', 'nsis-3.0.4.1',
     'nsis-3.0.4.1/nsis-3.0.4.1.7z', False),
    ('nsis-resources', 'nsis-3.0.4.1',
     'nsis-resources-3.4.1/nsis-resources-3.4.1.7z', False, 'nsis'),
]

BASE_URL = 'https://github.com/electron-userland/electron-builder-binaries/releases/download'

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
os.makedirs(CACHE, exist_ok=True)

for args in ARCHIVES:
    name, ver, rel_path, needs_snl = args[:4]
    cache_name = name
    dest = os.path.join(CACHE, name, ver)
    cache_zip = os.path.join(CACHE, name, ver + '.7z')
    if os.path.isdir(dest) and os.path.exists(cache_zip):
        print(f'~ {name} cache ready')
        continue

    print(f'\n=== Preparing {name} cache ===')
    if os.path.isdir(dest):
        shutil.rmtree(dest)
    os.makedirs(dest)

    url = f'{BASE_URL}/{rel_path}'
    zip_path = os.path.join(os.environ.get('TEMP', r'C:\tmp'), f'{name}-cache.7z')
    try:
        print(f'  downloading {url}')
        req = urllib.request.Request(url, headers={'User-Agent': 'node'})
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            with open(zip_path, 'wb') as f:
                f.write(resp.read())
        print(f'  saved {os.path.getsize(zip_path) / 1048576:.1f} MiB')

        # Save clean copy for electron-builder to recognize
        shutil.copy2(zip_path, cache_zip)

        args = [SEVEN_ZIP, 'x', zip_path, f'-o{dest}', '-y']
        if needs_snl:
            args.append('-snl')
        r = subprocess.run(args)
        if r.returncode != 0:
            print(f'  7za extract failed (exit {r.returncode})')
            sys.exit(1)
        print(f'  ~ {name} ready')
    except Exception as e:
        print(f'Failed: {e}')
        sys.exit(1)
    finally:
        try: os.remove(zip_path)
        except: pass

print('\n~ All caches ready')
