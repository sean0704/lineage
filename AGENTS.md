# AGENTS.md — 《天堂 3D：地監冒險》開發維護手冊

本文件是專案的單一真實來源（SSOT），給 AI Agent 與開發者使用。修改架構、資料或規則時請同步更新本文件。

---

## 🎯 專案概要

向經典 MMORPG《天堂》致敬的**第一人稱格子地監 RPG**。玩家扮演騎士，從奇岩村出發，探索程序生成的古魯丁地監 1F–7F，擊敗 3F、5F 首領與 7F 死亡騎士。

- **技術**：Vite + TypeScript（strict）+ Three.js（npm）+ Vitest，純前端、無後端。
- **美術**：所有 3D 模型、材質、特效都在程式內程序化產生，**沒有任何圖片或音檔資產**。
- **音效**：Web Audio API 即時合成。
- **存檔**：`localStorage`（版本化、具正規化與容錯）。

---

## 🛠️ 常用指令

```bash
npm install          # 安裝依賴
npm run dev          # 開發伺服器 http://localhost:5173
npm test             # 單元測試 + 平衡模擬
npm run typecheck    # 型別檢查
npm run build        # 型別檢查 + 產出 dist/（靜態網站，可部署到任何靜態主機）
npm run preview      # 預覽 build 結果
```

開發模式專用工具：
- `window.__debug`（僅 `npm run dev`）：`floor(n)` 跳層、`xp(n)` 加經驗、`god()`、`gold(n)`、`give(key, qty)`、`heal()`、`revealMap()`、`seek('monster'|'boss'|'chest'|'down')` 自動走一步、`state()`。
- `/dev/gallery.html`：一次展示所有程序化怪物與寶箱模型（`?only=goblin,deathKnight` 篩選）。

> 注意：使用 ES modules 與打包，**不能直接雙擊 index.html 開啟**；請用 `npm run dev` 或部署 `dist/`。

---

## 📁 架構

分層原則：**`core/`、`data/`、`systems/` 是純 TypeScript 邏輯，不得引用 DOM 或 Three.js**，因此可以完整單元測試。`render/`、`ui/`、`audio/` 只負責呈現，`game/Game.ts` 負責把兩邊接起來。

```
index.html                 HTML 殼層（舞台、側欄、標題畫面）
src/main.ts                啟動；WebGL 失敗時顯示友善訊息
src/core/
  rng.ts                   可設種子的 mulberry32 亂數（所有邏輯一律用它）
  state.ts                 PlayerState 型別、初始角色
  save.ts                  版本化存檔、讀檔正規化、儲存空間容錯
src/data/                  ★ 遊戲資料的唯一來源（取代舊版 *.json + game_data.js）
  items.ts                 物品、裝備欄位、稀有度、安定值、售價規則
  monsters.ts              22 隻怪物：倍率、招式、掉落、程序化模型規格
  floors.ts                7 層樓：等級區間、怪物池、首領、主題配色/迷霧/環境音
  skills.ts                騎士技能（依等級解鎖）
  shop.ts                  商店清單（依最深樓層進貨）、旅館費用
src/systems/
  progression.ts           經驗曲線、屬性成長、裝備加成、死亡懲罰
  combat.ts                回合制戰鬥解算器（純函式 + 事件列表）
  dungeonGen.ts            房間＋走廊地圖生成、樓梯、首領、寶箱、火把
  exploration.ts           格子移動、怪物追擊 AI、戰爭迷霧、視線
  inventory.ts             背包、裝備、消耗品、衝裝、買賣
  loot.ts                  寶箱與首領獎勵
src/render/
  Renderer.ts              Scene/Camera rig/主迴圈/鏡頭震動/投影
  Tween.ts                 集中式 delta-time 補間（回傳 Promise）
  textures.ts              Canvas 程序化材質（石磚、石板、岩石、草地、光暈、火焰、刀光）
  DungeonView.ts           InstancedMesh 牆地天花板、樓梯、火把光源池、裝飾
  VillageView.ts           奇岩村夜景（營火、房舍、攤位、星空）
  MonsterView.ts           怪物動畫：待機/移動/攻擊/受擊/蓄力/死亡
  HeroView.ts              第一人稱武器與盾牌
  effects.ts               粒子爆發、刀光、投射物
  models/                  kit（材質/幾何工具）、humanoid、beasts、weapons、chest
src/audio/Audio.ts         Web Audio 合成音效與環境音
src/ui/                    dom 建構器、Hud、Log、Minimap、Fx（浮字/閃光/橫幅）、Modal、panels
src/game/Game.ts           狀態機（title/village/dungeon/combat/dead）、輸入、戰鬥演出、存檔時機
tests/                     Vitest：combat、dungeonGen、inventory、progression、save、balance（+ sim.ts 機器人）
dev/gallery.*              開發用模型展示頁（不進正式建置）
```

### 遊戲流程
- **村莊**：進入地監（到過 2F 以上時可傳送到任一已抵達樓層）、商店（B）、旅館（N）。
- **探索**：W/S 前後、A/D 轉向、Q/E 平移、手機虛擬方向鍵。撞到寶箱即開啟；撞到樓梯出現確認提示；撞到怪物或被怪物追上即進入戰鬥。
- **戰鬥**：攻擊（Space）、技能（Z X C V B）、防禦（F，減傷 55% 並回魔）、道具（消耗回合）、逃跑（R，首領不可逃）。
- **首領**：3F/5F 從「西瑪、巴土瑟、卡士伯、馬庫爾」依本次冒險種子各選一位，守在下樓梯旁；未擊敗前樓梯被封印。7F 為死亡騎士，擊敗即通關（可繼續遊玩）。
- **死亡**：不刪檔。損失本級所需經驗 10%（不降級）與 10% 金幣，在村莊滿血復活。

---

## ⚠️ 開發守則（必須遵守）

1. **邏輯與呈現分離**：`systems/` 不得 import `three` 或操作 DOM。新規則先寫在 systems 並補測試，再到 Game/render 做演出。
2. **單一資料來源**：所有怪物/物品/樓層數值只存在 `src/data/*.ts`。新增物品或怪物後，`tests/combat.test.ts` 會驗證掉落物 key 存在；改數值後務必跑 `npm test`（含平衡模擬）。
3. **亂數**：邏輯層一律透過 `Rng`（`core/rng.ts`），不可直接用 `Math.random()`，否則測試無法重現。純視覺特效可用 `Math.random()`。
4. **動畫時間軸**：一律用 `renderer.tweens`（以 delta 推進），**禁止**寫「每幀 +0.08」的 `requestAnimationFrame` 迴圈——那會讓動畫速度隨螢幕更新率改變。
5. **攝影機穩定**：攝影機掛在 `rig` 底下；rig 決定位置與朝向，`camera.position` 只用於震動，震動結束時硬性歸零。常態迴圈中禁止疊加任何攝影機搖擺。震動遵守 `prefers-reduced-motion`。
6. **光源數量固定**：場景中 PointLight 數量改變會讓 Three.js 重新編譯所有材質（卡頓）。火把使用固定大小的光源池；移除帶光源的怪物時保留光源並把亮度歸零（見 `DungeonView.removeMonster`）。
7. **安全的 DOM**：UI 一律用 `ui/dom.ts` 的 `h()` 與 `textContent` 建構，不可用 `innerHTML` 拼接字串、不可用 inline `onclick`。
8. **音效防護**：`audio` 的所有方法在 AudioContext 不可用時必須安靜失敗；AudioContext 只在使用者手勢後建立（`audio.unlock()`）。
9. **存檔相容**：變更 `PlayerState` 結構時，同步更新 `core/save.ts` 的 `normalizePlayer()`（缺欄位要給預設值），必要時提升 `SAVE_VERSION` 並寫遷移。
10. **焦點與鍵盤**：滑鼠點擊按鈕後會自動失焦；全域快捷鍵在焦點位於按鈕時不處理 Enter/Space，避免重複觸發。

---

## 🎨 UI 規範

- 色彩 token 定義於 `src/styles/main.css` 的 `:root`。暗色基調沿用：背景 `#1a202c`、容器 `#2d3748`、文字 `#e2e8f0`、邊框 `#4a5568`，點綴金色 `#d4a83a`。
- **稀有度色階不可變更**：普通 `.r-common`（灰）、罕見 `.r-uncommon`（綠）、稀有 `.r-rare`（藍）、傳說 `.r-legendary`（紅）。
- 按鈕 `.btn`：圓角 `0.75rem`、Hover 上移 2px；變體 `--danger`/`--success`/`--neutral`/`--gold`/`--ghost`/`--sm`。
- 版面：桌機為「3D 舞台＋右側 340px 角色面板」；≤900px 改為上下堆疊並顯示虛擬方向鍵。
- 文案一律使用繁體中文（台灣用語）。

---

## 📝 核心數值公式（`systems/progression.ts`、`systems/combat.ts`）

| 項目 | 公式 |
| :--- | :--- |
| 升級所需經驗 | `round(18 × L^1.85 + 12)`，上限 Lv50 |
| 玩家基礎屬性 | 體力 `80 + 14(L−1)`、魔力 `14 + 3(L−1)`、攻擊 `9 + 2(L−1)`、防禦 `1 + (L−1)` |
| 裝備強化 | 武器每 +1 攻擊 +2；防具每 +1 防禦 +1。安定值：武器 +6、防具 +4，超過後成功率 `max(10%, 50% − 10%×超出數)`，失敗則裝備蒸發 |
| 怪物屬性 | 體力 `(18 + 10L) × hpMul`、攻擊 `(6 + 2.5L) × atkMul`、防禦 `1.1L × defMul` |
| 怪物經驗 | `(6 × L^1.55 + 6) × xpMul` |
| 減傷 | `傷害 = 原始 × 40 / (40 + 防禦 × (1 − 穿透))`，最低 1 |
| 命中率 | `clamp(0.92 + 0.02 × (攻方等級 − 守方等級) + 修正, 0.55, 0.98)` |
| 暴擊 | 玩家 10%（勇敢 +15%）× 1.6；怪物 5% × 1.5 |
| 狀態 | 防禦減傷 55%；加速：攻擊後 35% 追加 0.8 倍一擊；勇敢：傷害 +15%；首領 HP ≤ 50% 狂暴（攻擊 ×1.3） |
| 逃跑率 | `clamp(0.6 + 0.04 × 等級差, 0.25, 0.9)`，首領 0 |

平衡由 `tests/balance.test.ts` 把關：1F 新手勝率 > 97%、同級戰鬥 3–10 回合、合理策略機器人 12 次中至少 11 次通關且平均死亡 < 4 次、通關等級落在 Lv22–32、首領戰 < 60 回合。

---

## ✅ 驗證流程

1. `npm run typecheck && npm test && npm run build`
2. `npm run dev`，實際操作：標題 → 命名 → 村莊（商店/旅館/背包）→ 1F 走動轉向 → 開寶箱 → 戰鬥（技能/防禦/道具）→ 升級 → 下樓 → 首領 → 陣亡回村 → 重新整理讀檔。可用 `__debug` 加速。
3. 縮到手機寬度（390px）確認版面與虛擬方向鍵。
