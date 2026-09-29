/* rayforge _probe.js — structural inspection of the delivered index.html. Author: 晨星 */
const fs = require('fs');
const path = require('path');

var pass = 0, fails = [];
function ok(name, cond, detail) { if (cond) pass++; else fails.push(name + (detail ? ' — ' + detail : '')); }

var file = path.join(__dirname, 'index.html');
ok('index.html 存在', fs.existsSync(file));
var html = fs.readFileSync(file, 'utf8');
ok('非空', html.length > 1000, html.length + ' bytes');
ok('含 <!DOCTYPE html>', /^<!DOCTYPE html>/i.test(html));
ok('含 <canvas', /<canvas/i.test(html));
ok('canvas 含 id="view"', /id="view"/i.test(html));
ok('含 globalThis.RAY', /globalThis\.RAY/.test(html));
ok('含 globalThis.__RAYUI', /globalThis\.__RAYUI/.test(html));
ok('含 <style', /<style/i.test(html));
ok('含 </style>', /<\/style>/i.test(html));
ok('含 <script', /<script/i.test(html));
ok('含 </script>', /<\/script>/i.test(html));
// balanced script tags (open vs close)
var open = (html.match(/<script/gi) || []).length;
var close = (html.match(/<\/script>/gi) || []).length;
ok('script 标签配平', open === close, 'open=' + open + ' close=' + close);
// control ids present
['res', 'samples', 'depth', 'seed', 'prog', 'render', 'runchecks', 'checks'].forEach(function (id) {
  ok('控制项 #' + id + ' 存在', new RegExp('id="' + id + '"').test(html));
});
ok('含 作者 晨星', /晨星/.test(html));
ok('零外部依赖（无 src= http）', !/src\s*=\s*["']https?:/i.test(html));
ok('零外部依赖（无 <link）', !/<link/i.test(html));
ok('无未闭合关键块（body/html）', /<\/body>/i.test(html) && /<\/html>/i.test(html));
// token counts
ok('RAISE: RAY.renderTile 被引用', /renderTile/.test(html));
ok('RAISE: srgbEncode 被引用', /srgbEncode/.test(html));
ok('RAISE: runChecks 被引用', /runChecks/.test(html));

console.log('PROBE pass=' + pass + ' fail=' + fails.length);
if (fails.length) { fails.forEach(function (f) { console.log('  FAIL ' + f); }); process.exit(1); }
console.log('PROBE ALL GREEN ✅');
