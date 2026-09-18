/* Glow pop — the text cuts in at full size in one frame carrying a heavy white bloom,
 * then the bloom decays (fast first, slow tail) and settles to a faint residual glow.
 * The letters themselves never move. (Learned from the "Because…" reference.) */
TM.register({
  id: 'glow',
  name: 'Glow pop',
  desc: 'Text cuts in with a bright bloom that fades to a soft glow',
  params: [
    { key: 'glowStr',  basic: true, label: 'Glow amount',         type: 'number', default: 0.7,  min: 0,   max: 2,    step: 0.05 },
    { key: 'glowSize', basic: true, label: 'Glow size (× font size)', type: 'number', default: 0.18, min: 0.05, max: 0.6, step: 0.01 },
    { key: 'decay',    basic: true, label: 'Glow fades over (ms)',  type: 'number', default: 800,  min: 100, max: 3000, step: 50 },
    { key: 'residual', label: 'Glow left at the end (0–1)', type: 'number', default: 0.15, min: 0,   max: 1,    step: 0.05 },
    { key: 'fadeIn',   basic: true, label: 'Opacity fade-in (ms, 0 = cut)', type: 'number', default: 400, min: 0, max: 2000, step: 10 },
    { key: 'stagger',  label: 'Delay between lines (ms)',   type: 'number', default: 0,    min: 0,   max: 2000, step: 10 },
  ],

  duration(lines, { params: p }) { return p.fadeIn + p.decay + (lines.length - 1) * p.stagger; },

  mount(root, lines, ctx) {
    const els = lines.map(ln => {
      const el = document.createElement('span'); el.className = 'l';
      el.textContent = ln || ' '; el.style.willChange = 'opacity, text-shadow'; el.style.opacity = 0;
      root.appendChild(el); return el;
    });
    return { els, size: ctx.style.size, color: ctx.style.color };
  },

  render(st, t, ctx) {
    const p = ctx.params, { clamp01 } = ctx;
    const s = p.glowSize * st.size;
    const glow = a => {
      const inner = Math.min(1, 0.9 * a), outer = Math.min(1, 0.6 * a);
      const c = st.color;
      return `0 0 ${(s*0.35).toFixed(1)}px ${rgba(c, inner)}, 0 0 ${s.toFixed(1)}px ${rgba(c, outer)}, 0 0 ${(s*2).toFixed(1)}px ${rgba(c, outer*0.5)}`;
    };
    st.els.forEach((el, i) => {
      const lt = t - i * p.stagger;
      // opacity fades in; the glow is at full strength while the text fades in (peaks as the fade
      // completes), then decays from that moment
      const o = p.fadeIn > 0 ? clamp01(lt / p.fadeIn) : (lt >= 0 ? 1 : 0);
      const k = clamp01((lt - p.fadeIn) / p.decay);
      const a = p.glowStr * (p.residual + (1 - p.residual) * Math.pow(1 - k, 2));
      el.style.opacity = o;
      el.style.textShadow = (o > 0 && a > 0.005) ? glow(a) : 'none';
    });
    function rgba(hex, a){
      const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
      if (!m) return `rgba(255,255,255,${a.toFixed(3)})`;
      const n = parseInt(m[1], 16);
      return `rgba(${n>>16&255},${n>>8&255},${n&255},${a.toFixed(3)})`;
    }
  },
});
