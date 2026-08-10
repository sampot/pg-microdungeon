# pg-microdungeon

> 逐層往下的回合制地城探索（5 樓過關）；純前端、行動裝置優先、無依賴。

![kind](https://img.shields.io/badge/kind-game-7aa6cc) ![series](https://img.shields.io/badge/series-%E7%B2%BE%E7%B7%BB%E5%8F%AF%E7%8E%A9-ffcd5c) ![license](https://img.shields.io/badge/license-MIT-5cff5c)

`pg-microdungeon` 是 [Playgrounds](https://github.com/sampot/playgrounds) 系列中的一個小型 Roguelite：

- 每局隨機生成 5 樓地城（房間＋走廊）
- 回合制移動（WASD／方向鍵／觸控／畫面 swipe）
- 房間裡有敵人、寶箱（金幣或藥水）、樓梯往下
- 敵人與玩家輪流行動；碰到敵人進入回合制戰鬥
- 最終樓有出口，抵達即過關

## 執行

```bash
npx serve .
# 開 http://localhost:3000
```

無依賴、無建置：直接靜態伺服器即可。

## 控制

| 動作 | 鍵盤 | 觸控 |
| --- | --- | --- |
| 移動 | WASD／方向鍵 | 畫面 swipe / 右下 ◀▲▼▶ |
| 戰鬥 | 1 攻／2 藥／3 逃 | modal 按鈕 |
| 新局 | 按鈕 | 按鈕 |

## 規則

- 進入敵人鄰格 → 戰鬥面板（玩家先手）。
- 樓梯往下 → 新一樓，敵人變強。
- 寶箱：50% 金幣、50% 藥水。
- 死亡或過關顯示結算。

## 檔案結構

```
index.html          # 主畫面
styles.css          # mobile-first 樣式
app.js              # Canvas 渲染、輸入、HUD、戰鬥 modal
game.js             # 迷宮生成、回合、戰鬥邏輯（純函式）
audio.js            # Web Audio 載入 + BGM loop
game.test.js        # vitest 單元測試
functions.js        # Playgrounds Worker functions hook（預留）
assets/
  tiles/atlas.png   # Kenney 1-bit Pack tilesheet
  tiles/License.txt # CC0
  sfx/*.ogg         # 動作音效 + Perilous Dungeon BGM（CC0）
```

## 開發

```bash
npx vitest run
```

## 授權

MIT（程式碼）。

遊戲素材全部 CC0，署名見 [ATTRIBUTION.md](./ATTRIBUTION.md)。