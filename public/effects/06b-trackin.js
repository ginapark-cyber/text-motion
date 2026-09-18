/* Slide in (motion blur) — the After Effects "position keyframe + motion blur" move: the text cuts
 * in offset to one side and snaps into place with a fast exponential ease-out, smeared along the
 * direction of travel in proportion to its speed. Optional per-letter offset makes trailing letters
 * start further out, so the word also tightens as it arrives (the "Performance" reference look). */
TM.register({
  id: 'trackin',
  name: 'Slide in (motion blur)',
  desc: 'Text snaps in from one side with a speed-based motion-blur streak — fast and punchy',
  params: [
    { key: 'from',     basic: true, label: 'Comes from', type: 'select', default: 'left', options: [
        { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'top', label: 'Above' }, { value: 'bottom', label: 'Below' } ] },
    { key: 'distance', basic: true, label: 'Travel distance (px)',      type: 'number', default: 160,  min: 0,   max: 1200, step: 10 },
    { key: 'duration', basic: true, label: 'Settle time (ms)',          type: 'number', default: 500,  min: 100, max: 2000, step: 10 },
    { key: 'blur',     basic: true, label: 'Motion blur amount',        type: 'number', default: 0.6,  min: 0,   max: 3,    step: 0.1 },
    { key: 'sharp',    label: 'Speed graph sharpness (higher = faster start, longer tail)', type: 'number', default: 8, min: 2, max: 120, step: 1 },
    { key: 'spread',   label: 'Extra offset per letter (× font size)',  type: 'number', default: 0.12, min: 0,   max: 1,    step: 0.01 },
    { key: 'fadeIn',   basic: true, label: 'Opacity fade-in (ms, 0 = cut)', type: 'number', default: 150, min: 0, max: 600, step: 10 },
    { key: 'stagger',  label: 'Delay between lines (ms)',               type: 'number', default: 0,    min: 0,   max: 2000, step: 10 },
  ],

  duration(lines, { params: p }) { return p.duration + (lines.length - 1) * p.stagger; },

  mount(root, lines, ctx) {
    const p = ctx.params, size = ctx.style.size, scale = ctx.scale || 1;
    const uid = 'tmb' + Math.floor(Math.random() * 1e9);
    // one SVG directional-blur filter per character (stdDeviation is updated every frame)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', 0); svg.setAttribute('height', 0); svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); svg.appendChild(defs); root.appendChild(svg);
    const horiz = p.from === 'left' || p.from === 'right';
    const sign = (p.from === 'left' || p.from === 'top') ? -1 : 1;   // start offset direction
    const rows = lines.map((ln, li) => {
      const l = document.createElement('span'); l.className = 'l'; root.appendChild(l);
      if (!ln) { l.innerHTML = '&nbsp;'; return { chars: [] }; }
      const arr = [...ln], n = arr.length;
      const chars = arr.map((ch, ci) => {
        const s = document.createElement('span'); s.textContent = ch;
        s.style.cssText = 'display:inline-block;will-change:transform,filter'; l.appendChild(s);
        const f = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        const id = `${uid}_${li}_${ci}`; f.setAttribute('id', id); f.setAttribute('x', '-150%'); f.setAttribute('y', '-150%'); f.setAttribute('width', '400%'); f.setAttribute('height', '400%');
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur'); g.setAttribute('stdDeviation', '0 0'); f.appendChild(g); defs.appendChild(f);
        // letters on the side the text comes from start further out, so the word is stretched at first
        // and tightens as it lands (the reference look); vertical: lower letters/lines lag by line only
        const rank = horiz ? (p.from === 'left' ? n - 1 - ci : ci) : 0;
        const start = sign * (p.distance * scale + rank * p.spread * size);
        return { el: s, blur: g, id, start };
      });
      return { chars };
    });
    root.style.opacity = p.fadeIn > 0 ? 0 : 1;
    return { rows, horiz, frame: 1000 / (ctx.fps || 30) };
  },

  render(st, t, ctx) {
    const p = ctx.params, { clamp01 } = ctx;
    // AE-style speed graph: velocity spikes at the first frame and decays like 1/(1+a·x)² — almost all
    // of the travel happens in the first few frames, then a long, slow settle to the end keyframe
    const a = p.sharp, tail = 1 / (1 + a);
    const rem = lt => { if (lt <= 0) return 1; const x = Math.min(1, lt / p.duration); return (1 / (1 + a * x) - tail) / (1 - tail); };
    st.rows.forEach((row, li) => {
      const lt = t - li * p.stagger, done = lt >= p.duration;
      const r = done ? 0 : rem(lt), rNext = done ? 0 : rem(lt + st.frame);
      row.chars.forEach(c => {
        const off = c.start * r;
        c.el.style.transform = off ? (st.horiz ? `translateX(${off.toFixed(2)}px)` : `translateY(${off.toFixed(2)}px)`) : '';
        const b = Math.abs(c.start) * (r - rNext) * 0.5 * p.blur;   // half the distance travelled this frame
        if (b > 0.3) { c.blur.setAttribute('stdDeviation', st.horiz ? `${b.toFixed(2)} 0` : `0 ${b.toFixed(2)}`); c.el.style.filter = `url(#${c.id})`; }
        else c.el.style.filter = '';
      });
    });
    if (p.fadeIn > 0) ctx.stage.querySelector('#text').style.opacity = clamp01(t / p.fadeIn);
  },
});
