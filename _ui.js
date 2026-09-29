/* rayforge UI — progressive tile renderer + self-check panel. DOM-based.
   Auto-mounts when a real #view canvas is present. Exposes globalThis.__RAYUI. Author: 晨星 */
(function (root) {
  'use strict';

  var RAY = root.RAY;
  function el(id) { return document.getElementById(id); }
  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  var TILE = 32;

  var state = {
    W: 480, H: 360, samples: 1, maxDepth: 3, seed: 7, progressive: true,
    rendering: false, cancel: false,
    linear: null, img: null, ctx: null,
    tilesX: 0, tilesY: 0, total: 0, cursor: 0, done: 0,
    t0: 0, samplesDone: 0
  };

  function setRes(W, H) {
    state.W = W; state.H = H;
    var cv = el('view');
    if (cv) { cv.width = W; cv.height = H; }
    if (!state.ctx && cv) state.ctx = cv.getContext('2d');
    if (state.ctx && !state.img) state.img = state.ctx.createImageData(W, H);
    if (!state.img) state.img = { data: new Uint8ClampedArray(W * H * 4), width: W, height: H };
    state.linear = new Float64Array(W * H * 3);
    state.tilesX = Math.ceil(W / TILE);
    state.tilesY = Math.ceil(H / TILE);
  }

  function scene() { return RAY.defaultScene(); }
  function cam() { return RAY.defaultCamera(); }

  function writeTile(tile, x0, y0, w, h) {
    for (var ly = 0; ly < h; ly++) {
      for (var lx = 0; lx < w; lx++) {
        var si = (ly * w + lx) * 3;
        var gi = ((y0 + ly) * state.W + (x0 + lx)) * 3;
        var di = ((y0 + ly) * state.W + (x0 + lx)) * 4;
        var r = state.linear[gi] = tile[si];
        var g = state.linear[gi + 1] = tile[si + 1];
        var b = state.linear[gi + 2] = tile[si + 2];
        state.img.data[di] = Math.round(255 * clamp01(RAY.srgbEncode(r)));
        state.img.data[di + 1] = Math.round(255 * clamp01(RAY.srgbEncode(g)));
        state.img.data[di + 2] = Math.round(255 * clamp01(RAY.srgbEncode(b)));
        state.img.data[di + 3] = 255;
      }
    }
  }

  function updateStats() {
    var pct = state.total ? (100 * state.done / state.total) : 0;
    if (el('stat-prog')) el('stat-prog').textContent = pct.toFixed(1) + '%';
    if (el('stat-samples')) el('stat-samples').textContent = String(state.samplesDone);
    if (el('stat-time')) el('stat-time').textContent = ((Date.now() - state.t0) / 1000).toFixed(2) + 's';
  }

  function tileLoop() {
    if (state.cancel) { state.rendering = false; return; }
    var budget = state.progressive ? 1 : 80;
    var processed = 0;
    while (state.cursor < state.total && processed < budget) {
      var idx = state.cursor;
      var tx = idx % state.tilesX, ty = Math.floor(idx / state.tilesX);
      var x0 = tx * TILE, y0 = ty * TILE;
      var w = Math.min(TILE, state.W - x0), h = Math.min(TILE, state.H - y0);
      var tile = RAY.renderTile(scene(), cam(), x0, y0, w, h, state.W, state.H,
        { samples: state.samples, maxDepth: state.maxDepth, seed: state.seed });
      writeTile(tile, x0, y0, w, h);
      state.cursor++; state.done++; processed++;
      state.samplesDone += w * h * state.samples;
    }
    if (state.ctx && state.img) state.ctx.putImageData(state.img, 0, 0);
    updateStats();
    if (state.cursor < state.total) {
      root.requestAnimationFrame(tileLoop);
    } else {
      state.rendering = false;
      if (el('stat-time')) el('stat-time').textContent = ((Date.now() - state.t0) / 1000).toFixed(2) + 's';
    }
  }

  function startRender() {
    if (state.rendering) { state.cancel = true; }
    // allow the in-flight loop to stop, then restart next tick
    root.setTimeout(function () {
      state.cancel = false; state.rendering = true;
      state.done = 0; state.samplesDone = 0; state.cursor = 0;
      state.total = state.tilesX * state.tilesY;
      state.t0 = Date.now();
      root.requestAnimationFrame(tileLoop);
    }, 0);
  }

  function runChecksUI() {
    var res = RAY.runChecks();
    var box = el('checks');
    if (box) {
      box.innerHTML = '';
      res.forEach(function (c) {
        var d = document.createElement('div');
        d.className = 'chk ' + (c.ok ? 'ok' : 'bad');
        d.textContent = (c.ok ? '✅ ' : '⚠️ ') + c.name + (c.detail ? (' — ' + c.detail) : '');
        box.appendChild(d);
      });
    }
    if (el('check-sum')) {
      var pass = res.filter(function (c) { return c.ok; }).length;
      el('check-sum').textContent = pass + '/' + res.length + ' 通过';
    }
    return res;
  }

  function mount() {
    if (!el('view')) return;
    setRes(480, 360);
    function onRes() {
      var v = el('res').value.split('x');
      setRes(+v[0], +v[1]);
    }
    el('res').addEventListener('change', function () { onRes(); startRender(); });
    el('samples').addEventListener('change', function () { state.samples = +el('samples').value; startRender(); });
    el('depth').addEventListener('change', function () { state.maxDepth = +el('depth').value; startRender(); });
    el('seed').addEventListener('change', function () { state.seed = +el('seed').value; startRender(); });
    el('prog').addEventListener('change', function () { state.progressive = el('prog').checked; });
    el('render').addEventListener('click', startRender);
    el('runchecks').addEventListener('click', runChecksUI);
    onRes();
    startRender();
    runChecksUI();
  }

  var API = { mount: mount, startRender: startRender, runChecksUI: runChecksUI, state: state };
  root.__RAYUI = API;

  if (typeof document !== 'undefined' && document.getElementById && document.getElementById('view')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
