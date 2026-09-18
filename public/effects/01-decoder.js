/* Decoder fade in — modelled on the After Effects "Decoder Fade In" text preset.
 *
 * How the AE preset behaves (and what this reproduces):
 *  - One range selector sweeps left→right with a Ramp Up shape. Every character has a
 *    selector amount a: 1 = untouched (not started), 0 = fully decoded.
 *  - Two animator properties are driven by that amount at the same time:
 *      Opacity          →  opacity = 1 - a   (character fades up as it decodes)
 *      Character Offset →  a stand-in letter while a is large, the real letter once a < resolveAt
 *    By default each character passes through exactly ONE other letter and then snaps to the
 *    real one while still fading up. `steps` adds more intermediate letters, `wiggle` adds
 *    per-frame churn. Case and digits are preserved (AE "Preserve Case & Digits").
 *  - Glyph changes are hard cuts, never crossfades.
 */
TM.register({
  id: 'decoder',
  name: 'Decoder fade in',
  desc: 'Letters flicker through one random character, then settle — After Effects “Decoder Fade In”',
  params: [
    { key: 'step',     basic: true, label: 'Time per letter (ms)',  type: 'number', default: 40,   min: 10,  max: 300,  step: 5 },
    { key: 'ramp',     basic: true, label: 'Letters decoding at once', type: 'number', default: 8,    min: 1,   max: 20,   step: 1 },
    { key: 'sameWidth', label: 'Stand-in letters of similar width (no line reflow)', type: 'boolean', default: true },
    { key: 'steps',    label: 'Stand-in letters per character',        type: 'number', default: 1,    min: 1,   max: 10,   step: 1 },
    { key: 'switchAt', basic: true, label: 'Real letter appears at opacity (0–1)', type: 'number', default: 0.5, min: 0.05, max: 1, step: 0.05 },
    { key: 'wiggle',   label: 'Per-frame jitter (± letters, 0 = off)', type: 'number', default: 0, min: 0, max: 30, step: 1 },
    { key: 'flicker',  label: 'Jitter interval (ms)',      type: 'number', default: 33,   min: 16,  max: 300,  step: 1 },
    { key: 'fade',     label: 'Fade amount (0 = none, 1 = full)', type: 'number', default: 1,   min: 0,   max: 1,    step: 0.05 },
    { key: 'ease',     label: 'Ramp shape', type: 'select', default: 'smooth', options: [
        { value: 'ramp', label: 'Ramp up (linear)' }, { value: 'smooth', label: 'Smooth' }, { value: 'square', label: 'Square (hard steps)' } ] },
    { key: 'randomOrder', label: 'Randomize order',            type: 'boolean', default: false },
    { key: 'lockWidth',   label: 'Lock letter widths (no reflow)', type: 'boolean', default: false },
    { key: 'seed',     label: 'Random seed',                 type: 'number', default: 3,    min: 0,   max: 9999, step: 1 },
  ],

  // total length follows the text: one `step` per visible character plus the ramp tail — short text = short animation
  _count(lines) { return lines.reduce((n, ln) => n + [...ln.replace(/\s/g, '')].length, 0) || 1; },
  duration(lines, { params: p }) { return (this._count(lines) + p.ramp) * p.step; },

  mount(root, lines, ctx) {
    const chars = [];
    lines.forEach(ln => {
      const line = document.createElement('span'); line.className = 'l'; root.appendChild(line);
      for (let i = 0; i < ln.length; i++) {
        const slot = document.createElement('span'); slot.className = 'slot';
        const g = document.createElement('span'); g.className = 'ly'; g.textContent = ln[i]; g.style.opacity = 1; g.style.position = 'static';
        slot.appendChild(g); line.appendChild(slot);
        chars.push({ ch: ln[i], slot, g });
      }
    });
    // AE reflows the line as glyphs change (letters shift sideways). Optionally lock each slot
    // to its final glyph width instead — steadier, but wide stand-in glyphs get clipped.
    if (ctx.params.lockWidth) {
      chars.forEach(c => { c.w = c.g.getBoundingClientRect().width; });
      chars.forEach(c => { c.slot.style.width = c.w + 'px'; c.slot.style.overflow = 'hidden'; c.g.style.position = 'absolute'; });
    }

    // decode order: left→right, or shuffled (AE "Randomize Order")
    const visible = chars.map((c, i) => i).filter(i => chars[i].ch.trim());
    let order = visible.slice();
    if (ctx.params.randomOrder) {
      const r = ctx.rng(ctx.params.seed * 31 + 7);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    }
    const rank = new Map(); order.forEach((idx, r) => rank.set(idx, r));
    // stand-in candidates of similar advance width, so swapping glyphs doesn't push the rest of the line around
    if (ctx.params.sameWidth) {
      const cv = document.createElement('canvas').getContext('2d'); const st = ctx.style;
      cv.font = `${st.italic ? 'italic ' : ''}${st.weight} ${st.size}px "${st.font}"`;
      const width = ch => cv.measureText(ch).width;
      const pools = { upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz', digit: '0123456789' };
      chars.forEach(c => {
        const code = c.ch.charCodeAt(0);
        const pool = code >= 65 && code <= 90 ? pools.upper : code >= 97 && code <= 122 ? pools.lower : code >= 48 && code <= 57 ? pools.digit : null;
        if (!pool) return;
        const w = width(c.ch);
        let cands = [...pool].filter(x => x !== c.ch && Math.abs(width(x) - w) <= w * 0.12);
        if (cands.length < 3) cands = [...pool].filter(x => x !== c.ch).sort((a, b) => Math.abs(width(a) - w) - Math.abs(width(b) - w)).slice(0, 4);
        c.cands = cands;
      });
      // and pin every slot to its final glyph width (stand-ins are centred in it, overflow allowed) → zero reflow
      if (!ctx.params.lockWidth) chars.forEach(c => { const w = c.g.getBoundingClientRect().width; c.slot.style.width = w + 'px'; c.slot.style.textAlign = 'center'; c.slot.style.overflow = 'visible'; });
    }
    return { chars, rank, n: visible.length };
  },

  render(st, t, ctx) {
    const p = ctx.params, { clamp01, smooth } = ctx;
    const tick = Math.floor(t / p.flicker);
    // selector head travels from 0 to n+ramp over the duration, so the last char also gets a full ramp
    const head = t / p.step;   // one character per `step` ms; the last char still gets a full ramp

    st.chars.forEach((c, k) => {
      if (!c.ch.trim()) { c.g.style.opacity = 0; return; }
      const r = st.rank.get(k);
      let a = clamp01((r - head) / p.ramp + 1);          // 1 = not started, 0 = decoded
      if (p.ease === 'smooth') a = smooth(a);
      else if (p.ease === 'square') a = a > 0 ? 1 : 0;

      if (a <= 0) { c.g.textContent = c.ch; c.g.style.opacity = 1; return; }

      // which glyph is showing: the real letter once a drops under resolveAt, otherwise one of
      // `steps` stand-in letters (each fixed per character, seeded — no per-frame churn unless wiggle > 0)
      let g = c.ch;
      const resolveAt = 1 - p.switchAt;   // selector amount at which the real letter takes over (opacity = 1 - a)
      if (a > resolveAt) {
        const stage = Math.min(p.steps, Math.ceil((a - resolveAt) / (1 - resolveAt) * p.steps)); // 1..steps
        const base = ctx.rng(p.seed * 7919 + k * 104729 + stage * 3571)();
        let shift = 1 + Math.floor(base * 25);                                      // never the letter itself
        if (p.wiggle) shift += Math.round((ctx.rng(p.seed * 131 + k * 7 + tick * 1299709)() * 2 - 1) * p.wiggle);
        g = c.cands ? c.cands[(shift + (p.wiggle ? tick : 0)) % c.cands.length] : shiftChar(c.ch, shift);
      }
      if (c.g.textContent !== g) c.g.textContent = g;
      c.g.style.opacity = 1 - a * p.fade;
    });
  },
});

/* AE "Preserve Case & Digits": shift within the character's own range and wrap around */
function shiftChar(ch, n) {
  const code = ch.charCodeAt(0);
  const wrap = (base, size) => String.fromCharCode(base + (((code - base + n) % size) + size) % size);
  if (code >= 65 && code <= 90)  return wrap(65, 26);   // A–Z
  if (code >= 97 && code <= 122) return wrap(97, 26);   // a–z
  if (code >= 48 && code <= 57)  return wrap(48, 10);   // 0–9
  if (code >= 0xAC00 && code <= 0xD7A3) return wrap(0xAC00, 11172); // 한글 음절
  return ch;                                            // punctuation stays
}
