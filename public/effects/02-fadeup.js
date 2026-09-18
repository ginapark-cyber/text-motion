/* Fade Up Characters — modelled on the After Effects "Fade Up Characters" text preset.
 *
 *  - A single range selector (Ramp Up shape) sweeps across the text; the only animated
 *    property is Opacity (0 → 100%). No movement, no glyph changes.
 *  - Neighbouring characters overlap: while one is finishing its fade the next few have
 *    already started, so the reveal reads as a soft wipe rather than a typewriter.
 *  - Unit can be characters (the preset), words or lines ("Fade Up Words" / "Fade Up Lines").
 */
TM.register({
  id: 'fadeup',
  name: 'Fade up characters',
  desc: 'Characters fade in one after another — After Effects “Fade Up Characters”',
  params: [
    { key: 'duration', label: 'Duration (ms)',            type: 'number', default: 1200, min: 200, max: 6000, step: 50 },
    { key: 'unit', basic: true, label: 'Unit', type: 'select', default: 'char', options: [
        { value: 'char', label: 'Characters' }, { value: 'word', label: 'Words' }, { value: 'line', label: 'Lines' } ] },
    { key: 'ramp',     label: 'Units fading at once',     type: 'number', default: 4,    min: 1,   max: 20,   step: 1 },
    { key: 'ease',     label: 'Ramp shape', type: 'select', default: 'smooth', options: [
        { value: 'ramp', label: 'Ramp up (linear)' }, { value: 'smooth', label: 'Smooth' }, { value: 'easeOut', label: 'Ease out' } ] },
    { key: 'randomOrder', label: 'Randomize order',       type: 'boolean', default: false },
    { key: 'seed',     label: 'Random seed',              type: 'number', default: 1,    min: 0,   max: 9999, step: 1 },
  ],

  duration(lines, { params: p }) { return p.duration; },

  mount(root, lines, ctx) {
    const p = ctx.params, units = [];
    lines.forEach(ln => {
      const line = document.createElement('span'); line.className = 'l'; root.appendChild(line);
      const parts = p.unit === 'line' ? [ln] : p.unit === 'word' ? ln.split(/(\s+)/) : [...ln];
      parts.forEach(part => {
        const el = document.createElement('span'); el.textContent = part; el.style.willChange = 'opacity';
        line.appendChild(el);
        if (part.trim()) units.push(el);
      });
    });
    let order = units.map((_, i) => i);
    if (p.randomOrder) {
      const r = ctx.rng(p.seed * 31 + 7);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    }
    const rank = []; order.forEach((idx, r) => rank[idx] = r);
    return { units, rank };
  },

  render(st, t, ctx) {
    const p = ctx.params, { clamp01, smooth, easeOut } = ctx;
    const n = st.units.length;
    const head = clamp01(t / p.duration) * (n + p.ramp);        // selector position, incl. a full ramp for the last unit
    st.units.forEach((el, i) => {
      let k = clamp01((head - st.rank[i]) / p.ramp);             // 0 = not started, 1 = fully visible
      if (p.ease === 'smooth') k = smooth(k);
      else if (p.ease === 'easeOut') k = easeOut(k);
      el.style.opacity = k;
    });
  },
});
