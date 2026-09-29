/* rayforge _uicheck.js — run the delivered index.html UI in a minimal DOM stub. Author: 晨星 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

var pass = 0, fails = [];
function ok(name, cond, detail) { if (cond) pass++; else fails.push(name + (detail ? ' — ' + detail : '')); }

var html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
var scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).map(function (m) { return m[1]; });
ok('提取到脚本块', scripts.length >= 2, 'blocks=' + scripts.length);

// ---- DOM stub ----
var defaults = { res: '480x360', samples: '1', depth: '3', seed: '7' };
var cache = {};
var ctxStub = {
  _put: 0,
  createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
  putImageData: function () { ctxStub._put++; },
  getImageData: function () { return null; }
};
function makeEl(id) {
  var handlers = {};
  return {
    id: id, style: {}, value: defaults[id] !== undefined ? defaults[id] : '',
    checked: id === 'prog', textContent: '', innerHTML: '', className: '',
    width: 0, height: 0, children: [],
    addEventListener: function (ev, cb) { (handlers[ev] = handlers[ev] || []).push(cb); },
    appendChild: function (c) { this.children.push(c); },
    getContext: function () { return ctxStub; },
    _handlers: handlers
  };
}
var documentStub = {
  readyState: 'complete',
  addEventListener: function () {},
  getElementById: function (id) { return cache[id] || (cache[id] = makeEl(id)); },
  createElement: function () { return makeEl('div'); }
};
var rafQ = [], toQ = [];
var sandbox = {
  document: documentStub,
  console: console,
  requestAnimationFrame: function (cb) { rafQ.push(cb); },
  setTimeout: function (cb) { toQ.push(cb); }
};

var threw = null;
try {
  vm.createContext(sandbox);
  vm.runInContext(scripts[0], sandbox, { filename: 'engine.js' });
  vm.runInContext(scripts[1], sandbox, { filename: 'ui.js' });
  // flush deferred startRender, then pump animation frames
  toQ.splice(0).forEach(function (cb) { cb(); });
  var frames = 0;
  while (rafQ.length && frames < 80) { var cb = rafQ.shift(); cb(); frames++; }
} catch (e) { threw = e; }

ok('加载+挂载无异常', !threw, threw ? (threw.message) : '');
ok('globalThis.RAY 暴露', !!sandbox.RAY);
ok('globalThis.__RAYUI 暴露', !!sandbox.__RAYUI);
ok('__RAYUI.mount 为函数', sandbox.__RAYUI && typeof sandbox.__RAYUI.mount === 'function');
ok('__RAYUI.startRender 为函数', sandbox.__RAYUI && typeof sandbox.__RAYUI.startRender === 'function');
ok('__RAYUI.runChecksUI 为函数', sandbox.__RAYUI && typeof sandbox.__RAYUI.runChecksUI === 'function');
ok('state 存在', !!(sandbox.__RAYUI && sandbox.__RAYUI.state));
var st = sandbox.__RAYUI ? sandbox.__RAYUI.state : {};
ok('canvas 宽度设为 480', cache['view'] && cache['view'].width === 480, 'w=' + (cache['view'] && cache['view'].width));
ok('tile 网格已计算 (total>0)', st.total > 0, 'total=' + st.total);
ok('total == tilesX*tilesY', st.total === st.tilesX * st.tilesY);
ok('渐进式渲染默认开启', st.progressive === true);
ok('主动渲染推进 (done>0)', st.done > 0, 'done=' + st.done);
ok('采样计数累加 (samplesDone>0)', st.samplesDone > 0, 'samplesDone=' + st.samplesDone);
ok('requestAnimationFrame 被调度', frames > 0, 'frames=' + frames);
ok('putImageData 被调用', ctxStub._put > 0, 'put=' + ctxStub._put);
ok('自检面板填充 14 项', cache['checks'] && cache['checks'].children.length === 14, 'n=' + (cache['checks'] && cache['checks'].children.length));
ok('自检汇总含“通过”', cache['check-sum'] && /通过/.test(cache['check-sum'].textContent), cache['check-sum'] && cache['check-sum'].textContent);
// simulate render button click → must not throw
var clickThrew = null;
try { if (cache['render'] && cache['render']._handlers.click) cache['render']._handlers.click[0](); }
catch (e) { clickThrew = e; }
ok('点击“渲染”按钮无异常', !clickThrew, clickThrew ? clickThrew.message : '');

console.log('UICHECK pass=' + pass + ' fail=' + fails.length);
if (fails.length) { fails.forEach(function (f) { console.log('  FAIL ' + f); }); process.exit(1); }
console.log('UICHECK ALL GREEN ✅');
