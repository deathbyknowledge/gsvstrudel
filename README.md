# Strudel Live

Strudel Live is a GSV-native live-coding workstation for Strudel.

It does not iframe `https://strudel.cc`. The package owns the UI, bundles the
Strudel browser runtime through `@strudel/web`, and uses GSV syscalls for device
sample staging and co-producer process control.

## What it does

- Play/evaluate Strudel pattern bodies directly in the package window.
- Use a remote sample source such as `github:tidalcycles/dirt-samples`.
- Load an existing `strudel.json` from GSV or a connected device.
- Stage a device-backed sample map into `/public/strudel-live/packs/<pack>/`
  with `fs.copy`, then play it from browser-safe GSV URLs.
- Capture four in-window scene slots for fast workspace recall.
- Start a visible `strudel-live#coproducer` package-profile process and send it
  the current pattern, source label, and sample names.

## Sample pack staging

Point the source panel at a target and a `strudel.json` path, then press
`Stage pack`.

The backend reads the map, copies local/relative sample references into GSV
public storage, writes a staged `strudel.json`, and switches the app to that
staged pack. Remote sample URLs are preserved instead of copied.

## Co-producer profile

The package declares `profiles/coproducer`. When the package is installed and
enabled, GSV provisions the profile as a package agent. The app starts that
profile with `proc.spawn` and displays its transcript instead of hiding a
throwaway generation process behind a button.

## License

This package bundles `@strudel/web`, which is AGPL-3.0-or-later. The package is
therefore licensed as AGPL-3.0-or-later.

## Development

`@strudel/web` is pinned to `1.0.3` because newer `1.1+` bundles publish a
worker asset reference that the current GSV package assembler resolves as a
missing `assets/clockworker-*.js` module.

Scene slots are intentionally in memory for now because GSV package app frames
are sandboxed without same-origin browser storage.

```bash
npm run check
npm run build
```
