/* Opacity flicker in — letters appear in random order, each one fading from 0 to 100%.
 * (After Effects "Opacity Flicker In": Opacity animator, Range Selector with Random Order on.)
 * Deterministic (seeded) so preview == export. */
const FLICKER = {
  id: 'flicker',
  name: 'Opacity flicker in',
  desc: 'Letters fade in one by one in random order — After Effects “Opacity Flicker In”',
  params: [
    { key: 'step',     basic: true, label: 'Time between letters (ms)', type: 'number', default: 66,   min: 10,  max: 600,  step: 1 },
    { key: 'fade',     basic: true, label: 'Fade per letter (ms, 0 = cut)', type: 'number', default: 40, min: 0, max: 2000, step: 10 },
    { key: 'unit',     label: 'Based on', type: 'select', default: 'char', options: [
        { value: 'char', label: 'Characters' }, { value: 'word', label: 'Words' }, { value: 'line', label: 'Lines' } ] },
    { key: 'blur',     hidden: true, label: 'Start blur (× font size)', type: 'number', default: 0, min: 0, max: 0.5, step: 0.01 },
    { key: 'move',     hidden: true, label: 'Slide distance (px)', type: 'number', default: 0, min: 0, max: 400, step: 5 },
    { key: 'moveUnit', hidden: true, label: 'Slide as', type: 'select', default: 'word', options: [
        { value: 'word', label: 'Each word (moves while its letters appear)' }, { value: 'all', label: 'Whole text (moves for the full duration)' }, { value: 'letter', label: 'Each letter' } ] },
    { key: 'moveDir',  hidden: true, label: 'Slide from', type: 'select', default: 'down', options: [
        { value: 'down', label: 'Above (falls into place)' }, { value: 'up', label: 'Below (rises into place)' } ] },
    { key: 'ease',     hidden: true, label: 'Fade curve', type: 'select', default: 'linear', options: [
        { value: 'linear', label: 'Linear' }, { value: 'smooth', label: 'Smooth (ease-out)' } ] },
    { key: 'noNeighbors', label: 'Never show two neighbouring letters in a row', type: 'boolean', default: true },
    { key: 'seed',     label: 'Random order seed',                     type: 'number', default: 11,   min: 0,   max: 9999, step: 1 },
  ],

  _count(lines, p) {
    if (p.unit === 'line') return lines.filter(l => l.trim()).length || 1;
    if (p.unit === 'word') return lines.reduce((n, ln) => n + (ln.trim() ? ln.trim().split(/\s+/).length : 0), 0) || 1;
    return lines.reduce((n, ln) => n + [...ln.replace(/\s/g, '')].length, 0) || 1;
  },
  // total length follows the text: (N-1) gaps + the last letter's fade — short text = short animation
  duration(lines, ctx) { const p = ctx.params, frame = 1000 / (ctx.fps || 30), stepF = Math.max(1, Math.round(p.step / frame)) * frame; return (this._count(lines, p) - 1) * stepF + p.fade; },

  mount(root, lines, ctx) {
    const p = ctx.params, units = [];
    const pos = [];   // [line, column] of each unit, for the neighbour rule
    const groups = [];   // sliding wrappers (word / whole text): { el, members: [unit indices] }
    const allWrap = p.move > 0 && p.moveUnit === 'all' ? document.createElement('span') : null;
    if (allWrap) { allWrap.style.cssText = 'display:inline-block;will-change:transform'; groups.push({ el: allWrap, members: null }); }
    lines.forEach((ln, li) => {
      const l = document.createElement('span'); l.className = 'l';
      if (!ln) l.innerHTML = '&nbsp;';
      else if (p.unit === 'line') { const s = document.createElement('span'); s.textContent = ln; l.appendChild(s); units.push(s); pos.push([li, 0]); }
      else if (p.unit === 'word') { let w = 0; ln.split(/(\s+)/).forEach(part => { if (!part) return; const s = document.createElement('span'); s.textContent = part; l.appendChild(s); if (part.trim()) { units.push(s); pos.push([li, w++]); } }); }
      else if (p.move > 0 && p.moveUnit === 'word') {
        // letters inside per-word wrappers so a whole word can slide as one block
        ln.split(/(\s+)/).forEach(part => { if (!part) return;
          if (!part.trim()) { const s = document.createElement('span'); s.textContent = part; l.appendChild(s); return; }
          const g = document.createElement('span'); g.style.cssText = 'display:inline-block;will-change:transform'; const members = [];
          [...part].forEach(ch => { const s = document.createElement('span'); s.textContent = ch; g.appendChild(s); members.push(units.length); units.push(s); pos.push([li, pos.length]); });
          groups.push({ el: g, members }); l.appendChild(g); });
      }
      else [...ln].forEach((ch, ci) => { const s = document.createElement('span'); s.textContent = ch; l.appendChild(s); if (ch.trim()) { units.push(s); pos.push([li, ci]); } });
      (allWrap || root).appendChild(l);
    });
    if (allWrap) root.appendChild(allWrap);
    const N = units.length || 1;
    const adjacent = (a, b) => pos[a][0] === pos[b][0] && Math.abs(pos[a][1] - pos[b][1]) === 1;
    // random order; with the neighbour rule, retry shuffles until no two consecutive picks sit side by side
    let order;
    for (let attempt = 0; attempt < 200; attempt++) {
      const r = ctx.rng(p.seed * 31 + 7 + attempt * 1013);
      order = units.map((_, i) => i);
      for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      if (!p.noNeighbors || !order.some((u, k) => k > 0 && adjacent(u, order[k - 1]))) break;
    }
    // even beat: one letter every `step` ms, snapped to whole frames so the gaps are identical on screen
    const frame = 1000 / (ctx.fps || 30), stepF = Math.max(1, Math.round(p.step / frame)) * frame;
    const starts = new Array(N);
    order.forEach((u, k) => { starts[u] = k * stepF; });
    const perLetter = p.move > 0 && p.moveUnit === 'letter';
    units.forEach(u => { u.style.opacity = 0; u.style.willChange = 'opacity' + (p.blur > 0 ? ', filter' : '') + (perLetter ? ', transform' : ''); if (perLetter) u.style.display = 'inline-block'; });
    // each sliding group moves from its first letter's start to its last letter's end
    const total = (N - 1) * stepF + p.fade;
    groups.forEach(g => { if (!g.members) { g.t0 = 0; g.t1 = total; } else { g.t0 = Math.min(...g.members.map(i => starts[i])); g.t1 = Math.max(...g.members.map(i => starts[i])) + p.fade; } });
    return { units, starts, groups, perLetter, size: ctx.style.size, scale: ctx.scale || 1 };
  },

  render(st, t, ctx) {
    const p = ctx.params, { clamp01 } = ctx;
    st.units.forEach((u, i) => {
      const lt = t - st.starts[i];
      let k = p.fade > 0 ? clamp01(lt / p.fade) : (lt >= 0 ? 1 : 0);
      if (p.ease === 'smooth') k = 1 - Math.pow(1 - k, 2);
      u.style.opacity = k.toFixed(3);
      if (p.blur > 0) u.style.filter = k >= 1 ? '' : `blur(${((1 - k) * p.blur * st.size).toFixed(2)}px)`;
      if (st.perLetter) u.style.transform = `translateY(${((p.moveDir === 'down' ? -1 : 1) * (1 - k) * p.move * st.scale).toFixed(1)}px)`;
    });
    st.groups.forEach(g => {
      let k = clamp01((t - g.t0) / Math.max(1, g.t1 - g.t0)); k = 1 - Math.pow(1 - k, 2);
      g.el.style.transform = `translateY(${((p.moveDir === 'down' ? -1 : 1) * (1 - k) * p.move * st.scale).toFixed(1)}px)`;
    });
  },
};
TM.register(FLICKER);

// Soft version: same random order and beat, but each letter fades in slowly so several are mid-fade at once
TM.register({
  ...FLICKER,
  id: 'flickersoft',
  name: 'Opacity flicker in (soft)',
  desc: 'Random-order letters with a long, overlapping fade — gentler than the classic flicker',
  params: FLICKER.params.map(p =>
    p.key === 'fade' ? { ...p, default: 600, label: 'Fade per letter (ms)', min: 100 } :
    p.key === 'step' ? { ...p, default: 50 } :
    p.key === 'ease' ? { ...p, default: 'smooth' } : p),
});

// Blur version: letters also start blurred and sharpen as they fade in
TM.register({
  ...FLICKER,
  id: 'flickerblur',
  name: 'Blur flicker in',
  desc: 'Random-order letters fade in while a blur clears off each one',
  params: FLICKER.params.map(p =>
    p.key === 'fade' ? { ...p, default: 700, label: 'Fade + unblur per letter (ms)', min: 100 } :
    p.key === 'step' ? { ...p, default: 50 } :
    p.key === 'blur' ? { ...p, default: 0.12, hidden: false, basic: true } :
    p.key === 'ease' ? { ...p, default: 'smooth' } : p),
});

// Soft version + fall: each letter also drops into place from slightly above while it fades in
TM.register({
  ...FLICKER,
  id: 'flickersoftfall',
  name: 'Opacity flicker in (soft) fall',
  desc: 'Random-order letters fade in slowly while dropping into place from above',
  params: FLICKER.params.map(p =>
    p.key === 'fade' ? { ...p, default: 600, label: 'Fade per letter (ms)', min: 100 } :
    p.key === 'step' ? { ...p, default: 50 } :
    p.key === 'move' ? { ...p, default: 40, hidden: false, basic: true, label: 'Drop distance (px)' } :
    p.key === 'moveUnit' ? { ...p, hidden: false, basic: true } :
    p.key === 'moveDir' ? { ...p, hidden: false } :
    p.key === 'ease' ? { ...p, default: 'smooth' } : p),
});
