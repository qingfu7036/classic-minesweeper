# Windows 7 Classic Minesweeper（经典扫雷复刻）

一个不依赖任何联网资源的 Windows 7 经典扫雷复刻项目：**网页版 + Electron 桌面版共用同一套游戏代码**。
技术栈为 HTML5 + CSS3 + 原生 JavaScript（ES Modules）+ Vite，桌面端由 Electron 封装，测试使用 Vitest（单元 / jsdom）与 Playwright（真实浏览器）。

- 内部标识：Classic Minesweeper
- 版本：1.0.0
- 授权：MIT（代码、图标、音效均由本项目自行生成）

---

## 1. 功能一览

| 模块 | 实现情况 |
| --- | --- |
| 经典规则 | 延迟初始化雷区、首次点击 9 宫格安全、迭代式 flood fill、红旗/问号循环、快速开格、胜负判定与棋盘锁定 |
| 三种标准难度 | 初级 9×9/10 雷、中级 16×16/40 雷、高级 30×16/99 雷 |
| 自定义难度 | 行列与地雷数可调，带范围与逻辑校验（地雷必须为首次点击留出安全区） |
| Win7 视觉 | Aero 浅蓝标题栏、经典灰 3D 凸起/凹陷格子、七段红色 LED 计数器、笑脸按钮、原生风格菜单与对话框 |
| 音效 | 开格 / 插旗 / 踩雷 / 胜利 / 新局，全部为自行合成的本地 WAV，可全局开关并持久化 |
| 最佳成绩 | 三种标准难度独立记录，只有通关才更新，时间相同保留首次达成 |
| 统计与历史 | 总局数、胜负、胜率、各难度统计、最近 30 局历史（自定义难度单独标记） |
| 成就系统 | 9 个成就，事件驱动、本地持久化、单次解锁、解锁提示浮层 |
| 设置 | 音效开关、减少动画、问号标记开关、显示缩放（100% / 125% / 150%） |
| 交互 | 左键开格、右键循环标记、右键拖动连续标记、左右键/中键/双击快速开格、完整键盘操作 |
| 桌面端 | Electron：frameless + 自绘 Aero 标题栏、真实最小化/最大化/关闭、窗口自适应棋盘尺寸 |
| 安全 | contextIsolation + sandbox 开启、nodeIntegration 关闭、preload 仅暴露 6 个具名方法、禁止外部导航 |

---

## 2. 环境要求

- Node.js ≥ 20.19（开发机验证版本：v24.19.0）
- npm ≥ 10（开发机验证版本：11.6.3）
- 支持 ES Modules 的现代浏览器（Chrome / Edge / Firefox）
- 打包 Windows 安装包需要 Windows 环境（本项目在 Windows 11 + Node 24 上完成打包验证）

> 所有依赖只用于**开发与打包**；`dist/` 产物是纯静态文件，可离线运行，不需要任何服务器、账号或网络。

---

## 3. 安装依赖

```bash
npm install
```

首次安装若 Electron 二进制未自动下载（网络受限时会发生），可手动执行：

```bash
node node_modules/electron/install.js
# 国内网络可用镜像：
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js
```

---

## 4. 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动网页开发服务器（默认 http://localhost:5173） |
| `npm run build` | 生产构建，输出到 `dist/`（相对路径，可直接用 file:// 打开） |
| `npm run preview` | 预览生产构建（http://localhost:4173） |
| `npm test` | 运行全部单元 / 集成测试（Vitest，217 个用例） |
| `npm run test:watch` | 监听模式 |
| `npm run test:coverage` | 覆盖率报告（输出到 `cache/coverage`） |
| `npm run test:e2e` | Playwright 真实浏览器冒烟测试（需先安装浏览器内核） |
| `npm run assets` | 重新生成图标与音效（`scripts/` 下的确定性脚本） |
| `npm run electron:dev` | Electron 开发模式（自动拉起 Vite 开发服务器） |
| `npm run electron:start` | 构建后用 Electron 加载 `dist/` |
| `npm run electron:pack` | 生成 Windows **便携版** EXE |
| `npm run electron:dist` | 生成 Windows **安装包 + 便携版** |

安装 Playwright 浏览器内核（仅 e2e 测试需要）：

```bash
npx playwright install chromium
```

---

## 5. 目录结构

```
src/
  index.html              页面骨架（Aero 窗口、菜单栏、控制区、雷区、状态栏）
  main.js                 应用装配层：引擎 + 服务 + UI 的唯一连接点
  styles/
    base.css              设计变量（唯一的事实来源）、页面底色、通用按钮
    window.css            Aero 窗口外壳、标题栏、状态栏
    menus.css             菜单栏与下拉菜单
    controls.css          LED 计数器、笑脸按钮
    board.css             雷区格子与数字配色
    dialogs.css           模态框、自定义难度表单、成绩/成就面板、提示浮层
  assets/
    icons/*.svg           地雷、红旗、问号、错旗、笑脸四种表情、奖杯
    sounds/*.wav          自行合成的 5 个音效
  game/
    config.js             难度、状态、标记、存储键等常量
    boardGenerator.js     棋盘创建、地雷生成（含安全区）、数字计算
    reveal.js             开格、迭代式 flood fill、快速开格
    marking.js            红旗/问号循环与计数
    winLose.js            胜负判定、终局棋盘处理、结果快照
    gameEngine.js         单局状态机（唯一允许修改游戏状态的地方）
  ui/
    dom.js                极简 DOM 构建工具
    renderBoard.js        雷区渲染（只读状态，不判断规则）
    renderCounters.js     七段 LED 计数器
    renderFace.js         笑脸按钮
    menus.js              菜单栏（结构集中在 MENU_DEFINITION）
    dialogs.js            模态框系统与所有业务弹窗
    notifications.js      提示浮层
    inputController.js    鼠标 / 键盘输入映射
  services/
    storageService.js     带版本号与容错的本地持久化
    settingsService.js    设置读写
    recordsService.js     最佳成绩、统计、历史
    achievementService.js 成就条件判定与解锁
    audioService.js       音效播放（WAV 优先，WebAudio 合成兜底）
  utils/
    validation.js         自定义难度校验、类型工具
    formatTime.js         计数器与时长格式化
electron/
  main.cjs                主进程：窗口、IPC、安全策略
  preload.cjs             受限桌面能力
tests/
  *.test.js               单元 / jsdom 集成测试
  e2e/smoke.spec.js       Playwright 真实浏览器冒烟测试
scripts/
  generate-sounds.mjs     合成音效 WAV
  generate-icons.mjs      生成 build/icon.png 与 icon.ico
  electron-dev.mjs        Electron 开发模式启动器
```

> 说明：相比任务书建议的结构，本项目额外增加了 `styles/menus.css`、`ui/dom.js`、`ui/notifications.js`、`services/settingsService.js`，用于保持单文件职责清晰。

---

## 6. 交互映射（与「帮助 → 操作说明」一致）

| 操作 | 行为 |
| --- | --- |
| 左键单击未打开格 | 开格（首次点击保证 9 宫格安全） |
| 右键单击未打开格 | 未标记 → 红旗 → 问号 → 未标记 |
| 按住右键拖动 | 连续标记，每个格子只循环一次 |
| 左键按住已打开数字格再松开 | 快速开格（按下时显示周围按压预览；旗数等于数字时才生效） |
| 左右键同时按下 / 中键单击 / 双击 | 快速开格 |
| `↑` `↓` `←` `→` | 移动键盘光标 |
| `Space` / `Enter` | 打开光标格；若已是数字格则快速开格 |
| `F` | 对光标格插旗 / 切换问号 |
| `F2` | 新游戏 |
| `Esc` | 关闭菜单或最上层对话框 |

已被插旗的格子不会被左键打开或快速开格；问号只作备忘，不阻止左键打开，也不计入剩余地雷计数。

---

## 7. 数据与持久化

所有本地数据都通过 `storageService` 读写，键名前缀 `classic-minesweeper:`，值为 `{ v: 1, data: ... }`：

| 键 | 内容 | 版本不符 / 损坏时 |
| --- | --- | --- |
| `settings` | 音效、减少动画、问号标记、缩放 | 回退默认值 |
| `records` | 最佳成绩、统计、历史 | 逐项回退（单项非法只丢该项） |
| `achievements` | 已解锁成就与解锁时间、累计进度 | 回退为空进度 |
| `session` | 当前难度（刷新后保留） | 非法自定义参数会被校验拒绝并回到初级 |

无 localStorage 时（隐私模式等）自动退化到内存存储，游戏仍可运行，只是刷新后不保留。

---

## 8. 成就规则

「完成一局」= 一局游戏**到达胜利或失败**；中途点笑脸 / 按 F2 重开**不计入**。
「连续胜利」= 胜利 +1，失败归零，重开不改变连胜数。每个成就只会解锁一次。

| ID | 名称 | 解锁条件 |
| --- | --- | --- |
| `first_win` | 初次胜利 | 首次成功通关任意难度 |
| `win_beginner` | 初级通关 | 通关初级（9×9，10 雷） |
| `win_intermediate` | 中级通关 | 通关中级（16×16，40 雷） |
| `win_expert` | 高级通关 | 通关高级（30×16，99 雷） |
| `speed_beginner` | 速度挑战 | 初级模式 ≤ 10 秒获胜 |
| `perfect_flags` | 完美标记 | 通关且**全程没有一次**把旗子插在安全格上 |
| `streak_3` | 连胜挑战 | 连续赢下 3 局 |
| `veteran_20` | 扫雷老手 | 累计完成 20 局（胜或负） |
| `custom_win` | 自定义挑战 | 通关任意自定义难度 |

> 「完美标记」采用「全程零错误插旗」的判定：胜利时棋盘上本来就不可能有插错的旗（插错的格无法被打开），若只按终局状态判定该成就永远会被自动满足，失去意义。

---

## 9. 测试

```bash
npm test                       # Vitest：单元测试 + jsdom 集成测试
npm run test:coverage          # 覆盖率报告（输出到 cache/coverage）
npm run test:e2e               # Playwright：真实 Chromium 冒烟测试
```

**实际运行结果（本机 Windows + Node v24.19.0）：**

- `npm test` → **16 个文件 / 231 个用例全部通过**
- `npm run test:e2e` → **11 个真实浏览器用例全部通过**（含 40×60 超大棋盘在 320px 窗口下的可达性验证）

> 首次运行 e2e 需要下载浏览器内核：`npx playwright install chromium`。若网络受限，
> 可改用系统已装 Chrome：在 `playwright.config.js` 中设置 `channel: 'chrome'`。

覆盖范围：

- **A 棋盘生成**：三种难度尺寸/雷数、首点 9 宫格安全、角落与边缘邻接、雷过密时的降级策略、重开无残留
- **B 操作**：左键开格、右键循环、旗子阻挡、空白展开（2400 格不栈溢出）、快速开格成功/失败、计数器与负数、胜负后锁定、重开重置
- **C 计时与记录**：首格开始计时、结束后冻结、重开归零、只有获胜更新成绩、难度独立、跨实例（刷新）持久化、损坏数据回退
- **D 成就**：9 个成就条件、重复触发只解锁一次、连胜与失败重置、重开不算完成一局、刷新后保留
- **E UI**：格子状态样式互斥、数字配色类、LED 七段点亮、笑脸状态、菜单勾选/单选/禁用、对话框校验与取消、输入控制器全交互（含左右键交叉按键顺序）、jsdom 端到端装配
- **F Electron**：主进程/预载脚本静态审查 + `CLASSIC_MINESWEEPER_SMOKE=1` 自检（真实启动 Electron、加载 `dist/` 并回传渲染结果）

---

## 10. Electron 桌面版

```bash
npm run electron:dev     # 开发模式（Vite 开发服务器 + Electron）
npm run electron:start   # 以生产构建启动
npm run electron:pack    # 便携版 EXE
npm run electron:dist    # 安装包 + 便携版
```

无人值守自检（会加载 `dist/`、校验渲染结果后自动退出，退出码 0 表示成功）：

```bash
CLASSIC_MINESWEEPER_SMOKE=1 npx electron .
```

本机实际输出：

```text
[smoke] {"cells":81,"status":"初级：9 × 9，10 雷 · 已打开 0/71 · 红旗 0","isolation":true,"desktopApi":true}
```

- `cells: 81` → 本地 `dist/index.html` 被正确加载并完成装配（不是白屏，也不是错误路径）
- `isolation: true` → 渲染进程里 `window.require` 不存在，证明 `nodeIntegration` 确实关闭
- `desktopApi: true` → preload 通过 `contextBridge` 暴露的 `window.desktop` 可用

安全配置（`electron/main.cjs`）：

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`
- `preload.cjs` 通过 `contextBridge` 只暴露：`minimize`、`toggleMaximize`、`closeWindow`、`fitWindow`、`getAppInfo`、`onWindowState`
- `setWindowOpenHandler` 拒绝所有新窗口，外链交给系统浏览器
- `will-navigate` 只允许开发服务器**同源**地址或 dist 目录内的 `file://`（使用 URL 解析比较，不做字符串前缀匹配）
- 缺少 `dist/` 时显示明确的错误页而不是白屏

---

## 11. 已知限制

- 音效为程序合成音（`scripts/generate-sounds.mjs` 生成），风格接近经典，但**不是**原版音效采样。
- 缩放是**整窗等比缩放**：标题栏、菜单、计数器、雷区、内边距一起变化（格子始终是 16px × 100%/125%/150%）。
- **最大化会自动铺满屏幕**：整窗等比放大到刚好填满可用区域（格子取整数像素），控制区与状态栏铺满窗口宽度；
  还原窗口后回到用户选择的 100% / 125% / 150%。
- 窗口宽度严格跟着雷区宽度走（初级窗口约 172×282），**不会出现“窗口比棋盘大一圈”的空白**；
  视口比窗口还窄时由桌面层滚动查看，雷区永远可达。桌面版窗口下限于 170×240，并按棋盘自动调整尺寸。
- 状态栏只显示一行信息（宽度与雷区一致，过长会省略号截断，悬停可看全文）；
  「最佳成绩 / 成就」入口在「帮助」菜单中。
- 网页版的「最小化」无实际效果（浏览器不允许），会给出提示；「最大化」为真实布局切换。
- 浏览器版的「退出 / 关闭」只提示无法用脚本关闭标签页，桌面版才是真正关闭应用。
- 与 Win7 原版仍有细枝末节差异（例如原版把「标记(?)」放在设置菜单的子菜单里，本项目为同级复选项）。
- **网络受限环境**：`electron` 二进制与 `electron-builder` 附带工具默认从 GitHub 下载，
  若失败需设置镜像，例如：
  `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 与
  `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`。
- **未做代码签名**：Windows 安装包/便携版没有签名，SmartScreen 会提示「未知发布者」。
- 未在 Windows 7 实机验证（当前环境为 Windows + Node 24），也未在 macOS / Linux 上验证打包。
- Playwright 的 `chromium-headless-shell` 在本机网络下下载失败，因此 e2e 配置改用完整 Chromium
  （`channel: 'chromium'`）。

---

## 12. 本次交付实际产物与验证证据

### 已生成的可执行文件（`release/`，本次构建实测存在）

| 文件 | 大小 | 说明 |
| --- | --- | --- |
| `release\ClassicMinesweeper-1.0.0-portable.exe` | 96 MB | 便携版，双击即玩，无需安装 |
| `release\ClassicMinesweeper-1.0.0-setup.exe` | 96 MB | NSIS 安装包（可选安装目录） |
| `release\win-unpacked\Classic Minesweeper.exe` | — | 免安装目录版（含 resources/app.asar） |

### 实际执行的验证

```text
npm test                                   → 16 个文件 / 231 个用例全部通过
npm run test:e2e                           → 13 个真实 Chromium 用例全部通过（含等比缩放、无空隙、最大化铺满断言）
npm run build                              → dist/ 生成成功（相对路径，可离线运行）
CLASSIC_MINESWEEPER_SMOKE=1 npx electron .  → EXIT=0
   [smoke] {"cells":81,"isolation":true,"desktopApi":true,"windowWidth":171,"contentWidth":172,
            "boardFrameWidth":150,"leftGap":11,"rightGap":11,"fitsContent":true,"layoutOk":true,
            "maximize":{"applied":true,"cellWidth":51,"heightFill":0.99,"panelFill":0.978},"maximizeOk":true}
   — fitsContent / layoutOk 防住「窗口比棋盘大一圈、到处是大片空隙」；
     maximize.* 防住「最大化后仍然没铺满屏幕」（格子 16→51px，竖直铺满 99%，控制区铺满 97.8%）。
"release\win-unpacked\Classic Minesweeper.exe"（同样带自检）→ EXIT=0
"release\ClassicMinesweeper-1.0.0-portable.exe" → 实测拉起 4 个 Classic Minesweeper.exe 进程（主进程+渲染+GPU），随后已清理
```

### 仍需人工确认的事项

- 本机为 Windows 环境，**未在 Windows 7 实机**上运行过；Electron 44 官方支持的最低版本为 Windows 10。
  如果确实需要在 Windows 7 上运行，需把 Electron 降到仍支持 Win7 的旧版本（如 22.x）并重新验证。
- 安装包未做代码签名，SmartScreen 会提示未知发布者。
- 未在 macOS / Linux 上验证打包流程（配置已保留跨平台目标，可自行扩展）。
