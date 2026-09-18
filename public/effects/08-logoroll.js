/* Logo roll (graphic) — logos rise one by one through a centred rectangular window like a drum:
 * each rises from below the mask, settles in the centre (hold), then continues up and out while
 * the next rises in. Easing follows the AE speed graph (fast peak, long exponential settle).
 * Opacity fades only near the mask edges.
 *
 * Logos are PNGs in public/assets/logos/ — manage them (upload / order / delete) in the Logos panel
 * of the UI. Sizes are normalised so every logo reads as a similar visual mass, and colours can be
 * unified (original / white / black / the Color picker). */
(() => {
TM.register({
  id: 'logoroll',
  name: 'Logo roll',
  desc: 'Logos roll through a window one by one, like a drum',
  kind: 'graphic',
  params: [
    { key: 'logos', hidden: true, label: 'Logos (comma-separated file names)', type: 'text', default: 'nvidia,pi,generalist,flexion,xdof' },
    { key: 'tint', basic: true, label: 'Color', type: 'select', default: 'original', options: [
        { value: 'original', label: 'Original' }, { value: 'white', label: 'All white' }, { value: 'black', label: 'All black' }, { value: 'custom', label: 'Color picker' } ] },
    { key: 'sizeMode', basic: true, label: 'Size matching', type: 'select', default: 'area', options: [
        { value: 'area', label: 'Visual mass (balanced)' }, { value: 'width', label: 'Same width' }, { value: 'height', label: 'Same height' } ] },
    { key: 'logoSize', basic: true, label: 'Logo size (px)',                  type: 'number', default: 320,  min: 60,  max: 1200, step: 10 },
    { key: 'hold', basic: true, label: 'Time each logo stays (ms)',   type: 'number', default: 700,  min: 100, max: 3000, step: 50 },
    { key: 'move', basic: true, label: 'Time to switch logos (ms)',   type: 'number', default: 550,  min: 100, max: 2000, step: 50 },
    { key: 'maskW',    label: 'Window width (px)',                type: 'number', default: 820,  min: 200, max: 1920, step: 20 },
    { key: 'maskH',    label: 'Window height (px)',               type: 'number', default: 220,  min: 80,  max: 1080, step: 20 },
    { key: 'fadePow',  label: 'Edge fade (1 = linear, higher = edges only)', type: 'number', default: 3, min: 0.5, max: 6, step: 0.1 },
    { key: 'curl',     label: '3D tilt (deg)',                    type: 'number', default: 0,    min: 0,   max: 70,   step: 5 },
    { key: 'lead',     label: 'Lead-in (ms)',                     type: 'number', default: 200,  min: 0,   max: 2000, step: 50 },
  ],

  duration(lines, { params: p }) {
    const N = names(p).length;
    return p.lead + N * (p.hold + p.move) - p.move;
  },

  mount(layer, lines, ctx) {
    const p = ctx.params;
    const mask = document.createElement('div');
    mask.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);overflow:hidden;perspective:1400px;width:${p.maskW}px;height:${p.maskH}px`;
    layer.appendChild(mask);
    const tintColor = p.tint === 'white' ? '#ffffff' : p.tint === 'black' ? '#000000' : p.tint === 'custom' ? ctx.style.color : null;
    const els = names(p).map(name => {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;left:50%;top:50%;will-change:transform,opacity;transform-style:preserve-3d;opacity:0';
      const url = `/assets/logos/${encodeURIComponent(name)}.png`;
      const img = new Image(); img.src = url;
      let box;
      if (tintColor) {
        // unified colour: use the logo's alpha as a mask over a flat colour
        box = document.createElement('div');
        box.style.cssText = `background:${tintColor};-webkit-mask:url("${url}") center/100% 100% no-repeat;mask:url("${url}") center/100% 100% no-repeat`;
      } else { box = img; img.style.display = 'block'; }
      d.appendChild(box); mask.appendChild(d);
      return { d, img, box };
    });
    const st = { els, travel: p.maskH / 2 + p.logoSize * 0.3 };
    // wait for decode so the first exported frame (and the measured sizes) are correct
    st.ready = Promise.all(els.map(e => e.img.decode().catch(() => {}))).then(() => {
      const maxW = p.maskW * 0.9, maxH = p.maskH * 0.85;
      els.forEach(e => {
        const nw = e.img.naturalWidth || 1, nh = e.img.naturalHeight || 1, ar = nw / nh;
        let w, h;
        if (p.sizeMode === 'width') { w = p.logoSize; h = w / ar; }
        else if (p.sizeMode === 'height') { h = p.logoSize; w = h * ar; }
        else {
          // equal visual mass: sqrt(w*h) = logoSize, softened so very wide wordmarks don't become giants
          const k = Math.pow(ar, 0.5);
          w = p.logoSize * k; h = p.logoSize / k;
          // extreme aspect ratios: pull toward same-width behaviour a little
          if (ar > 4) { const t = Math.min(1, (ar - 4) / 6); const w2 = p.logoSize * 1.9; w = w * (1 - t) + w2 * t; h = w / ar; }
        }
        // never exceed the window
        const f = Math.min(1, maxW / w, maxH / h); w *= f; h *= f;
        e.box.style.width = w + 'px'; e.box.style.height = h + 'px';
        e.d.style.marginLeft = (-w/2) + 'px'; e.d.style.marginTop = (-h/2) + 'px';
      });
    });
    return st;
  },

  render(st, t, ctx) {
    const p = ctx.params, { clamp01 } = ctx, step = p.hold + p.move;
    st.els.forEach((e, i) => {
      const s = p.lead + i * step;              // moment logo i arrives at centre
      let pos;                                  // -1 below (entering), 0 centre, +1 above (gone)
      if (t < s - p.move) pos = -1;
      else if (t < s) pos = -1 + ease(clamp01((t - (s - p.move)) / p.move));
      else if (t < s + p.hold) pos = 0;
      else if (t < s + p.hold + p.move) pos = ease(clamp01((t - s - p.hold) / p.move));
      else pos = 1;
      const y = -pos * st.travel;
      const op = 1 - Math.pow(Math.abs(pos), p.fadePow);
      e.d.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) rotateX(${(-pos * p.curl).toFixed(2)}deg)`;
      e.d.style.opacity = clamp01(op).toFixed(3);
    });
  },
});

function names(p){ return String(p.logos || '').split(',').map(s => s.trim()).filter(Boolean); }

// Easing from the AE speed graph: velocity ramps up very fast (peak at ~8% of the move), then
// decays exponentially to zero. Integrated into a position curve.
const ease = (() => {
  const PEAK = 0.08, TAU = 0.22, n = 400, v = [], pos = [0];
  for (let i = 0; i <= n; i++) { const x = i / n; v.push(x < PEAK ? Math.sin((x / PEAK) * Math.PI / 2) : Math.exp(-(x - PEAK) / TAU)); }
  for (let i = 1; i <= n; i++) pos.push(pos[i - 1] + (v[i - 1] + v[i]) / 2);
  const tot = pos[n], tbl = pos.map(q => q / tot);
  return x => { x = Math.max(0, Math.min(1, x)); const f = x * n, i = Math.floor(f), k = f - i; return i >= n ? 1 : tbl[i] * (1 - k) + tbl[i + 1] * k; };
})();
})();
