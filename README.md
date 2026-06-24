# Strudel Live for GSV

This package is a community example that wraps the upstream Strudel browser
REPL in a GSV package app. It lets a user select a GSV target, read a
`strudel.json` sample map from that target, and launch the Strudel editor with a
generated `samples(...)` prelude.

It also includes an AI co-producer panel. The package does not call provider
APIs directly. Instead, its backend uses `proc.spawn`, `proc.send`, and
`proc.history` so generation runs through the normal GSV process runtime,
including the configured model, account context, and approval rules.

Strudel is AGPL-3.0. This example does not bundle `@strudel/repl`; it embeds the
upstream editor at `https://strudel.cc/` and keeps GSV-specific code separate.
Directly vendoring or modifying Strudel code has additional license
obligations.

## Target Sample Maps

For GSV-hosted audio, put files under `/public` so the browser and Strudel can
fetch them with CORS and byte range support:

```json
{
  "_base": "/public/strudel/drums/",
  "kick": "kick.wav",
  "snare": "snare.wav",
  "hat": ["hat-closed.wav", "hat-open.wav"]
}
```

For device targets, the package can read the `strudel.json` file through
`fs.read`, but the audio paths inside the map must resolve to URLs that Strudel
can fetch from the browser, such as `https://...`, `github:owner/repo`, or a
device-hosted HTTP server with CORS enabled.

## AI Flow

The AI panel asks a temporary process for JSON containing:

```json
{
  "title": "short label",
  "notes": "one sentence",
  "code": "Strudel pattern body"
}
```

The UI applies the returned code to the seed editor only after the user clicks
Apply. Launching the Strudel iframe remains a separate user action.

## Validate

```bash
npm run check
npm run build
```
