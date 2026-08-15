# pg-microdungeon

> 找符石、開出口、闖過三層的迷你迷宮；純前端、行動裝置優先、無依賴。

![kind](https://img.shields.io/badge/kind-game-7aa6cc) ![series](https://img.shields.io/badge/series-%E7%B2%BE%E7%B7%BB%E5%8F%AF%E7%8E%A9-ffcd5c) ![license](https://img.shields.io/badge/license-MIT-5cff5c)

`pg-microdungeon` 是 [Playgrounds](https://github.com/sampot/playgrounds) 系列中的短局 Roguelite：

- 每局隨機生成三層 21×15 迷宮；同一 seed 可重現
- 每層先找發光符石，再前往樓梯／最終出口
- 撞敵人即揮劍，敵人沒倒就立刻反擊，不切換戰鬥畫面
- 每擊破三隻怪物會提升攻擊與生命；寶箱提供藥水或古幣
- 敵人只在接近玩家後追擊，迷霧會保留已探索路線

## 執行

```bash
npx serve .
# 開 http://localhost:3000
```

無依賴、無建置：直接靜態伺服器即可。

## 控制

| 動作 | 鍵盤 | 觸控 |
| --- | --- | --- |
| 移動／攻擊 | WASD／方向鍵 | 畫面 swipe／點按方向／◀▲▼▶ |
| 喝藥水 | H／P | 「喝藥水」按鈕 |
| 新局 | 按鈕 | 按鈕 |

## 規則

- 撞向敵人會攻擊；敵人存活就反擊，倒下則玩家走進該格。
- 符石未入手前，樓梯／出口不會開啟。
- 喝藥水會消耗一回合；附近怪物仍會行動。
- 第三層出口開啟並抵達後即結算步數、擊破數與古幣。

## 檔案結構

```
index.html          # 主畫面
styles.css          # mobile-first 樣式
app.js              # Canvas 渲染、輸入、HUD、音效
game.js             # 迷宮生成、探索、追擊與碰撞戰鬥（純函式）
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