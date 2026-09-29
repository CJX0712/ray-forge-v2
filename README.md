# rayforge ✦ 纯 JS CPU 光线追踪

零依赖、单文件、确定性的 Whitted 风格 CPU 光线追踪器。引擎与界面全部用原生 JavaScript 写成，
无任何外部依赖，可直接用浏览器打开 `index.html` 使用，也可在 Node 里 `require('./_engine.js')` 做无头计算。

> 作者：晨星 ｜ License：MIT ｜ 单文件 HTML 交付，内联 CSS/JS，零外部依赖。

## 特性

- **解析几何求交**：球体（二次方程）、平面，含内部起点 / 脱靶的正确处理。
- **Whitted 递归**：镜面反射、折射（Snell + 全反射）、Fresnel–Schlick 混合权重。
- **光照模型**：多光源、软衰减、Blinn–Phong 高光、棋盘格地面、环境光。
- **sRGB 编解码**：线性 ↔ 显示空间正确转换。
- **多重采样抗锯齿（AA）**：可调 1× / 4× / 16× / 64× jitter 采样。
- **渐进式分块渲染**：按 32px 瓦片逐帧绘制，进度 / 采样数 / 用时实时可见。
- **内置自检**：14 项不变量检查（见下），界面一键运行，全部通过即绿。

## 使用

直接用浏览器打开 `index.html` 即可。控制项：分辨率、采样数、递归深度、随机种子、渐进式开关、
「渲染」与「运行自检」按钮。

无头 / 测试：

```bash
node build.js      # 重新生成单文件 index.html（内联 _style.css + _engine.js + _ui.js）
node _smoke.js     # 引擎不变量套件（38 项）
node _probe.js     # index.html 结构目检（27 项）
node _uicheck.js   # DOM stub 跑 UI（19 项）
```

## 引擎 API（`globalThis.RAY`）

纯函数、无 DOM 依赖：

```js
const R = require('./_engine.js');

const scene = R.defaultScene();
const cam   = R.defaultCamera();

// 渲染整图：返回 { linear: Float64Array(W*H*3), bytes: Uint8ClampedArray(W*H*4), W, H }
const img = R.renderFull(scene, cam, 640, 480, { samples: 16, maxDepth: 3, seed: 7 });

// 分块渲染（用于渐进式 UI）
const tile = R.renderTile(scene, cam, x0, y0, w, h, W, H, { samples, maxDepth, seed });

// 单条光线
const col = R.trace(scene, origin, dir, 0, maxDepth);

// 不变量自检：返回 [{name, ok, detail}, ...]
const checks = R.runChecks();
```

向量运算：`v3 add sub mul mulv dot cross len norm reflect refract fresnelSchlick`；
`intersectSphere intersectPlane sphereNormal camRay hitScene inShadow srgbEncode srgbDecode`。

## 14 项不变量（runChecks）

| # | 检查 | 核心不变量 |
|---|------|-----------|
| C1 | 球体解析求交 | 解析根满足隐式方程 `|o+td−c|²=r²` |
| C2 | 内部/脱靶行为 | 球内起点返回出射根，脱靶返回 null |
| C3 | 镜面反射 | `|R|=|I|`、入射=反射角、时间反演对称 |
| C4 | Snell 定律 | `sinθt/sinθi = n₁/n₂`，超临界角全反射返回 null |
| C5 | Fresnel | 正入射 = r₀，掠射 → 1 |
| C6 | sRGB 往返 | `decode(encode(x)) ≈ x` |
| C7 | 相机 | 中心像素光线 ≈ forward，`半高 = tan(fov/2)` |
| C8 | 平面求交 | 交点精确落在 y=0 |
| C9 | 阴影射线 | 遮挡点 true、无遮挡点 false |
| C10 | 渲染确定性 | 同种子逐位一致、异种子不同 |
| C11 | 语义探针 | 左侧球偏红、右侧球偏蓝 |
| C12 | 递归稳定 | 深度 8 反射非负且有限 |
| C13 | 深度截断 | `maxDepth=0` 无次级光线且有限 |
| C14 | 多重采样 AA | 16 样本方差 < 1 样本方差 |

## 架构

```
_style.css   界面样式（零依赖，light 主题）
_engine.js  纯函数光线追踪引擎，暴露 globalThis.RAY
_ui.js      渐进式瓦片渲染器 + 自检面板，暴露 globalThis.__RAYUI
build.js    将三者内联为单文件 index.html
_smoke.js   引擎不变量套件（无头）
_probe.js   index.html 结构目检（无头）
_uicheck.js DOM stub 跑 UI（无头）
```

引擎与界面通过 `globalThis.RAY` / `globalThis.__RAYUI` 解耦：同一份引擎代码既驱动浏览器渲染，
也支撑 Node 无头计算与测试，保证「看的」和「验的」是同一套逻辑。
