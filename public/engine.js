/* Text-motion engine — runs inside stage.html (preview iframe and headless export).
 *
 * Effect contract (see effects/*.js):
 *   TM.register({
 *     id, name,
 *     params: [{ key, label, type:'number'|'select'|'boolean', default, min, max, step, options }],
 *     duration(lines, ctx)      -> ms of the effect itself (holds are added by the engine)
 *     mount(root, lines, ctx)   -> state  (build DOM inside root; root is the #text element)
 *     render(state, t, ctx)     -> draw frame at t ms (0..duration; t may be clamped)
 *   })
 * ctx = { style, params, rng(seed), ease helpers }
 */
window.TM = (() => {
  const effects = {};
  const E = {
    easeOut: x => 1 - Math.pow(1 - x, 3),
    easeInOut: x => x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3) / 2,
    smooth: x => x*x*(3 - 2*x),
    clamp01: x => Math.max(0, Math.min(1, x)),
    rng(seed){ let s = seed >>> 0; return () => (s = (s*1664525 + 1013904223) >>> 0) / 4294967296; },
  };

  const DEFAULT_STYLE = {
    font: 'Archivo', weight: 400, width: 100, italic: false,
    size: 260, tracking: -0.016, leading: 0.62, color: '#ffffff',
    anchor: 'top-left', x: 120, y: 120, align: 'left',
  };
  // exit: 'none' | 'reverse' — plays the effect backwards after `hold` ms on screen (letters that
  // faded in fade out, typed text un-types, dropped words lift back up). exitSpeed scales the reverse.
  const DEFAULT_TIMING = { preHold: 80, endHold: 2000, exit: 'none', hold: 1500, exitSpeed: 1 };

  let cfg = null, state = null, def = null, total = 0, gfx = null;
  let playing = false, startTs = null, raf = null, pausedAt = 0;
  const stage = document.getElementById('stage');
  const root  = document.getElementById('text');

  // All sizes in the UI are defined on a 1080p reference frame and scaled to the export size,
  // so FHD and 4K exports look identical (4K is just sharper). scale = shorter side / 1080.
  function applyStyle(s, k){
    const st = { ...DEFAULT_STYLE, ...s };
    st.size = st.size * k; st.x = st.x * k; st.y = st.y * k;
    root.style.fontFamily = `"${st.font}", sans-serif`;
    root.style.fontWeight = st.weight;
    root.style.fontStretch = st.width + '%';
    root.style.fontStyle = st.italic ? 'italic' : 'normal';
    root.style.fontSize = st.size + 'px';
    root.style.letterSpacing = st.tracking + 'em';
    root.style.lineHeight = st.leading;
    root.style.color = st.color;
    root.style.textAlign = st.align;
    // anchor: place text box in a 3x3 grid, offset by x/y
    const [v, h] = st.anchor.split('-');           // top|center|bottom, left|center|right
    root.style.top = root.style.bottom = root.style.left = root.style.right = 'auto';
    root.style.transform = '';
    if (v === 'top') root.style.top = st.y + 'px';
    else if (v === 'bottom') root.style.bottom = st.y + 'px';
    else { root.style.top = '50%'; root.style.transform = 'translateY(-50%)'; }
    if (h === 'left') root.style.left = st.x + 'px';
    else if (h === 'right') root.style.right = st.x + 'px';
    else { root.style.left = '50%'; root.style.transform += ' translateX(-50%)'; }
    return st;
  }

  // "Middle" should centre the visible letters, not the CSS boxes: with a tight line-height the box
  // is shorter than the glyphs and descenders push the ink off-centre. After mounting, measure where
  // the first line's ink top and the last line's ink bottom actually are and nudge the box.
  const _cv = document.createElement('canvas').getContext('2d');
  function centreInk(st){
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
      let first = walker.nextNode(), last = first, n; while ((n = walker.nextNode())) last = n;
      if (!first) return;
      const rng = document.createRange(); rng.selectNodeContents(first); const r1 = rng.getBoundingClientRect();
      rng.selectNodeContents(last); const rN = rng.getBoundingClientRect();
      _cv.font = `${st.italic ? 'italic ' : ''}${st.weight} ${st.size}px "${st.font}"`;
      const em = _cv.measureText('Hxg'), fAsc = em.fontBoundingBoxAscent ?? st.size * 0.8;
      const lineText = node => (node.parentElement.closest('.l') || node.parentElement).textContent || 'x';
      const inkTop = r1.top + fAsc - (_cv.measureText(lineText(first)).actualBoundingBoxAscent ?? fAsc);
      const inkBottom = rN.top + fAsc + (_cv.measureText(lineText(last)).actualBoundingBoxDescent ?? 0);
      const box = root.getBoundingClientRect();
      const dy = (box.top + box.height / 2) - (inkTop + inkBottom) / 2;
      root.style.transform = root.style.transform.replace('translateY(-50%)', `translateY(calc(-50% + ${dy.toFixed(1)}px))`);
    } catch {}
  }

  function load(config){
    cfg = config;
    def = effects[cfg.effect];
    if (!def) throw new Error('unknown effect ' + cfg.effect);
    stage.style.width = cfg.width + 'px';
    stage.style.height = cfg.height + 'px';
    stage.style.background = cfg.bg && cfg.bg !== 'transparent' ? cfg.bg : 'transparent';
    const k = Math.min(cfg.width, cfg.height) / 1080;
    const style = applyStyle(cfg.style || {}, k);
    const params = {};
    def.params.forEach(p => { params[p.key] = (cfg.params && cfg.params[p.key] !== undefined) ? cfg.params[p.key] : p.default; });
    const timing = { ...DEFAULT_TIMING, ...(cfg.timing || {}) };
    const lines = (cfg.text || '').replace(/\r/g,'').split('\n');
    const ctx = { style, params, timing, stage, width: cfg.width / k, height: cfg.height / k, scale: k, fps: +cfg.fps || 30, kind: def.kind || 'text', ...E };
    root.innerHTML = '';
    // graphic effects draw on a full-stage layer instead of the positioned text box
    if (gfx) { gfx.remove(); gfx = null; }
    root.style.display = def.kind === 'graphic' ? 'none' : '';
    if (def.kind === 'graphic') { gfx = document.createElement('div'); gfx.id = 'gfx'; gfx.style.cssText = `position:absolute;left:0;top:0;width:${cfg.width / k}px;height:${cfg.height / k}px;overflow:hidden;transform-origin:0 0;transform:scale(${k})`; stage.appendChild(gfx); ctx.layer = gfx; }
    state = def.mount(def.kind === 'graphic' ? gfx : root, lines, ctx);
    if (def.kind !== 'graphic' && style.anchor.split('-')[0] === 'center') centreInk(style);
    state.__ctx = ctx;
    // global speed: >1 plays the effect faster (holds are not affected). Same in preview and export.
    state.__speed = Math.max(0.05, +cfg.speed || 1);
    state.__dur = def.duration(lines, ctx) / state.__speed;
    state.__exit = timing.exit === 'reverse';
    state.__outDur = state.__exit ? state.__dur / Math.max(0.1, +timing.exitSpeed || 1) : 0;
    total = timing.preHold + state.__dur + (state.__exit ? timing.hold + state.__outDur : 0) + timing.endHold;
    stop();
    renderAt(0);
    return total;
  }

  function renderAt(t){
    if (!state) return;
    const ctx = state.__ctx;
    let local = Math.max(0, Math.min(state.__dur, t - ctx.timing.preHold));
    if (state.__exit) {
      const outStart = ctx.timing.preHold + state.__dur + ctx.timing.hold;
      if (t >= outStart) local = Math.max(0, state.__dur - Math.min(state.__outDur, t - outStart) * (state.__dur / state.__outDur));
    }
    def.render(state, local * state.__speed, ctx);
    post({ evt: 'time', t, total });
  }

  function frame(ts){
    if (startTs === null) startTs = ts - pausedAt;
    const t = ts - startTs;
    if (t >= total) { renderAt(total); playing = false; pausedAt = total; post({ evt: 'ended' }); return; }
    renderAt(t);
    raf = requestAnimationFrame(frame);
  }
  function play(from){ stop(); pausedAt = from ?? 0; playing = true; startTs = null; raf = requestAnimationFrame(frame); }
  function stop(){ if (raf) cancelAnimationFrame(raf); raf = null; playing = false; }
  function seek(t){ stop(); pausedAt = t; renderAt(t); }

  function post(msg){ if (window.parent !== window) window.parent.postMessage({ tm: true, ...msg }, '*'); }

  window.addEventListener('message', e => {
    const m = e.data; if (!m || !m.tm) return;
    if (m.cmd === 'load') { const tot = load(m.config); ready().then(() => { renderAt(0); post({ evt: 'loaded', total: tot, effects: list() }); if (m.autoplay) play(0); }); }
    else if (m.cmd === 'play') play(m.from ?? 0);
    else if (m.cmd === 'pause') stop();
    else if (m.cmd === 'seek') seek(m.t);
    else if (m.cmd === 'list') post({ evt: 'effects', effects: list() });
  });

  function list(){ return Object.values(effects).map(d => ({ id: d.id, name: d.name, desc: d.desc || '', kind: d.kind || 'text', params: d.params })); }
  function ready(){ return state && state.ready ? state.ready : Promise.resolve(); }

  return {
    register(d){ effects[d.id] = d; },
    load, play, stop, seek, list, ready,
    get total(){ return total; },
    get config(){ return cfg; },
    ...E,
  };
})();
