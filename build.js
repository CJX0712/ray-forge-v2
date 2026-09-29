/* rayforge build — inline _style.css + _engine.js + _ui.js into a single index.html. Author: 晨星 */
const fs = require('fs');
const path = require('path');
const dir = __dirname;

const css = fs.readFileSync(path.join(dir, '_style.css'), 'utf8');
const engine = fs.readFileSync(path.join(dir, '_engine.js'), 'utf8');
const ui = fs.readFileSync(path.join(dir, '_ui.js'), 'utf8');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>rayforge · 纯 JS CPU 光线追踪</title>
<style>
${css}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>rayforge ✦ 纯 JS CPU 光线追踪</h1>
    <p>Whitted 风格 · 解析求交 · 反射 / 折射 / Fresnel · 多重采样 AA · 零依赖单文件 · 作者 晨星</p>
  </header>
  <div class="panel">
    <div class="controls">
      <label class="ctl">分辨率<select id="res">
        <option value="320x240">320 × 240</option>
        <option value="480x360" selected>480 × 360</option>
        <option value="640x480">640 × 480</option>
      </select></label>
      <label class="ctl">采样<select id="samples">
        <option value="1" selected>1×</option>
        <option value="4">4×</option>
        <option value="16">16×</option>
        <option value="64">64×</option>
      </select></label>
      <label class="ctl">递归深度<select id="depth">
        <option value="0">0</option><option value="1">1</option>
        <option value="2">2</option><option value="3" selected>3</option>
        <option value="4">4</option><option value="5">5</option>
      </select></label>
      <label class="ctl">种子<input id="seed" type="number" value="7" style="width:80px"/></label>
      <label class="ctl">渐进式<input id="prog" type="checkbox" checked/></label>
      <button id="render">渲染</button>
      <button id="runchecks" class="ghost">运行自检</button>
    </div>
    <canvas id="view" width="480" height="360"></canvas>
    <div class="stats">
      <span>进度 <b id="stat-prog">0%</b></span>
      <span>已采样 <b id="stat-samples">0</b></span>
      <span>用时 <b id="stat-time">0.00s</b></span>
    </div>
  </div>
  <div class="panel">
    <div class="sum" id="check-sum">—</div>
    <div id="checks"></div>
  </div>
  <footer>rayforge · 引擎与界面零依赖 · <code>globalThis.RAY</code> 暴露纯函数 API</footer>
</div>
<script>
${engine}
</script>
<script>
${ui}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(dir, 'index.html'), html);
console.log('built index.html', html.length, 'bytes');
