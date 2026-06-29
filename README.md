# GISBuddy

AI-powered GIS data processing assistant. Bundles GDAL + BusyBox and lets
an LLM agent run geospatial commands against your data.

## Quick start (Windows)

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [just](https://github.com/casey/just) 1.x
- Git for Windows (provides `bash.exe`)

### Install dependencies

```powershell
npm install
```

### Run in dev mode

```powershell
npm start
```

### Build a Windows release (NSIS installer)

```powershell
just release-win unsigned=1 conda-prefix="$(pwd)/gdal-bin"
```

The recipe will:
1. Pre-populate electron-builder caches (`just prepare-cache`)
2. Prepare resources: icon, busybox, GDAL (`just resource-prepare-win`)
3. Build TypeScript + renderer
4. Package with electron-builder

Output: `release/GISBuddy-<version>-win-x64.exe`

### Notes for Windows users

`just` uses bash recipe syntax. The `Justfile` pins the Windows shell
to Git Bash via:

```
set windows-shell := ["C:/app/Git/bin/bash.exe", "-c"]
```

If your Git is installed elsewhere, edit this line to point to your
`bash.exe`. Common locations:

- `C:/Program Files/Git/bin/bash.exe` (default installer)
- `C:/app/Git/bin/bash.exe`

### Passing a custom GDAL location

By default `resource-prepare-win` looks for GDAL in `$CONDA_PREFIX` or
`$MAMBA_ROOT_PREFIX/envs/gdal`. To use a pre-populated `gdal-bin/`
directory, pass the path explicitly:

```powershell
just release-win unsigned=1 conda-prefix="$(pwd)/gdal-bin"
```
