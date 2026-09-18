import express from 'express';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import ffmpegStatic from 'ffmpeg-static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5173;
const PUBLIC = path.join(__dirname, 'public');
const FONTS = path.join(PUBLIC, 'fonts');
const EFFECTS = path.join(PUBLIC, 'effects');
const EXPORTS = path.join(__dirname, 'exports');
// ffmpeg-static downloads a binary at install time; if that failed, fall back to a system ffmpeg (brew install ffmpeg)
const FFMPEG = process.env.FFMPEG || (ffmpegStatic && fs.existsSync(ffmpegStatic) ? ffmpegStatic : 'ffmpeg');
fs.mkdirSync(EXPORTS, { recursive: true });

const app = express();
app.use(express.json({ limit: '40mb' }));

/* ---------- fonts: drop any .ttf/.otf/.woff2 into public/fonts ----------
 * Family name = file name up to the first "-" or "[" (Archivo[wdth,wght].ttf → Archivo,
 * Archivo-Italic[...] → Archivo italic). Variable fonts get full weight/width ranges. */
function fontFiles() {
  return fs.readdirSync(FONTS).filter(f => /\.(ttf|otf|woff2?)$/i.test(f)).map(file => {
    const base = file.replace(/\.[^.]+$/, '');
    const family = base.split(/[-\[]/)[0];
    const italic = /italic/i.test(base);
    const variable = /\[.*\]/.test(base) || /variable/i.test(base);
    const weightMatch = base.match(/-(Thin|ExtraLight|Light|Regular|Medium|SemiBold|Bold|ExtraBold|Black)/i);
    const weights = { thin:100, extralight:200, light:300, regular:400, medium:500, semibold:600, bold:700, extrabold:800, black:900 };
    const weight = variable ? '100 900' : (weightMatch ? weights[weightMatch[1].toLowerCase()] : 400);
    return { file, family, italic, variable, weight };
  });
}
app.get('/api/fonts.css', (req, res) => {
  const css = fontFiles().map(f => `@font-face{font-family:"${f.family}";src:url("/fonts/${encodeURIComponent(f.file)}");font-weight:${f.weight};${f.variable ? 'font-stretch:50% 200%;' : ''}font-style:${f.italic ? 'italic' : 'normal'};font-display:block;}`).join('\n');
  res.type('text/css').send(css);
});
app.get('/api/fonts', (req, res) => {
  const fams = {};
  fontFiles().forEach(f => {
    fams[f.family] ??= { family: f.family, variable: false, italic: false, weights: new Set() };
    if (f.variable) { fams[f.family].variable = true; [100,200,300,400,500,600,700,800,900].forEach(w => fams[f.family].weights.add(w)); }
    else fams[f.family].weights.add(+f.weight);
    if (f.italic) fams[f.family].italic = true;
  });
  res.json(Object.values(fams).map(f => ({ ...f, weights: [...f.weights].sort((a, b) => a - b) })));
});

/* ---------- effects: every public/effects/*.js is concatenated in name order ---------- */
app.get('/api/effects.js', (req, res) => {
  const files = fs.readdirSync(EFFECTS).filter(f => f.endsWith('.js')).sort();
  res.type('application/javascript').send(files.map(f => `/* ${f} */\n{\n${fs.readFileSync(path.join(EFFECTS, f), 'utf8')}\n}`).join('\n\n'));
});

/* ---------- logos (for the Logo roll effect): public/assets/logos/*.png ---------- */
const LOGOS = path.join(PUBLIC, 'assets', 'logos');
fs.mkdirSync(LOGOS, { recursive: true });
function pngSize(file) {
  try { const b = Buffer.alloc(24); const fd = fs.openSync(file, 'r'); fs.readSync(fd, b, 0, 24, 0); fs.closeSync(fd);
    return b.toString('ascii', 12, 16) === 'IHDR' ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : {}; } catch { return {}; }
}
const logoName = s => String(s || '').normalize('NFC').replace(/\.png$/i, '').replace(/[^\w\-가-힣 ]/g, '').trim().replace(/\s+/g, '-').slice(0, 40);
app.get('/api/logos', (req, res) => {
  const list = fs.readdirSync(LOGOS).filter(f => f.toLowerCase().endsWith('.png')).sort()
    .map(f => ({ name: f.replace(/\.png$/i, ''), ...pngSize(path.join(LOGOS, f)), mtime: fs.statSync(path.join(LOGOS, f)).mtimeMs }));
  res.json(list);
});
// body: { name, data: base64 PNG (already trimmed / background removed in the browser) }
app.post('/api/logos', (req, res) => {
  const name = logoName(req.body.name); const data = String(req.body.data || '').replace(/^data:image\/png;base64,/, '');
  if (!name || !data) return res.status(400).json({ error: 'name and data required' });
  fs.writeFileSync(path.join(LOGOS, name + '.png'), Buffer.from(data, 'base64'));
  res.json({ name });
});
app.delete('/api/logos/:name', (req, res) => {
  const name = logoName(req.params.name); const file = path.join(LOGOS, name + '.png');
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ ok: true });
});

/* ---------- export ---------- */
const jobs = new Map();
let browser;
async function getBrowser() {
  if (!browser || !browser.isConnected()) browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  return browser;
}

function slug(s) { return s.replace(/\s+/g, '-').replace(/[^\w\-가-힣]/g, '').slice(0, 40) || 'text'; }

app.post('/api/export', async (req, res) => {
  const { config, format = 'prores4444', name } = req.body;
  const id = Date.now().toString(36);
  const job = { id, status: 'starting', frame: 0, frames: 0, file: null, error: null };
  jobs.set(id, job);
  res.json({ id });
  runExport(job, config, format, name).catch(err => { job.status = 'error'; job.error = String(err && err.stack || err); console.error(err); });
});
app.get('/api/export/:id', (req, res) => res.json(jobs.get(req.params.id) || { status: 'unknown' }));
app.get('/api/exports', (req, res) => {
  const files = fs.readdirSync(EXPORTS).filter(f => !f.startsWith('.')).map(f => ({ name: f, size: fs.statSync(path.join(EXPORTS, f)).size, mtime: fs.statSync(path.join(EXPORTS, f)).mtimeMs })).sort((a, b) => b.mtime - a.mtime);
  res.json(files);
});
app.use('/exports', express.static(EXPORTS));
// reveal a file (or the exports folder) in Finder / Explorer
app.post('/api/reveal', (req, res) => {
  const f = req.body && req.body.file ? path.join(EXPORTS, path.basename(String(req.body.file))) : EXPORTS;
  const target = fs.existsSync(f) ? f : EXPORTS;
  const cmd = process.platform === 'darwin' ? ['open', target === EXPORTS ? [target] : ['-R', target]] : process.platform === 'win32' ? ['explorer', [target === EXPORTS ? target : '/select,' + target]] : ['xdg-open', [EXPORTS]];
  try { spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref(); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: String(e) }); }
});

async function runExport(job, config, format, name) {
  const { width, height, fps } = config;
  const base = `${slug(name || config.text.split('\n')[0])}_${config.effect}_${width}x${height}_${fps}fps_${job.id}`;
  const b = await getBrowser();
  const page = await b.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const c = Buffer.from(unescape(encodeURIComponent(JSON.stringify(config)))).toString('base64');
  await page.goto(`http://localhost:${PORT}/stage.html?c=${encodeURIComponent(c)}`);
  await page.waitForFunction(() => window.TM_ready === true, null, { timeout: 30000 });
  const total = await page.evaluate(() => window.TM_total);
  // CDP capture with optimizeForSpeed is ~2x faster than page.screenshot at 4K
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: format === 'mp4' ? { r: 0, g: 0, b: 0, a: 1 } : { r: 0, g: 0, b: 0, a: 0 } });
  const frames = Math.ceil(total / 1000 * fps) + 1;
  job.frames = frames; job.status = 'rendering';

  const outFile = format === 'png' ? null : path.join(EXPORTS, base + (format === 'mp4' ? '.mp4' : '.mov'));
  let ff = null, pngDir = null;
  if (format === 'png') { pngDir = path.join(EXPORTS, base); fs.mkdirSync(pngDir, { recursive: true }); }
  else {
    const args = ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-'];
    // Rec.709 / video-range conversion + colr tags: without these, Premiere/AE/QuickTime guess the colour space and
    // range of the file, and a pure white can come out slightly grey (or the gamma lifted) on top of footage
    const COLR = ['-vf', 'scale=out_color_matrix=bt709:out_range=tv', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', '-movflags', '+write_colr'];
    if (format === 'prores4444') args.push('-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0', '-bits_per_mb', '8000', ...COLR);
    else if (format === 'mp4') args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'medium', ...COLR.slice(0, -2), '-movflags', '+faststart+write_colr');
    args.push('-r', String(fps), outFile);
    ff = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let errLog = '';
    ff.stderr.on('data', d => { errLog += d; if (errLog.length > 20000) errLog = errLog.slice(-20000); });
    ff.on('error', e => { job.error = 'ffmpeg: ' + e.message; });
    ff.__log = () => errLog;
  }

  for (let i = 0; i < frames; i++) {
    const t = Math.min(total, i * 1000 / fps);
    await page.evaluate(t => { window.TM_seek(t); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, t);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    const png = Buffer.from(shot.data, 'base64');
    if (pngDir) fs.writeFileSync(path.join(pngDir, `${base}_${String(i).padStart(5, '0')}.png`), png);
    else if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
    job.frame = i + 1;
  }
  await page.close();

  if (ff) {
    job.status = 'encoding';
    ff.stdin.end();
    const code = await new Promise(r => ff.on('close', r));
    if (code !== 0) throw new Error('ffmpeg exited ' + code + '\n' + ff.__log());
  }
  job.status = 'done';
  job.file = pngDir ? path.basename(pngDir) + '/' : path.basename(outFile);
}

app.use(express.static(PUBLIC));
// auto-restart when server.js is updated (start.command relaunches on exit code 75)
if (!process.env.NO_WATCH) { let t; fs.watch(fileURLToPath(import.meta.url), () => { clearTimeout(t); t = setTimeout(() => { console.log('server.js changed — restarting'); process.exit(75); }, 300); }); }

app.listen(PORT, () => {
  console.log(`\n  text-motion  →  http://localhost:${PORT}\n  ffmpeg: ${FFMPEG}\n  exports: ${EXPORTS}\n`);
});
process.on('exit', () => browser && browser.close());
