/* Typewriter — characters appear one by one; a cursor can follow the typing, blink for a moment at
 * the end and disappear. "Letter entrance" chooses how each letter shows up: hard cut (classic
 * typewriter), fade, or rise (fade + slide up — the former "Rise" effect). Final layout is fixed from
 * the start (letters are revealed, not appended), so centred / right-aligned text does not shift. */
const TYPEWRITER = {
  id: 'typewriter',
  name: 'Typewriter',
  desc: 'Letters are typed one at a time, with an optional cursor',
  params: [
    { key: 'charMs',   basic: true, label: 'Time per letter (ms)',     type: 'number', default: 30,   min: 10,  max: 400,  step: 5 },
    { key: 'enter',    basic: true, label: 'Letter entrance', type: 'select', default: 'cut', options: [
        { value: 'cut', label: 'Cut (typewriter)' }, { value: 'fade', label: 'Fade' } ] },
    { key: 'riseUnit', hidden: true, label: 'Rise as', type: 'select', default: 'letter', options: [
        { value: 'letter', label: 'Each letter' }, { value: 'word', label: 'Each word' }, { value: 'line', label: 'Each line' }, { value: 'all', label: 'Whole text (lands when typing ends)' } ] },
    { key: 'enterMs',  label: 'Entrance length per letter (ms)', type: 'number', default: 500, min: 50, max: 2000, step: 10 },
    { key: 'distance', label: 'Rise distance (px)',           type: 'number', default: 60,   min: 0,   max: 400,  step: 5 },
    { key: 'direction', hidden: true, label: 'Direction', type: 'select', default: 'up', options: [
        { value: 'up', label: 'From below (rise)' }, { value: 'down', label: 'From above (fall)' } ] },
    { key: 'cursor',   basic: true, label: 'Cursor', type: 'select', default: 'none', options: [
        { value: 'none', label: 'None' }, { value: 'bar', label: 'Bar |' }, { value: 'block', label: 'Block ▍' }, { value: 'underscore', label: 'Underscore _' } ] },
    { key: 'jitter',   label: 'Timing randomness (0–1, 0 = even beat)', type: 'number', default: 0, min: 0, max: 1, step: 0.05 },
    { key: 'lineMs',   label: 'Pause at line break (ms)',    type: 'number', default: 0,    min: 0,   max: 2000, step: 10 },
    { key: 'startMs',  label: 'Cursor alone before typing (ms)', type: 'number', default: 0, min: 0, max: 3000, step: 50 },
    { key: 'afterMs',  label: 'Cursor blinks after typing (ms)', type: 'number', default: 1200, min: 0, max: 5000, step: 100 },
    { key: 'blinkMs',  label: 'Blink period (ms)',           type: 'number', default: 530,  min: 100, max: 2000, step: 10 },
    { key: 'seed',     label: 'Randomness seed',             type: 'number', default: 5,    min: 0,   max: 9999, step: 1 },
  ],

  // times[i] = moment character i becomes visible (computed once in mount and cached on the def)
  _schedule(lines, p, ctx) {
    const r = ctx.rng(p.seed * 7919 + 13); const times = []; let t = p.startMs;
    // even beat: snap the per-letter time to whole frames so every gap is identical on screen (reference: ~1 frame per letter)
    const frame = 1000 / (ctx.fps || 30), step = p.jitter > 0 ? p.charMs : Math.max(1, Math.round(p.charMs / frame)) * frame;
    lines.forEach((ln, li) => {
      if (li > 0) t += p.lineMs;
      for (const ch of [...ln]) { t += step * (1 + (r() * 2 - 1) * p.jitter); times.push(t); }
    });
    return { times, end: t };
  },

  duration(lines, ctx) { const p = ctx.params; return this._schedule(lines, p, ctx).end + Math.max(p.cursor === 'none' ? 0 : p.afterMs, (p.enter === 'cut' || (p.riseUnit && p.riseUnit !== 'letter')) ? 0 : p.enterMs); },

  mount(root, lines, ctx) {
    const p = ctx.params, chars = [];
    root.style.position = root.style.position || 'absolute';
    const groups = [];   // for riseUnit word/line: { el, first } — the wrapper moves, its letters are typed inside
    const mkChar = ch => { const s = document.createElement('span'); s.textContent = ch; s.style.cssText = 'display:inline-block;visibility:hidden;will-change:opacity,transform'; chars.push(s); return s; };
    const allWrap = p.riseUnit === 'all' ? document.createElement('span') : null;
    if (allWrap) { allWrap.style.cssText = 'display:inline-block;will-change:opacity,transform'; groups.push({ el: allWrap, first: 0, last: -1 }); }
    lines.forEach(ln => {
      const l = document.createElement('span'); l.className = 'l';
      if (!ln) l.innerHTML = '&nbsp;';
      else if (p.riseUnit === 'line') { const g = document.createElement('span'); g.style.cssText = 'display:inline-block;will-change:opacity,transform'; groups.push({ el: g, first: chars.length, last: chars.length + [...ln].length - 1 }); for (const ch of [...ln]) g.appendChild(mkChar(ch)); l.appendChild(g); }
      else if (p.riseUnit === 'word') ln.split(/(\s+)/).forEach(part => { if (!part) return; if (!part.trim()) { for (const ch of [...part]) l.appendChild(mkChar(ch)); return; }
        const g = document.createElement('span'); g.style.cssText = 'display:inline-block;will-change:opacity,transform'; groups.push({ el: g, first: chars.length, last: chars.length + [...part].length - 1 }); for (const ch of [...part]) g.appendChild(mkChar(ch)); l.appendChild(g); });
      else for (const ch of [...ln]) l.appendChild(mkChar(ch));
      (allWrap || root).appendChild(l);
    });
    if (allWrap) { root.appendChild(allWrap); groups[0].last = chars.length - 1; }
    const cur = document.createElement('span');
    const fs = ctx.style.size;
    const w = p.cursor === 'block' ? fs * 0.55 : p.cursor === 'underscore' ? fs * 0.55 : Math.max(2, fs * 0.06);
    const h = p.cursor === 'underscore' ? Math.max(2, fs * 0.07) : fs * 0.95;
    cur.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;background:currentColor;visibility:hidden;pointer-events:none;will-change:transform`;
    if (p.cursor === 'none') cur.style.display = 'none';
    root.appendChild(cur);
    const { times, end } = this._schedule(lines, p, ctx);
    return { chars, cur, times, end, fs, kind: p.cursor, enter: p.enter, groups, scale: ctx.scale || 1 };
  },

  render(st, t, ctx) {
    const p = ctx.params;
    let n = 0; while (n < st.times.length && st.times[n] <= t) n++;
    const dir = p.direction === 'down' ? -1 : 1;
    const move = (el, k) => { el.style.opacity = k.toFixed(3); el.style.transform = st.enter === 'rise' ? `translateY(${(dir * (1 - k) * p.distance * st.scale).toFixed(1)}px)` : ''; };
    st.chars.forEach((c, i) => {
      const on = i < n; c.style.visibility = on ? 'visible' : 'hidden';
      if (st.enter === 'cut' || st.groups.length) return;
      move(c, on ? ctx.easeOut(ctx.clamp01((t - st.times[i]) / p.enterMs)) : 0);
    });
    // word / line mode: the whole group rises from the moment its first letter is typed and lands exactly when its
    // last letter is typed, so the rise and the typing take the same time; letters still cut in one by one
    st.groups.forEach(g => { const t0 = st.times[g.first], dur = Math.max(120, st.times[g.last] - t0 + p.charMs); const k = ctx.clamp01((t - t0) / dur); move(g.el, t >= t0 ? 1 - Math.pow(1 - k, 1.6) : 0); });
    if (st.kind === 'none') return;
    // cursor position: right after the last visible character, or at the first character before typing starts
    const ref = n > 0 ? st.chars[n - 1] : st.chars[0];
    if (!ref) { st.cur.style.visibility = 'hidden'; return; }
    const rb = ref.getBoundingClientRect(), pb = st.cur.offsetParent.getBoundingClientRect();
    const x = (n > 0 ? rb.right : rb.left) - pb.left + st.fs * 0.04;
    const y = rb.top - pb.top + (st.kind === 'underscore' ? rb.height - parseFloat(st.cur.style.height) : (rb.height - parseFloat(st.cur.style.height)) / 2);
    st.cur.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    // steady while typing, blinking before and after
    const typing = n > 0 && t < st.end;
    const blinkOn = Math.floor(t / (p.blinkMs / 2)) % 2 === 0;
    const done = t >= st.end + p.afterMs;
    st.cur.style.visibility = (!done && (typing || blinkOn)) ? 'visible' : 'hidden';
  },
};
TM.register(TYPEWRITER);

// Typewriter + Rise: same typing rhythm, but every letter fades in while sliding up
TM.register({
  ...TYPEWRITER,
  id: 'typerise',
  name: 'Typewriter rise',
  desc: 'Typed one letter at a time, each letter rising up as it fades in',
  params: TYPEWRITER.params.map(p =>
    p.key === 'enter'    ? { ...p, default: 'rise', hidden: true, options: [{ value: 'rise', label: 'Rise' }] } :
    p.key === 'enterMs'  ? { ...p, basic: true, label: 'Rise length per letter (ms)' } :
    p.key === 'distance' ? { ...p, basic: true } :
    p.key === 'cursor'   ? { ...p, basic: false } : p),
});

// Typewriter + whole-word rise: letters are typed one by one while the word they belong to slides up as a block
TM.register({
  ...TYPEWRITER,
  id: 'typewordrise',
  name: 'Typewriter block rise',
  desc: 'Letters are typed one by one while the whole text slides up, landing as the last letter is typed',
  params: TYPEWRITER.params.map(p =>
    p.key === 'enter'    ? { ...p, default: 'rise', hidden: true, options: [{ value: 'rise', label: 'Rise' }] } :
    p.key === 'riseUnit' ? { ...p, default: 'all', hidden: false, basic: true } :
    p.key === 'enterMs'  ? { ...p, hidden: true } :   // rise time = typing time of the word
    p.key === 'distance' ? { ...p, basic: true } :
    p.key === 'cursor'   ? { ...p, basic: false } : p),
});

// Typewriter + whole-text fall: same as block rise, but the text comes down from above
TM.register({
  ...TYPEWRITER,
  id: 'typeblockfall',
  name: 'Typewriter block fall',
  desc: 'Letters are typed one by one while the whole text slides down into place',
  params: TYPEWRITER.params.map(p =>
    p.key === 'enter'     ? { ...p, default: 'rise', hidden: true, options: [{ value: 'rise', label: 'Rise' }] } :
    p.key === 'direction' ? { ...p, default: 'down' } :
    p.key === 'riseUnit'  ? { ...p, default: 'all', hidden: false, basic: true, label: 'Fall as' } :
    p.key === 'enterMs'   ? { ...p, hidden: true } :
    p.key === 'distance'  ? { ...p, basic: true, label: 'Fall distance (px)' } :
    p.key === 'cursor'    ? { ...p, basic: false } : p),
});
