# Deploying text-motion (Railway)

The repo runs in two modes with the same code:

- **Local Mac** — `start.command` → http://localhost:5173. Exports land in `exports/`, "Show in Finder" button.
- **Hosted** (`HOSTED=1`, set by the Dockerfile) — files are downloaded by the browser, optional password, exports auto-deleted after 24 h, one render at a time.

## Railway setup (once)

1. Railway → **New Project → Deploy from GitHub repo** → pick `text-motion`. Railway detects the `Dockerfile` automatically.
2. **Variables** tab — add:
   - `APP_PASSWORD` = the team password (leave unset for no login screen)
   - (optional) `EXPORT_TTL_HOURS` = how long rendered files stay downloadable (default 24)
3. **Volume** — right-click the service → *Add Volume* → mount path **`/data`**. Keeps uploaded logos (and pending exports) across redeploys.
4. **Settings → Networking → Generate Domain** → that URL is what the team uses. Custom domain can be added there later.
5. Every `git push` to `main` redeploys automatically (about 2–4 min: Chromium download is cached in the image layers).

## Environment variables the server understands

| var | default | meaning |
|---|---|---|
| `PORT` | 5173 | Railway sets this automatically |
| `HOSTED` | unset | `1` → hosted mode (download button, password, no watcher, `--no-sandbox` Chromium) |
| `APP_PASSWORD` | unset | if set, the site asks for this password once per browser (90-day cookie) |
| `EXPORTS_DIR` | `./exports` | where renders are written (Dockerfile: `/data/exports`) |
| `LOGOS_DIR` | `./public/assets/logos` | uploaded logos (Dockerfile: `/data/logos`; seeded from the repo folder on first start) |
| `EXPORT_TTL_HOURS` | 24 | hosted only: delete exports older than this |
| `NO_WATCH` | unset | disable the server.js self-restart watcher (on in Docker) |
| `FFMPEG` / `CHROMIUM` | auto | override binary paths |

## Current deployment (2026-09-18)

- Railway project **zucchini-light** → service **text-motion**, URL: https://text-motion-production.up.railway.app
- Trial plan (1 GB RAM): **FHD exports work, 4K gets OOM-killed** in ffmpeg. Upgrading to Hobby (8 GB) fixes 4K with no code change.
- Volume mounted at `/data`. No `APP_PASSWORD` set (open link).
- `/api/debug` shows cgroup memory limit/usage if a render dies with SIGKILL.

## Notes

- 4K ProRes renders on a cloud CPU take ~2–4 min; FHD about a quarter of that. The UI shows progress and a "waiting" state when someone else is rendering.
- Files are large (4K ProRes 4444 ≈ 13 MB/s). They download straight from the server; nothing is stored in a database.
- The password is a simple shared secret for team use — do not put anything sensitive behind it.
