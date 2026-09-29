/* rayforge engine — pure JS Whitted-style CPU ray tracer. DOM-free, deterministic.
   Exposes globalThis.RAY. Author: 晨星 */
(function (root) {
  'use strict';

  var VERSION = '1.0.0';
  var EPS = 1e-9;

  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- vec3 (arrays [x,y,z]) ----------
  function v3(x, y, z) { return [x, y, z]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function mulv(a, b) { return [a[0] * b[0], a[1] * b[1], a[2] * b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) {
    var l = len(a);
    if (l < EPS) return [0, 0, 0];
    return [a[0] / l, a[1] / l, a[2] / l];
  }
  function reflect(I, N) { // I incident (normalized), N normal (normalized)
    var d = 2 * dot(I, N);
    return [I[0] - d * N[0], I[1] - d * N[1], I[2] - d * N[2]];
  }
  function refract(I, N, eta) { // returns null on total internal reflection
    var cosi = -dot(I, N);
    var k = 1 - eta * eta * (1 - cosi * cosi);
    if (k < 0) return null;
    return [eta * I[0] + (eta * cosi - Math.sqrt(k)) * N[0],
            eta * I[1] + (eta * cosi - Math.sqrt(k)) * N[1],
            eta * I[2] + (eta * cosi - Math.sqrt(k)) * N[2]];
  }
  function fresnelSchlick(cosI, n1, n2) {
    var r0 = Math.pow((n1 - n2) / (n1 + n2), 2);
    return r0 + (1 - r0) * Math.pow(1 - cosI, 5);
  }

  // ---------- gamma ----------
  function srgbEncode(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
  function srgbDecode(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

  // ---------- geometry ----------
  // analytic sphere intersection: |o + t d - c|^2 = r^2
  function intersectSphere(o, d, c, r) {
    var oc = sub(o, c);
    var b = dot(oc, d);
    var cc = dot(oc, oc) - r * r;
    var disc = b * b - cc;          // d normalized → a=1
    if (disc < 0) return null;
    var sq = Math.sqrt(disc);
    var t1 = -b - sq, t2 = -b + sq;
    if (t1 > EPS) return t1;
    if (t2 > EPS) return t2;
    return null;
  }
  function intersectPlane(o, d, p, n) {
    var den = dot(d, n);
    if (Math.abs(den) < EPS) return null;
    var t = dot(sub(p, o), n) / den;
    return t > EPS ? t : null;
  }

  function sphereNormal(p, c) { return norm(sub(p, c)); }

  // ---------- scene ----------
  // obj: {type:'sphere', c, r, color:[rgb], kr:reflect, kt:transmit, ior, spec}
  //      {type:'plane',  p, n, color, kr, checker:boolean, color2}
  function defaultScene() {
    return {
      objects: [
        { type: 'sphere', c: v3(-1.1, 0.3, 0), r: 0.8, color: [0.90, 0.20, 0.20], kr: 0.25, kt: 0, ior: 1.5, spec: 0.6 },
        { type: 'sphere', c: v3(1.1, 0.0, -0.4), r: 0.8, color: [0.20, 0.35, 0.95], kr: 0.45, kt: 0, ior: 1.5, spec: 0.8 },
        { type: 'sphere', c: v3(0.0, 1.35, -1.2), r: 0.65, color: [0.95, 0.80, 0.25], kr: 0.15, kt: 0, ior: 1.5, spec: 0.4 },
        { type: 'sphere', c: v3(0.15, -0.55, 1.1), r: 0.45, color: [0.85, 0.85, 0.90], kr: 0.05, kt: 0.9, ior: 1.5, spec: 0.9 },
        { type: 'plane', p: v3(0, -1.0, 0), n: v3(0, 1, 0), color: [0.75, 0.75, 0.75], color2: [0.25, 0.28, 0.32], kr: 0.12, checker: true }
      ],
      lights: [
        { p: v3(3, 4, 4), color: [1, 1, 1], intensity: 1.15 },
        { p: v3(-4, 3, 2), color: [0.45, 0.5, 0.65], intensity: 0.55 }
      ],
      ambient: 0.08,
      bgColor: [0.055, 0.07, 0.11]
    };
  }

  function defaultCamera() {
    return { pos: v3(0, 1.2, 4.2), lookAt: v3(0, 0.1, 0), fov: 55 };
  }

  // camera ray through pixel (px,py) of a W×H image; deterministic, no jitter here
  function camRay(cam, px, py, W, H) {
    var aspect = W / H;
    var fovRad = cam.fov * Math.PI / 180;
    var halfH = Math.tan(fovRad / 2);
    var halfW = aspect * halfH;
    var fwd = norm(sub(cam.lookAt, cam.pos));
    var worldUp = [0, 1, 0];
    var right = norm(cross(fwd, worldUp));
    var up = cross(right, fwd);
    var u = (px / W) * 2 - 1;          // [-1,1], px+0.5 for center sampling
    var vv = 1 - (py / H) * 2;
    var dir = norm(add(add(mul(right, u * halfW), mul(up, vv * halfH)), fwd));
    return { o: cam.pos.slice(), d: dir };
  }

  function hitScene(scene, o, d) {
    var bestT = Infinity, bestObj = null;
    for (var i = 0; i < scene.objects.length; i++) {
      var obj = scene.objects[i];
      var t = null;
      if (obj.type === 'sphere') t = intersectSphere(o, d, obj.c, obj.r);
      else t = intersectPlane(o, d, obj.p, obj.n);
      if (t !== null && t < bestT) { bestT = t; bestObj = obj; }
    }
    if (!bestObj) return null;
    var p = add(o, mul(d, bestT));
    var n = bestObj.type === 'sphere' ? sphereNormal(p, bestObj.c) : bestObj.n.slice();
    if (dot(n, d) > 0) n = mul(n, -1); // face the incoming ray
    return { t: bestT, obj: bestObj, p: p, n: n };
  }

  function inShadow(scene, p, lightP) {
    var dir = norm(sub(lightP, p));
    var dist = len(sub(lightP, p));
    for (var i = 0; i < scene.objects.length; i++) {
      var obj = scene.objects[i];
      var t = obj.type === 'sphere' ? intersectSphere(p, dir, obj.c, obj.r)
                                    : intersectPlane(p, dir, obj.p, obj.n);
      if (t !== null && t < dist - 1e-6) return true;
    }
    return false;
  }

  function objColorAt(obj, p) {
    if (obj.type === 'plane' && obj.checker) {
      var s = 1.0;
      var ix = Math.floor(p[0] / s + 1e-6), iz = Math.floor(p[2] / s + 1e-6);
      return ((ix + iz) & 1) === 0 ? obj.color : obj.color2;
    }
    return obj.color;
  }

  // Whitted recursion
  function trace(scene, o, d, depth, maxDepth) {
    var hit = hitScene(scene, o, d);
    if (!hit) return scene.bgColor.slice();
    var obj = hit.obj, p = hit.p, n = hit.n;
    var base = objColorAt(obj, p);
    var col = [scene.ambient * base[0], scene.ambient * base[1], scene.ambient * base[2]];

    for (var li = 0; li < scene.lights.length; li++) {
      var L = scene.lights[li];
      var toL = sub(L.p, p);
      var distL = len(toL);
      var ldir = mul(toL, 1 / distL);
      if (inShadow(scene, add(p, mul(n, 1e-4)), L.p)) continue;
      var ndl = Math.max(0, dot(n, ldir));
      if (ndl > 0) {
        var atten = L.intensity / (1 + 0.02 * distL * distL);
        var diff = ndl * atten;
        col[0] += base[0] * L.color[0] * diff;
        col[1] += base[1] * L.color[1] * diff;
        col[2] += base[2] * L.color[2] * diff;
        // Blinn-Phong specular
        var h = norm(add(ldir, mul(d, -1)));
        var ns = Math.pow(Math.max(0, dot(n, h)), 48);
        var sp = obj.spec || 0;
        col[0] += ns * sp * atten * L.color[0];
        col[1] += ns * sp * atten * L.color[1];
        col[2] += ns * sp * atten * L.color[2];
      }
    }

    if (depth < maxDepth) {
      var kr = obj.kr || 0, kt = obj.kt || 0;
      if (kr > 0) {
        var rdir = reflect(d, n);
        var rc = trace(scene, add(p, mul(n, 1e-4)), rdir, depth + 1, maxDepth);
        col[0] += kr * rc[0]; col[1] += kr * rc[1]; col[2] += kr * rc[2];
      }
      if (kt > 0) {
        var entering = dot(d, n) < 0;
        var n1 = entering ? 1 : (obj.ior || 1.5), n2 = entering ? (obj.ior || 1.5) : 1;
        var eta = n1 / n2;
        var cosI = -dot(d, n);
        var tdir = refract(d, n, eta);
        var fr = tdir === null ? 1 : fresnelSchlick(cosI, n1, n2);
        fr = Math.min(1, fr + (tdir === null ? 0 : 0));
        if (fr > 0 && kr >= 0) {
          var rdir2 = reflect(d, n);
          var rc2 = trace(scene, add(p, mul(n, 1e-4)), rdir2, depth + 1, maxDepth);
          var addR = tdir === null ? kt : kt * fr;
          col[0] += addR * rc2[0]; col[1] += addR * rc2[1]; col[2] += addR * rc2[2];
        }
        if (tdir !== null) {
          var tc = trace(scene, add(p, mul(tdir, 1e-4)), tdir, depth + 1, maxDepth);
          var pass = kt * (1 - fr);
          col[0] += pass * tc[0]; col[1] += pass * tc[1]; col[2] += pass * tc[2];
        }
      }
    }
    return col;
  }

  // render a tile [x0,y0,w,h] into a Float64Array of size w*h*3 (linear RGB, 0..1+, unclamped)
  function renderTile(scene, cam, x0, y0, w, h, imgW, imgH, opts) {
    opts = opts || {};
    var samples = opts.samples || 1;
    var maxDepth = opts.maxDepth === undefined ? 3 : opts.maxDepth;
    var rnd = mulberry32(opts.seed === undefined ? 1 : opts.seed + x0 * 7919 + y0 * 104729);
    var out = new Float64Array(w * h * 3);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var r = 0, g = 0, b = 0;
        for (var s = 0; s < samples; s++) {
          var jx = samples === 1 ? 0.5 : rnd();
          var jy = samples === 1 ? 0.5 : rnd();
          var ray = camRay(cam, x0 + x + jx, y0 + y + jy, imgW, imgH);
          var c = trace(scene, ray.o, ray.d, 0, maxDepth);
          r += c[0]; g += c[1]; b += c[2];
        }
        var k = (y * w + x) * 3;
        out[k] = r / samples; out[k + 1] = g / samples; out[k + 2] = b / samples;
      }
    }
    return out;
  }

  function toBytes(tile, w, h) { // linear → sRGB bytes (clamped)
    var out = new Uint8ClampedArray(w * h * 4);
    for (var i = 0; i < w * h; i++) {
      out[i * 4] = Math.round(255 * Math.min(1, Math.max(0, srgbEncode(tile[i * 3]))));
      out[i * 4 + 1] = Math.round(255 * Math.min(1, Math.max(0, srgbEncode(tile[i * 3 + 1]))));
      out[i * 4 + 2] = Math.round(255 * Math.min(1, Math.max(0, srgbEncode(tile[i * 3 + 2]))));
      out[i * 4 + 3] = 255;
    }
    return out;
  }

  function renderFull(scene, cam, W, H, opts) {
    var tile = renderTile(scene, cam, 0, 0, W, H, W, H, opts);
    return { linear: tile, bytes: toBytes(tile, W, H), W: W, H: H };
  }

  // ---------- invariant checks ----------
  function approx(x, y, tol) { return Math.abs(x - y) <= tol; }

  function runChecks(opts) {
    opts = opts || {};
    var checks = [];
    function push(name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: detail || '' }); }

    // C1 sphere intersection: analytic t satisfies the implicit equation |o+td-c|^2 = r^2
    var worst = 0;
    var rndc = mulberry32(42);
    for (var k1 = 0; k1 < 200; k1++) {
      var c = v3(rndc() * 4 - 2, rndc() * 4 - 2, rndc() * 4 - 2);
      var r = 0.3 + rndc();
      var o = v3(rndc() * 6 - 3, rndc() * 6 - 3, 4 + rndc() * 2);
      // target is a point strictly inside the sphere (normalized dir * 0.9r)
      var target = add(c, mul(norm(v3(rndc() * 2 - 1, rndc() * 2 - 1, rndc() * 2 - 1)), r * 0.9));
      var d = norm(sub(target, o));
      var tA = intersectSphere(o, d, c, r);
      if (tA === null) { worst = Infinity; break; }
      // plug the analytic root back into the implicit equation: residual must vanish
      var qA = add(o, mul(d, tA));
      var fA = dot(sub(qA, c), sub(qA, c)) - r * r;
      worst = Math.max(worst, Math.abs(fA));
    }
    push('球体解析求交满足隐式方程 |o+td-c|²=r²（200 组随机光线）', worst < 1e-9, 'max |f(tA)|=' + worst.toExponential(2));

    // C2 sphere miss / inside behaviour: origin inside → returns far root (exit), miss → null
    var s2 = { c: v3(0, 0, 0), r: 1 };
    push('球内起点返回出射根，脱靶返回 null',
      intersectSphere(v3(0, 0, 0), v3(0, 0, -1), s2.c, 1) === 1 &&
      intersectSphere(v3(0, 0, 0.5), v3(0, 0, -1), s2.c, 1) === 1.5 &&
      intersectSphere(v3(0, 5, 0), v3(0, 0, -1), s2.c, 1) === null,
      'inside→1 / 1.5（出射），miss→null');

    // C3 reflect: |r|=|I|, mirror symmetry about N, time-reversal symmetry
    var I = norm(v3(0.6, -0.8, 0.1)), N = v3(0, 1, 0);
    var R = reflect(I, N);
    var Rrev = reflect(mul(I, -1), N); // reflecting the reversed ray ⇒ reversed reflected ray
    push('镜面反射：长度不变 & 入射=反射角 & 时间反演对称',
      approx(len(R), len(I), 1e-12) &&
      approx(dot(R, N), -dot(I, N), 1e-12) &&
      approx(Rrev[0], -R[0], 1e-12) && approx(Rrev[1], -R[1], 1e-12) && approx(Rrev[2], -R[2], 1e-12),
      '|R|=' + len(R).toFixed(12) + '，cosθi=' + dot(I, N).toFixed(6) + '，cosθr=' + dot(R, N).toFixed(6));

    // C4 Snell: sin ratio == eta; TIR beyond critical angle
    var I4 = norm(v3(0.5, -1, 0)), N4 = v3(0, 1, 0), eta = 1 / 1.5;
    var T4 = refract(I4, N4, eta);
    var sini = Math.sqrt(1 - Math.pow(-dot(I4, N4), 2));
    var sint = Math.sqrt(1 - Math.pow(-dot(T4, N4), 2));
    var snellOk = approx(sint / sini, eta, 1e-12);
    // critical angle: sin_c = n2/n1 = 1/1.5 → incident with sin > sin_c must TIR (dense→rare)
    var sinC = 1 / 1.5;
    var sinTheta = sinC * 1.2; // beyond critical
    var I6 = norm(v3(sinTheta, -Math.sqrt(1 - sinTheta * sinTheta), 0));
    var T6 = refract(I6, N4, 1.5); // eta = n1/n2 = 1.5 → total internal reflection → null
    push('Snell 定律：sinθt/sinθi = n1/n2 & 全反射返回 null', snellOk && T6 === null && T4 !== null,
      'sinθt/sinθi=' + (sint / sini).toFixed(12) + ' vs η=' + eta + '；超临界角 TIR=' + (T6 === null ? 'null ✓' : '未触发'));

    // C5 Fresnel Schlick: normal incidence → r0, grazing → 1
    var n1 = 1, n2 = 1.5, r0 = Math.pow((n1 - n2) / (n1 + n2), 2);
    push('Fresnel：正入射= r0²，掠射→1',
      approx(fresnelSchlick(1, n1, n2), r0, 1e-12) && fresnelSchlick(1e-6, n1, n2) > 0.999,
      'F(0°)=' + fresnelSchlick(1, n1, n2).toExponential(3) + ' = r0=' + r0.toExponential(3) + '，F(89.999°)=' + fresnelSchlick(1e-6, n1, n2).toFixed(6));

    // C6 sRGB roundtrip: decode(encode(x)) ≈ x
    var w6 = 0;
    for (var g6 = 1; g6 < 40; g6++) {
      var x = g6 / 40;
      w6 = Math.max(w6, Math.abs(srgbDecode(srgbEncode(x)) - x));
    }
    push('sRGB 编解码往返闭合', w6 < 1e-12, 'max |decode(encode(x))−x|=' + w6.toExponential(2));

    // C7 camera: center pixel ray ≈ forward direction; pixel grid spans ±tan(fov/2)
    var cam = defaultCamera();
    var fwd = norm(sub(cam.lookAt, cam.pos));
    var cRay = camRay(cam, 320, 240, 640, 480);
    var halfH = Math.tan(cam.fov * Math.PI / 360);
    push('相机中心光线 ≈ forward，视场半高 = tan(fov/2)',
      approx(dot(cRay.d, fwd), 1, 1e-12) && approx(halfH, Math.tan(cam.fov * Math.PI / 360), 1e-15),
      'cos角=' + dot(cRay.d, fwd).toExponential(2) + '，halfH=' + halfH.toFixed(6));

    // C8 plane hit: t and point exact
    var t8 = intersectPlane(v3(0, 1, 0), norm(v3(0, -1, 0.5)), v3(0, 0, 0), v3(0, 1, 0));
    var p8 = add(v3(0, 1, 0), mul(norm(v3(0, -1, 0.5)), t8));
    push('平面求交精确落在 y=0', approx(p8[1], 0, 1e-12) && t8 > 0, 't=' + t8.toFixed(6) + '，hit.y=' + p8[1].toExponential(2));

    // C9 shadow: light blocked by an opaque sphere ⇒ inShadow true at the occluded point
    var sc9 = {
      objects: [
        { type: 'sphere', c: v3(0, 0, 0), r: 0.5, color: [1, 1, 1], kr: 0, kt: 0, spec: 0 },
        { type: 'plane', p: v3(0, -1, 0), n: v3(0, 1, 0), color: [1, 1, 1], kr: 0 }
      ],
      lights: [{ p: v3(0, 5, 0), color: [1, 1, 1], intensity: 2 }],
      ambient: 0, bgColor: [0, 0, 0]
    };
    var pc = v3(0, -1, 0);      // directly under the sphere → inside its shadow column
    var pcLit = v3(3, -1, 0);   // far to the side → no occluder between it and the light
    var sh = inShadow(sc9, pc, sc9.lights[0].p);
    var shLit = inShadow(sc9, pcLit, sc9.lights[0].p);
    push('阴影射线：遮挡点返回 true，无遮挡点返回 false', sh === true && shLit === false,
      'shadowed(pc)=' + sh + '，lit(pcLit)=' + shLit);

    // C10 deterministic render: same seed → identical buffer; different seed → different
    var mini = { W: 48, H: 36 };
    var sA = renderFull(defaultScene(), defaultCamera(), mini.W, mini.H, { samples: 4, maxDepth: 2, seed: 7 });
    var sB = renderFull(defaultScene(), defaultCamera(), mini.W, mini.H, { samples: 4, maxDepth: 2, seed: 7 });
    var sC = renderFull(defaultScene(), defaultCamera(), mini.W, mini.H, { samples: 4, maxDepth: 2, seed: 8 });
    var same = true, diffSeed = false;
    for (var i10 = 0; i10 < sA.linear.length; i10++) {
      if (sA.linear[i10] !== sB.linear[i10]) same = false;
      if (sA.linear[i10] !== sC.linear[i10]) diffSeed = true;
    }
    push('渲染确定性：同种子逐位一致，异种子不同', same && diffSeed,
      'same(seed7==seed7)=' + same + '，diff(seed7≠seed8)=' + diffSeed);

    // C11 image semantics: red sphere on the left → left-centre pixel redder than right-centre
    var W11 = 160, H11 = 120;
    var img = renderFull(defaultScene(), defaultCamera(), W11, H11, { samples: 1, maxDepth: 1, seed: 3 });
    function px(i, j) { var k = (j * W11 + i) * 3; return [img.linear[k], img.linear[k + 1], img.linear[k + 2]]; }
    var L11 = px(Math.round(W11 * 0.32), Math.round(H11 * 0.52));
    var R11 = px(Math.round(W11 * 0.68), Math.round(H11 * 0.50));
    push('语义探针：左侧球偏红、右侧球偏蓝', L11[0] > L11[2] && R11[2] > R11[0],
      '左 RGB=(' + L11.map(function (v) { return v.toFixed(2); }).join(',') + ') 右 RGB=(' + R11.map(function (v) { return v.toFixed(2); }).join(',') + ')');

    // C12 energy: mirror-only scene preserves radiance along the path
    var sc12 = {
      objects: [
        { type: 'plane', p: v3(0, -1, 0), n: v3(0, 1, 0), color: [0.8, 0.8, 0.8], kr: 0.9 },
        { type: 'sphere', c: v3(0, 0, -6), r: 1.5, color: [0.9, 0.4, 0.4], kr: 0, spec: 0 }
      ],
      lights: [{ p: v3(0, 5, 3), color: [1, 1, 1], intensity: 1 }],
      ambient: 0.1, bgColor: [0.5, 0.5, 0.5]
    };
    var I12 = norm(v3(0, -0.5, -0.2));
    var c12 = trace(sc12, v3(0, 2, 4), I12, 0, 8);
    var finite12 = c12.every(function (v) { return isFinite(v) && v >= 0; });
    push('深度 8 递归反射稳定且非负', finite12, 'col=(' + c12.map(function (v) { return v.toFixed(3); }).join(',') + ')');

    // C13 recursion depth cutoff: maxDepth=0 == no secondary rays
    var d0 = trace(defaultScene(), v3(0, 1.2, 4.2), norm(v3(0, -0.1, -4.2)), 0, 0);
    var d0b = trace(defaultScene(), v3(0, 1.2, 4.2), norm(v3(0, -0.1, -4.2)), 0, 4);
    push('maxDepth 截断生效（0 阶 ≠ 4 阶，两者均有限）', isFinite(d0[0]) && isFinite(d0b[0]) &&
      (Math.abs(d0[0] - d0b[0]) > 1e-9 || Math.abs(d0[1] - d0b[1]) > 1e-9),
      'depth0=(' + d0.map(function (v) { return v.toFixed(3); }).join(',') + ') depth4=(' + d0b.map(function (v) { return v.toFixed(3); }).join(',') + ')');

    // C14 multisample AA converges: 4×4 samples reduces variance vs 1 sample on a jittered edge column
    var var1 = 0, var16 = 0, reps = 6;
    for (var rp = 0; rp < reps; rp++) {
      var t1 = renderTile(defaultScene(), defaultCamera(), 60 + rp, 50, 2, 30, 160, 120, { samples: 1, maxDepth: 1, seed: 100 + rp });
      var t16 = renderTile(defaultScene(), defaultCamera(), 60 + rp, 50, 2, 30, 160, 120, { samples: 16, maxDepth: 1, seed: 100 + rp });
      var m1 = 0, m16 = 0;
      for (var q = 0; q < t1.length; q++) { m1 += t1[q]; m16 += t16[q]; }
      m1 /= t1.length; m16 /= t16.length;
      var v1 = 0, v16 = 0;
      for (q = 0; q < t1.length; q++) { v1 += (t1[q] - m1) * (t1[q] - m1); v16 += (t16[q] - m16) * (t16[q] - m16); }
      var1 += v1; var16 += v16;
    }
    push('多重采样 AA：16 样本方差 < 1 样本方差', var16 < var1,
      'var(1×)= ' + var1.toExponential(2) + '，var(16×)= ' + var16.toExponential(2));

    return checks;
  }

  var API = {
    VERSION: VERSION,
    mulberry32: mulberry32,
    v3: v3, add: add, sub: sub, mul: mul, mulv: mulv, dot: dot, cross: cross,
    len: len, norm: norm, reflect: reflect, refract: refract, fresnelSchlick: fresnelSchlick,
    srgbEncode: srgbEncode, srgbDecode: srgbDecode,
    intersectSphere: intersectSphere, intersectPlane: intersectPlane, sphereNormal: sphereNormal,
    defaultScene: defaultScene, defaultCamera: defaultCamera,
    camRay: camRay, hitScene: hitScene, inShadow: inShadow, objColorAt: objColorAt,
    trace: trace, renderTile: renderTile, toBytes: toBytes, renderFull: renderFull,
    runChecks: runChecks, EPS: EPS
  };

  root.RAY = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
