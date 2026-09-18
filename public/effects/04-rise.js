/* Rise by word — whole words (or lines) slide up and fade in one after another. */
TM.register({
  id: 'rise',
  name: 'Rise by word',
  desc: 'Whole words slide up and fade in, one after another',
  params: [
    { key: 'unit', basic: true, label: 'Rise as', type: 'select', default: 'word', options: [
        { value: 'word', label: 'Each word' }, { value: 'line', label: 'Each line' } ] },
    { key: 'dur',      basic: true, label: 'Rise time per word (ms)', type: 'number', default: 600, min: 100, max: 3000, step: 50 },
    { key: 'stagger',  basic: true, label: 'Delay between words (ms)', type: 'number', default: 150, min: 0, max: 1000, step: 10 },
    { key: 'distance', basic: true, label: 'Rise distance (px)',    type: 'number', default: 60,  min: 0,   max: 600,  step: 5 },
    { key: 'blur',     label: 'Start blur (px)',    type: 'number', default: 0,   min: 0,   max: 40,   step: 1 },
    { key: 'mask',     label: 'Clip each line (hides the word until it reaches its line)', type: 'boolean', default: false },
  ],

  duration(lines, { params: p }) {
    const n = countUnits(lines, p.unit);
    return (n - 1) * p.stagger + p.dur;
  },

  mount(root, lines, ctx) {
    const p = ctx.params, units = [];
    lines.forEach(ln => {
      const line = document.createElement('span'); line.className = 'l';
      if (p.mask) line.style.overflow = 'hidden';
      root.appendChild(line);
      const parts = p.unit === 'line' ? [ln] : p.unit === 'word' ? ln.split(/(\s+)/) : [...ln];
      parts.forEach(part => {
        const el = document.createElement('span');
        el.className = 'u'; el.textContent = part;
        el.style.display = 'inline-block'; el.style.willChange = 'opacity, transform';
        line.appendChild(el);
        if (part.trim()) units.push(el);
      });
    });
    return { units };
  },

  render(st, t, ctx) {
    const p = ctx.params, { easeOut, clamp01 } = ctx;
    st.units.forEach((el, i) => {
      const k = easeOut(clamp01((t - i * p.stagger) / p.dur));
      el.style.opacity = k;
      el.style.transform = `translateY(${(1 - k) * p.distance * (ctx.scale || 1)}px)`;
      el.style.filter = p.blur ? `blur(${(1 - k) * p.blur * (ctx.scale || 1)}px)` : '';
    });
  },
});

function countUnits(lines, unit) {
  if (unit === 'line') return lines.length;
  if (unit === 'word') return lines.reduce((n, l) => n + l.split(/\s+/).filter(Boolean).length, 0);
  return lines.reduce((n, l) => n + l.replace(/\s/g, '').length, 0);
}
