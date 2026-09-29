/* rayforge _smoke.js — engine invariant suite (≥27 assertions). Runs the real engine via require. Author: 晨星 */
const R = require('./_engine.js');

var pass = 0, fails = [];
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fails.push(name + (detail ? ' — ' + detail : '')); }
}
function eqArr(a, b, tol) {
  tol = tol || 1e-12;
  if (!a || !b || a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > tol) return false;
  return true;
}

// --- vec3 library (1-14) ---
ok('RAY 存在', !!R);
ok('VERSION=1.0.0', R.VERSION === '1.0.0', R.VERSION);
ok('v3 构造', eqArr(R.v3(1, 2, 3), [1, 2, 3]));
ok('add', eqArr(R.add([1, 2, 3], [4, 5, 6]), [5, 7, 9]));
ok('sub', eqArr(R.sub([4, 5, 6], [1, 2, 3]), [3, 3, 3]));
ok('mul 标量', eqArr(R.mul([1, 2, 3], 2), [2, 4, 6]));
ok('mulv 逐元', eqArr(R.mulv([1, 2, 3], [4, 5, 6]), [4, 10, 18]));
ok('dot 正交=0', R.dot([1, 0, 0], [0, 1, 0]) === 0);
ok('cross 基', eqArr(R.cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]));
ok('len(3,4,0)=5', R.len([3, 4, 0]) === 5);
ok('norm(0,5,0)=(0,1,0)', eqArr(R.norm([0, 5, 0]), [0, 1, 0]));
ok('reflect 关于法线', eqArr(R.reflect([0, -1, 0], [0, 1, 0]), [0, 1, 0]));
ok('reflect 长度不变', Math.abs(R.len(R.reflect([0.6, -0.8, 0], [0, 1, 0])) - 1) < 1e-12);
ok('refract TIR→null', R.refract([0.8, -0.6, 0], [0, 1, 0], 1.5) === null);
ok('fresnel 正入射=r0', Math.abs(R.fresnelSchlick(1, 1, 1.5) - Math.pow((1 - 1.5) / (1 + 1.5), 2)) < 1e-12);

// --- gamma (15-18) ---
ok('srgbEncode(0)=0', R.srgbEncode(0) === 0);
ok('srgbDecode(0)=0', R.srgbDecode(0) === 0);
ok('srgb 往返闭合', Math.abs(R.srgbDecode(R.srgbEncode(0.5)) - 0.5) < 1e-12);
ok('srgbEncode(1)≈1', Math.abs(R.srgbEncode(1) - 1) < 1e-12);

// --- geometry (19-22) ---
// ray (0,0,5)->(0,0,-1) hits unit sphere at t=4
ok('intersectSphere 已知 t=4', R.intersectSphere([0, 0, 5], [0, 0, -1], [0, 0, 0], 1) === 4);
ok('intersectSphere 脱靶→null', R.intersectSphere([0, 5, 0], [0, 0, -1], [0, 0, 0], 1) === null);
// plane y=0 from (0,1,0) dir (0,-1,0) → t=1
ok('intersectPlane 已知 t=1', R.intersectPlane([0, 1, 0], [0, -1, 0], [0, 0, 0], [0, 1, 0]) === 1);
ok('intersectPlane 平行→null', R.intersectPlane([0, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]) === null);

// --- scene / render (23-30) ---
ok('defaultScene 5 物体', R.defaultScene().objects.length === 5);
ok('defaultScene 2 灯', R.defaultScene().lights.length === 2);
var rf = R.renderFull(R.defaultScene(), R.defaultCamera(), 64, 48, { samples: 1, maxDepth: 3, seed: 7 });
ok('renderFull linear 长度 W*H*3', rf.linear.length === 64 * 48 * 3);
ok('renderFull bytes 长度 W*H*4', rf.bytes.length === 64 * 48 * 4);
ok('toBytes 返回 Uint8ClampedArray', rf.bytes.constructor.name === 'Uint8ClampedArray');
ok('renderFull 字节全在 0..255', (function () {
  for (var i = 0; i < rf.bytes.length; i++) if (rf.bytes[i] < 0 || rf.bytes[i] > 255) return false;
  return true;
})());
// determinism (same seed equal, different seed differs)
var rA = R.renderFull(R.defaultScene(), R.defaultCamera(), 48, 36, { samples: 4, maxDepth: 2, seed: 7 });
var rB = R.renderFull(R.defaultScene(), R.defaultCamera(), 48, 36, { samples: 4, maxDepth: 2, seed: 7 });
var rC = R.renderFull(R.defaultScene(), R.defaultCamera(), 48, 36, { samples: 4, maxDepth: 2, seed: 8 });
var same = true, diff = false;
for (var i = 0; i < rA.linear.length; i++) { if (rA.linear[i] !== rB.linear[i]) same = false; if (rA.linear[i] !== rC.linear[i]) diff = true; }
ok('renderFull 同种子一致', same);
ok('renderFull 异种子不同', diff);
ok('camRay 中心≈forward', Math.abs(R.dot(R.camRay(R.defaultCamera(), 320, 240, 640, 480).d, R.norm(R.sub(R.defaultCamera().lookAt, R.defaultCamera().pos)))) - 1 < 1e-12);
ok('hitScene 命中返回物体', !!R.hitScene(R.defaultScene(), [0, 1.2, 4.2], [0, -0.1, -1]));
ok('trace 返回有限三通道', (function () {
  var c = R.trace(R.defaultScene(), [0, 1.2, 4.2], [0, -0.1, -1], 0, 3);
  return c.length === 3 && c.every(isFinite);
})());
ok('inShadow 遮挡=true', R.inShadow({ objects: [{ type: 'sphere', c: [0, 0, 0], r: 0.5, color: [1, 1, 1], kr: 0 }], lights: [{ p: [0, 5, 0] }] }, [0, -1, 0], [0, 5, 0]) === true);
ok('inShadow 无遮挡=false', R.inShadow({ objects: [{ type: 'sphere', c: [0, 0, 0], r: 0.5, color: [1, 1, 1], kr: 0 }], lights: [{ p: [0, 5, 0] }] }, [3, -1, 0], [0, 5, 0]) === false);
// runChecks green (30-31)
var ch = R.runChecks();
ok('runChecks 总数=14', ch.length === 14, 'got ' + ch.length);
ok('runChecks 全绿', ch.every(function (c) { return c.ok; }), ch.filter(function (c) { return !c.ok; }).map(function (c) { return c.name; }).join('; '));

console.log('SMOKE pass=' + pass + ' fail=' + fails.length);
if (fails.length) { fails.forEach(function (f) { console.log('  FAIL ' + f); }); process.exit(1); }
console.log('SMOKE ALL GREEN ✅');
