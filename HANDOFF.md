# text-motion — handoff notes

Orientation for packaging this as a Mac app. Not full documentation; see `README.md` for usage.

## Reference export (2026-09-17)

| | |
|---|---|
| Text | `Text Motion handoff` (one line) |
| Effect | Decoder fade in (`decoder`), all effect params at defaults |
| Style | Archivo 400, size 260, tracking -0.016, white, position middle/center |
| Timing | preHold 80 ms · endHold 3900 ms · exit none (endHold raised from the 2000 default to make the clip ~5 s) |
| Output | ProRes 4444 with alpha (`prores4444`), `.mov` |
| Resolution / fps | 3840×2160 (the tool's default), 30 fps → 151 frames, 5.03 s |
| File | `~/Desktop/reference-export.mov`, 68.2 MB, md5 `faf5903f03c20f104a033868a6e52019` |
| Render time | **79 s** wall-clock from POST `/api/export` to `status: done` |

Caveat: the render was run through the unchanged `server.js` export flow, but on a Linux (x86_64) machine with the
same code, not on this Mac — the Mac's own Node/Playwright/ffmpeg-static binaries cannot be executed from the
remote session. Expect a different (probably faster, Apple Silicon) time on the Mac; re-time it locally before
quoting numbers. Roughly half the time is Chromium screenshotting 4K PNGs, half is ffmpeg ProRes encoding.

## Versions

| | |
|---|---|
| Node / npm | **not verified on this Mac** — run `node -v && npm -v`. The reference render used Node 22.22.2 / npm 10.9.7. `server.js` uses ESM (`"type": "module"`), `??=`, top-level `import` → needs Node ≥ 18. |
| playwright | `^1.47.0` in package.json → **1.63.0** installed in `node_modules` |
| ffmpeg-static | `^5.2.0` in package.json → **5.3.0** installed (binary: Mach-O arm64) |
| express | `^4.19.2` → 4.22.2 installed |

## Where the export logic lives

Everything is in **`server.js`** (~180 lines).

- `POST /api/export` → creates a job, calls **`runExport(job, config, format, name)`** (async, not awaited; progress is polled via `GET /api/export/:id`).
- **Chromium frame capture** — inside `runExport`: `getBrowser()` launches Playwright Chromium once and reuses it; a new page opens `public/stage.html?c=<base64 config>`, waits for `window.TM_ready`, reads `window.TM_total` (clip length in ms). Then a `for` loop over frames: `page.evaluate(TM_seek(t))` + two `requestAnimationFrame`s, then `cdp.send('Page.captureScreenshot', {format:'png', optimizeForSpeed:true})` over a raw CDP session. Transparency comes from `Emulation.setDefaultBackgroundColorOverride` (alpha 0), also CDP.
- **ffmpeg encode** — same function: `spawn(FFMPEG, args)` with `-f image2pipe`, PNGs written to `ff.stdin`; `prores_ks -profile:v 4444 -pix_fmt yuva444p10le` (+ Rec.709 / video-range tags), or `libx264` for mp4. `format: 'png'` skips ffmpeg and writes a PNG sequence folder instead.
- The frame renderer itself is browser code: `public/engine.js` (`TM.load / TM.seek / TM.ready`) + `public/effects/*.js`, driven by `public/stage.html`. `index.html` (the UI) previews with the same engine in an iframe.

## Effects → files (`public/effects/`, concatenated in filename order by `/api/effects.js`)

| File | Effect id → name |
|---|---|
| `01-decoder.js` | `decoder` Decoder fade in |
| `02-fadeup.js` | `fadeup` Fade up characters |
| `03-wordbyword.js` | `wordbyword` Word by word · `wordfade` Word by word fade · `wordfall` Word by word fall |
| `04-rise.js` | `rise` Rise by word |
| `05-flicker.js` | `flicker` Opacity flicker in · `flickersoft` (soft) · `flickerblur` Blur flicker in · `flickersoftfall` (soft) fall |
| `06-glow.js` | `glow` Glow pop |
| `06b-trackin.js` | `trackin` Slide in (motion blur) |
| `07-typewriter.js` | `typewriter` Typewriter · `typerise` Typewriter rise · `typewordrise` Typewriter block rise · `typeblockfall` Typewriter block fall |
| `08-logoroll.js` | `logoroll` Logo roll (kind: graphic — uses `public/assets/logos/*.png`) |
| `_template.js.txt` | not loaded; starting point for a new effect (`TM.register({...})` contract) |

Removed effects are parked in `_to_delete/` (not loaded, excluded from the zip).

## Things that will surprise you cold

- **No hardcoded absolute paths**, but everything is relative to `server.js`'s own directory (`__dirname`): `public/`, `public/fonts/`, `public/effects/`, `public/assets/logos/` (uploads are written here, so it must be writable) and `exports/` (created on start, written on every export). An app bundle with a read-only Resources folder breaks uploads and exports — point `EXPORTS`/`LOGOS` at `~/Library/Application Support/...` or similar.
- **Chromium is not in the repo.** `npm install` runs `postinstall: playwright install chromium`, which downloads it to `~/Library/Caches/ms-playwright/`. The server finds it via Playwright's registry, or via the `CHROMIUM` env var (`chromium.launch({ executablePath })`). A packaged app must ship or download Chromium itself.
- **ffmpeg is the `ffmpeg-static` binary in `node_modules`**, downloaded at install time for the current platform/arch (here arm64 Mac). Copying `node_modules` to an Intel Mac will not work. Falls back to `ffmpeg` on PATH or the `FFMPEG` env var if the static binary is missing.
- **CDP (Chrome DevTools Protocol) calls** — `Page.captureScreenshot`, `Emulation.setDefaultBackgroundColorOverride` — are Chromium-only. WebKit/Firefox via Playwright will not work.
- **`POST /api/reveal` runs `open -R <file>`** (macOS Finder). Has `explorer` / `xdg-open` branches for other OSes but only the Mac path is tested. The UI's "Show in Finder" button depends on it.
- **Auto-restart hack:** `server.js` watches its own file (`fs.watch`) and exits with code **75** when it changes; `start.command` loops and relaunches on 75. Set `NO_WATCH=1` to disable (you will want to in an app).
- **Port** defaults to 5173 (`PORT` env). `start.command` opens `http://localhost:$PORT` in the default browser 1.5 s after launch; if the port is taken the server crashes and the loop exits.
- **`start.command` sets `npm_config_cache=~/.npm-text-motion`** to dodge a permissions problem on this Mac's `~/.npm`. Harmless elsewhere.
- **Per-user state is browser `localStorage`** (key `text-motion:v10`): last text, params, format, logo colour, per-effect defaults. Nothing user-specific is stored on the server. Bumping the key resets everyone's saved settings.
- **All px values in the UI are 1080p-reference.** The engine scales by `k = min(width, height) / 1080`, so "size 260" is 260 px on a 1920×1080 export and 520 px on 4K. Effects receive `ctx.scale`.
- **Fonts** are whatever `.ttf/.otf/.woff2` files sit in `public/fonts/`; family name is parsed from the filename (`Archivo[wdth,wght].ttf` → Archivo, variable). Only Archivo ships.
- **Exports are large**: 4K ProRes 4444 at `-bits_per_mb 8000` ≈ 13 MB/s. The export list UI was removed; results are shown as one line + "Show in Finder" and served from `/exports/` as static files.
- One Chromium instance, jobs are not queued — two simultaneous exports run in parallel on the same browser and just slow each other down.
