/* Word by word — the plainest reveal: words appear one after another in reading order,
 * no fade, no movement. Optional short fade. Timing is snapped to whole frames. */
const WORDBYWORD = {
  id: 'wordbyword',
  name: 'Word by word',
  desc: 'Words simply appear one after another, in order — no fade, no motion',
  params: [
    { key: 'step',  basic: true, label: 'Time between words (ms)', type: 'number', default: 200, min: 30, max: 2000, step: 10 },
    { key: 'fade',  basic: true, label: 'Fade per word (ms, 0 = cut)', type: 'number', default: 0, min: 0, max: 1000, step: 10 },
    { key: 'unit',  label: 'Reveal as', type: 'select', default: 'word', options: [
        { value: 'word', label: 'Each word' }, { value: 'line', label: 'Each line' } ] },
    { key: 'lineMs', label: 'Extra pause at line break (ms)', type: 'number', default: 0, min: 0, max: 2000, step: 10 },
    { key: 'move',   hidden: true, label: 'Drop distance (px)', type: 'number', default: 0, min: 0, max: 400, step: 5 },
    { key: 'moveDir', hidden: true, label: 'Slide from', type: 'select', default: 'down', options: [
        { value: 'down', label: 'Above (drops into place)' }, { value: 'up', label: 'Below (rises into place)' } ] },
  ],

  _stepF(p, ctx) { const frame = 1000 / (ctx.fps || 30); return Math.max(1, Math.round(p.step / frame)) * frame; },
  _count(lines, p) {
    if (p.unit === 'line') return lines.filter(l => l.trim()).length || 1;
    return lines.reduce((n, ln) => n + (ln.trim() ? ln.trim().split(/\s+/).length : 0), 0) || 1;
  },
  duration(lines, ctx) {
    const p = ctx.params, breaks = Math.max(0, lines.filter(l => l.trim()).length - 1);
    return (this._count(lines, p) - 1) * this._stepF(p, ctx) + breaks * p.lineMs + p.fade;
  },

  mount(root, lines, ctx) {
    const p = ctx.params, units = [], stepF = this._stepF(p, ctx);
    let t = 0, firstLine = true;
    lines.forEach(ln => {
      const l = document.createElement('span'); l.className = 'l';
      if (!ln.trim()) { l.innerHTML = '&nbsp;'; root.appendChild(l); return; }
      if (!firstLine) t += p.lineMs; firstLine = false;
      if (p.unit === 'line') { const s = document.createElement('span'); s.textContent = ln; l.appendChild(s); units.push({ el: s, t }); t += stepF; }
      else ln.split(/(\s+)/).forEach(part => {
        if (!part) return; const s = document.createElement('span'); s.textContent = part; l.appendChild(s);
        if (part.trim()) { units.push({ el: s, t }); t += stepF; }
      });
      root.appendChild(l);
    });
    units.forEach(u => { u.el.style.opacity = 0; if (p.move > 0) { u.el.style.display = 'inline-block'; u.el.style.willChange = 'opacity, transform'; } });
    return { units, scale: ctx.scale || 1 };
  },

  render(st, t, ctx) {
    const p = ctx.params, { clamp01 } = ctx;
    st.units.forEach(u => {
      const lt = t - u.t;
      const k = p.fade > 0 ? clamp01(lt / p.fade) : (lt >= 0 ? 1 : 0);
      u.el.style.opacity = k.toFixed(3);
      if (p.move > 0) { const e = 1 - Math.pow(1 - k, 1.6); /* same curve as Typewriter block fall */ u.el.style.transform = `translateY(${((p.moveDir === 'down' ? -1 : 1) * (1 - e) * p.move * st.scale).toFixed(1)}px)`; }
    });
  },
};
TM.register(WORDBYWORD);

// Same order and beat, but every word fades in instead of cutting
TM.register({
  ...WORDBYWORD,
  id: 'wordfade',
  name: 'Word by word fade',
  desc: 'Words appear one after another, each fading in — no motion',
  params: WORDBYWORD.params.map(p =>
    p.key === 'fade' ? { ...p, default: 400, min: 50, label: 'Fade per word (ms)' } :
    p.key === 'step' ? { ...p, default: 250 } : p),
});

// Fade + a small drop from above for each word
TM.register({
  ...WORDBYWORD,
  id: 'wordfall',
  name: 'Word by word fall',
  desc: 'Words appear one after another, each fading in while dropping slightly from above',
  params: WORDBYWORD.params.map(p =>
    p.key === 'fade' ? { ...p, default: 500, min: 50, label: 'Fade + drop per word (ms)' } :
    p.key === 'step' ? { ...p, default: 250 } :
    p.key === 'move' ? { ...p, default: 60, hidden: false, basic: true } :
    p.key === 'moveDir' ? { ...p, hidden: false } : p),
});
