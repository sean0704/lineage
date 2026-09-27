# AGENTS.md - 《天堂 3D：地監冒險》AI 協作與開發維護總手冊

本文件為《天堂 3D：地監冒險》（Lineage Dungeon 3D）之單一真實來源（Single Source of Truth, SSOT），專為 AI Agent（如 Antigravity、Claude Code、Cursor、Windsurf 等）與全端開發者設計，完整規範系統架構、3D 渲染、UI/UX 風格、關鍵防坑守則、數值公式與維護指令。

---

## 🎯 專案使命與核心技術架構

本專案向經典 MMORPG《天堂》（Lineage 1）致敬，打造兼具 3D 視覺沉浸感與輕量化體驗的純前端地監養成遊戲。

### 核心技術堆疊（Zero-Build 原生架構）
- **渲染引擎**: **Three.js (r128 via CDN)** - 負責 3D 地監石廊、動態壁掛火把光暈、樓層自適應迷霧 (`FogExp2`)、實體看板、鏡頭震顫與粒子系統。
- **圖資管線**: **Blender 5.2.2 LTS (EEVEE Headless Scripting)** - 透過 Python 程序化建模並渲染 22 款怪物、主角騎士、4 款寶箱與無縫磚石貼圖。
- **音效引擎**: **原生 Web Audio API** - 零外部檔案依賴，純數學振盪器與濾波器即時合成 8/16-bit 復古戰鬥破空、打擊、喝水、開箱與號角音效。
- **介面排版**: **HTML5 + Tailwind CSS (CDN) + 自訂暗黑 CSS** - 隨開即玩，免 npm/webpack 編譯打包。
- **資料儲存**: **JSON 資料庫 + `js/game_data.js` 備援 + `localStorage` 本機進度存檔**。

---

## 📁 完整檔案與模組地圖

| 檔案路徑 | 模組性質 | 職責與核心邏輯 |
| :--- | :--- | :--- |
| [index.html](file:///Users/sean0704/Downloads/lineage-main/index.html) | 主程式入口 | DOM 控制、3D 視窗掛載、戰鬥與探索流程、背包/裝備/商店邏輯、暗黑風格 UI |
| [js/dungeon_renderer.js](file:///Users/sean0704/Downloads/lineage-main/js/dungeon_renderer.js) | 3D 渲染系統 | `DungeonRenderer` 類別：管理 Scene、PerspectiveCamera、動態火把、樓層氛圍迷霧 (`FogExp2`)、毫秒級打擊震顫 (`shakeCamera`) |
| [js/entity_manager.js](file:///Users/sean0704/Downloads/lineage-main/js/entity_manager.js) | 3D 實體系統 | `EntityManager` 類別：管理英雄、怪物、寶箱 3D 看板與影子，處理衝刺攻擊動畫、刀光特效 (Slash VFX)、受擊紅閃、3D Canvas 傷害跳字 |
| [js/audio_manager.js](file:///Users/sean0704/Downloads/lineage-main/js/audio_manager.js) | 音效引擎 | `GameAudio` / `AudioManager` 單例：利用振盪器與濾波器即時合成揮砍、重擊、喝水、開箱、號角等音效 |
| [js/game_data.js](file:///Users/sean0704/Downloads/lineage-main/js/game_data.js) | 離線備援資料庫 | `window.DEFAULT_GAME_DATA`：當本機 `file://` 協定被瀏覽器阻擋 `fetch()` 時，提供無縫降級的內嵌遊戲資料 |
| [scripts/generate_blender_assets.py](file:///Users/sean0704/Downloads/lineage-main/scripts/generate_blender_assets.py) | 自動化渲染工具 | 使用 Blender Python API 程序化建立網格、發光材質、三點光源並渲染輸出透明 PNG |
| `assets/` | 3D 渲染圖資 | 存放怪物、英雄、寶箱及地監貼圖圖檔 |
| `*.json` | 遊戲資料庫 | `monsters.json`、`items.json`、`dungeon_floors.json`、`shop.json` |

---

## 🎨 介面與排版視覺規範 (UI/UX Style Guide)

### 1. 主題與色彩常數
- **主題**: 深色系 (Dark Mode)
- **主要字體**: `'Inter', 'Noto Sans TC', sans-serif`
- **背景色**: `#1a202c`（深藍灰）
- **主容器背景色**: `#2d3748`（中度藍灰）
- **主文字顏色**: `#e2e8f0`（淡白灰）
- **外邊框色彩**: `#4a5568`（冷鋼灰）

### 2. 核心版面配置
- **遊戲主容器 (`game-container`)**:
  - 最大寬度固定為 `600px`，並在視窗中置中對齊。
  - **圓角**: `1rem`（大圓角）
  - **邊框**: `2px solid #4a5568`
  - **陰影**: `0 10px 20px rgba(0, 0, 0, 0.6)`

### 3. 3D 舞台視窗 (`stage-viewport-wrapper`)
- 嵌入於主容器上方，高度固定為 `280px`。
- **背景底色**: `#111622`（深邃黑夜色）。
- **圓角**: `0.75rem`，邊框為 `1px solid #4a5568`，具備內向陰影 `box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.5)`。
- **動態 HUD 覆蓋層 (`stage-overlay-hud`)**:
  - **左上角樓層標籤 (`locationBadge`)**: 顯示當前樓層或安全區域，具毛玻璃半透明效果。
  - **右上角怪物卡片 (`monsterHudCard`)**: 戰鬥中顯示怪物名稱、等級及即時血條。

### 4. 數值儀表與血條 (`Status & Stats`)
- **血條 (`health-bar`)**:
  - 高度 `2rem`，內嵌圓角 `0.5rem`。
  - **漸層填充**: `linear-gradient(to right, #e53e3e, #c53030)`。
  - 文字置中於血條之上，附帶文字陰影。
- **快捷藥水欄 (`quick-potion-bar`)**:
  - 緊接血條下方，支援紅水（🔴 30HP）、綠水（🟢 50HP）、勇水（🟣 75HP）一鍵快速飲用。
- **六欄式數值網格 (`stats-grid`)**:
  - 依序展示：金幣、攻擊力、防禦力、等級、經驗值、樓層。

### 5. 按鈕分類樣式 (`game-button`)
- **通用特性**: 圓角 `0.75rem`，具懸停向上微移效果 (`transform: translateY(-2px)`) 與立體陰影。
- **主要按鈕 (Primary)**: 經典藍色 (`#4299e1`)，Hover `#3182ce`
- **攻擊/危險按鈕 (Danger)**: 戰鬥紅色 (`#e53e3e`)，Hover `#c53030`
- **確認/成功按鈕 (Success)**: 冒險綠色 (`#48bb78`)，Hover `#38a169`
- **取消/中性按鈕 (Neutral)**: 鋼灰色 (`#718096`)，Hover `#4a5568`
- **禁用狀態**: 灰色半透明，取消 hover 交互。

### 6. 特殊文字與稀有度色階
- **普通 (common)**: `text-gray-300`（灰色）
- **罕見 (uncommon)**: `text-green-400`（翠綠色）
- **稀有 (rare)**: `text-blue-400`（亮藍色）
- **傳說 (legendary)**: `text-red-400`（赤紅色）
- **首領遭遇 (Boss Alert)**: `#f56565` 粗體文字並伴隨鏡頭震顫。
- **金幣收益**: `text-yellow-400`（亮黃色）。

---

## 🏛️ 3D 視覺舞台與環境規範 (`js/dungeon_renderer.js`)

### 1. 舞台環境切換 (`setEnvironment`)
- **村莊舞台 (`village`)**:
  - 綠意石板地面、營火跳動點光源、木屋剪影，視角柔和溫馨。
- **地監走廊 (`dungeon`)**:
  - 縱深石壁走廊與兩側立體石柱。
  - 4 盞立體壁掛火把，光源採柔和正弦呼吸（避免高頻跳動導致視覺疲勞）。
  - **樓層自適應迷霧 (`FogExp2`)**:
    - **1~2F**: 深藍冷石（`#121720`，密度 0.07）
    - **3~4F**: 劇毒苔蘚綠（`#0f1c18`，密度 0.07）
    - **5F**: 長老秘術紫（`#1a1224`，密度 0.07）
    - **6~7F**: 死亡騎士煉獄赤紅（`#241010`，密度 0.09）

---

## ⚔️ 3D 實體、動作反饋與特效規範 (`js/entity_manager.js`)

- **主角站位**: 固定於舞台左側 (`x: -1.2, y: 1.1, z: 0.4`)，具備自然呼吸浮動與地面橢圓形陰影。
- **怪物站位**: 生成於舞台右側 (`x: 1.2`)，出場具備彈性縮放動畫（Scale Bounce），Boss 級別模型放大 1.4 倍。
- **斬擊動畫 (`animateHeroAttack`)**:
  - 主角向前突進至中線，於頂點處觸發刀光特效 (Slash VFX) 與鏡頭震顫，隨後後撤歸位。
- **反擊動畫 (`animateMonsterAttack`)**:
  - 怪物向前猛撲，觸發利爪粒子 (Claw VFX) 與受擊閃紅。
- **3D 浮動傷害數字 (`spawnDamageNumber`)**:
  - 動態生成高解析度 Canvas 貼圖 Sprite，向上飄移並透明漸層淡出（暴擊採用黃色加大粗體）。
- **升級光柱 (`playLevelUpVFX`)**:
  - 主角周圍升起環繞式金色粒子風暴。
- **寶箱動畫 (`spawnChest` / `openChest`)**:
  - 寶箱彈跳出現與光芒開啟。

---

## 🔊 Web Audio 音效規範 (`js/audio_manager.js`)

- 全面採用瀏覽器原生 **Web Audio API**（零外部依賴、無加載失敗風險）。
- **主要方法**:
  - `playAttack()`: 白噪音濾波刀刃破空聲。
  - `playHit()`: 三角波低頻打擊撞擊聲。
  - `playPotion()`: 四和弦快速琶音。
  - `playChestOpen()`: 大調光輝勝利號角。
  - `playLevelUp()`: 經典升級躍進音階。
  - `playBossAlert()`: 鋸齒波低音威嚇警報。
  - `playFootstep()`: 輕微石板踏步音。
  - `setMuted(boolean)`: 靜音切換。

---

## ⚠️ Agent 必須遵守之開發守則 (Critical Rules)

未來任何 Agent 或開發者修改本專案時，**必須嚴格遵守以下準則**：

### 1. 攝影機穩定性與打擊震顫
- **禁止在常態迴圈中疊加攝影機座標搖擺**：文字 RPG 需要極高的閱讀穩定性。
- **Three.js Clock 陷阱警惕**：`clock.getElapsedTime()` 內部會觸發 `getDelta()`，若緊接呼叫 `clock.getDelta()` 會回傳 `0`，導致基於 delta 的衰減公式失效。因此震動邏輯必須一律使用 `performance.now()` 毫秒級時間軸，並在結束時**硬性歸零**（`camera.position.x = 0; camera.position.y = baseY;`）。

### 2. 音效系統防護
- 呼叫音效時，**一律使用可選鏈語法**，例如：
  ```javascript
  window.AudioManager?.playFootstep?.();
  window.AudioManager?.playAttack?.();
  ```
- 嚴禁假設外部腳本在任何時刻皆已完全就緒，避免因網路延遲或快取引發 `Uncaught TypeError: ... is not a function`。

### 3. 雙模相容性（HTTP 伺服器 & file:// 協定）
- 本遊戲支援本機雙擊開啟（`file://`）。現代瀏覽器在此協定下可能阻擋 `fetch('*.json')`。
- 載入資料時，必須先嘗試 `fetch()`，若拋出例外則自動退回 `window.DEFAULT_GAME_DATA`。新增遊戲資料時，應同步更新 `*.json` 與 `js/game_data.js`。

### 4. UI 與設計一致性
- 保持暗黑系配色：背景 `#1a202c`、容器 `#2d3748`、文字 `#e2e8f0`、邊框 `#4a5568`。
- 稀有度文字色彩不可變更：普通（灰色）、罕見（綠色）、稀有（藍色）、傳說（紅色）。
- 按鈕維持圓角 `0.75rem` 與 Hover 向上微移 2px 效果。

---

## 🛠️ 開發常用指令

### 1. 本機啟動遊戲測試
```bash
# 使用 Python 內建 HTTP 伺服器
python3 -m http.server 8080

# 或在 macOS 直接開啟
open index.html
```

### 2. 語法驗證
```bash
# 驗證所有 JS 模組語法
node -c js/audio_manager.js
node -c js/dungeon_renderer.js
node -c js/entity_manager.js
node -c js/game_data.js
```

### 3. 重新生成 Blender 3D 資產
```bash
# 第一批：主角與 4 款寶箱
/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/generate_blender_assets.py -- --batch batch1

# 第二批：12 隻普通怪物
/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/generate_blender_assets.py -- --batch batch2

# 第三批：10 隻菁英與首領怪物 (含死亡騎士)
/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/generate_blender_assets.py -- --batch batch3
```

### 4. 重新同步備援資料庫
當修改了 `monsters.json`、`items.json`、`dungeon_floors.json` 或 `shop.json` 時，執行以下 Python 指令即可同步更新 `js/game_data.js`：
```bash
python3 -c "
import json
data = {
    'monsters': json.load(open('monsters.json')),
    'items': json.load(open('items.json')),
    'floorMonsterPools': json.load(open('dungeon_floors.json')),
    'shopInventory': json.load(open('shop.json'))
}
with open('js/game_data.js', 'w', encoding='utf-8') as f:
    f.write('window.DEFAULT_GAME_DATA = ' + json.dumps(data, ensure_ascii=False, indent=2) + ';\n')
print('js/game_data.js synced!')
"
```

---

## 📝 戰鬥與成長核心數值公式

- **升級經驗值需求**:
  - Lv < 45: `Math.floor(5.5 * Math.pow(level, 2.9))`
  - Lv >= 45: `Math.floor(5.5 * Math.pow(level, 2.9) * 1.9 * Math.pow(2, level - 45))`
- **升級屬性成長**:
  - 生命上限 `+10` (升級生命立即回滿)
  - 基礎攻擊 `+2`
  - 基礎防禦 `+1`
- **傷害計算**:
  - 玩家傷害: `Math.max(1, totalAttack - Math.floor(monster.level / 5))` (15% 機率產生 1.5 倍暴擊)
  - 怪物傷害: `Math.max(1, monster.attack - totalDefense)`
