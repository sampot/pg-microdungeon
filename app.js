/**
 * pg-microdungeon 主程式：Canvas 渲染、輸入、回合流程、HUD、戰鬥 modal。
 *
 * 圖塊來源：Kenney 1-bit Pack colored_packed tilesheet（46×20，16×16 + 1px gap）
 * 圖塊索引（row, col）見 TILES 常數。
 *
 * 行動裝置：◀▲▼▶ 觸控鍵 + 點畫面 swipe
 * 鍵盤：WASD / 方向鍵 移動；Enter 確認；Esc 取消
 *
 * 戰鬥模態：顯示敵人資訊、HP 條，3 個動作按鈕
 */

import {
  TILE,
  VIEW_W,
  VIEW_H,
  generateDungeon,
  tryPlayerMove,
  combatAction,
  descendLevel,
  recomputeVisibility,
  FLOOR,
  WALL,
  DOOR,
  STAIRS,
  EXIT,
  CHEST,
} from "./game.js";
import { DungeonAudio } from "./audio.js";

const audio = new DungeonAudio();

const ATLAS_PATH = "assets/tiles/atlas.png";
const TILE_W = 16;       // atlas tile width
const TILE_H = 16;       // atlas tile height
const TILE_GAP = 1;      // 1px gap
const STRIDE = TILE_W + TILE_GAP; // 17

/**
 * (row, col) tile indices in the atlas. Determined by visual inspection.
 * (r, c) → source rect (col * STRIDE, row * STRIDE, TILE_W, TILE_H)
 */
const TILES = {
  floor:      { r: 1, c: 5  }, // cobblestone
  wall:       { r: 2, c: 0  }, // brown brick
  door:       { r: 5, c: 14 }, // red door
  stairs:     { r: 6, c: 13 }, // ladder down
  exit:       { r: 6, c: 13 }, // reuse stairs for exit (or use a portal)
  chest:      { r: 3, c: 5  }, // brown chest
  player:     { r: 10, c: 17 }, // blue knight idle
  playerWalk: { r: 9, c: 17 }, // walking pose
  enemy: {
    rat:               { r: 10, c: 8  },
    skeleton:          { r: 9, c: 9  },
    bat:               { r: 10, c: 7 },
    slime:             { r: 11, c: 8 },
    zombie:            { r: 12, c: 10 }, // skeleton with shield (alt)
    ghost:             { r: 12, c: 9 }, // slime purple
    skeleton_knight:   { r: 9, c: 10 },
    demon:             { r: 13, c: 9 }, // orange slime (reuse for demon)
  },
};

const KIND_LABEL = {
  rat: "巨鼠",
  skeleton: "骷髏兵",
  bat: "蝙蝠",
  slime: "史萊姆",
  zombie: "殭屍",
  ghost: "鬼魂",
  skeleton_knight: "骷髏騎士",
  demon: "惡魔",
};

const el = {
  canvas: document.getElementById("stage"),
  c: document.getElementById("stage").getContext("2d"),
  status: document.getElementById("status"),
  floorN: document.getElementById("floor-num"),
  hpText: document.getElementById("hp"),
  hpBar: document.getElementById("hp-bar"),
  gold: document.getElementById("gold"),
  potions: document.getElementById("potions"),
  atk: document.getElementById("atk"),
  log: document.getElementById("log"),
  btnMute: document.getElementById("btn-mute"),
  btnNewGame: document.getElementById("btn-newgame"),
  btnRestart: document.getElementById("btn-restart"),
  btnAttack: document.getElementById("btn-attack"),
  btnPotion: document.getElementById("btn-potion"),
  btnFlee: document.getElementById("btn-flee"),
  combat: document.getElementById("combat"),
  combatName: document.getElementById("combat-name"),
  combatHp: document.getElementById("combat-hp"),
  combatBar: document.getElementById("combat-bar"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayText: document.getElementById("overlay-text"),
  touchLeft: document.getElementById("t-left"),
  touchRight: document.getElementById("t-right"),
  touchUp: document.getElementById("t-up"),
  touchDown: document.getElementById("t-down"),
};

let state = {
  d: null,
  seed: null,
  anim: 0,
  drawScale: 1,
};

/* 載入圖 */
const atlas = new Image();
atlas.src = ATLAS_PATH;

function tileRect(t) {
  return {
    sx: t.c * STRIDE,
    sy: t.r * STRIDE,
    sw: TILE_W,
    sh: TILE_H,
  };
}

function tileAt(row, col) {
  return { sx: col * STRIDE, sy: row * STRIDE, sw: TILE_W, sh: TILE_H };
}

/* 等比縮放 canvas 內部繪圖 */
function fitCanvas() {
  const rect = el.canvas.getBoundingClientRect();
  const viewRatio = VIEW_W / VIEW_H;
  let h = rect.height;
  let w = rect.height * viewRatio;
  if (w > rect.width) {
    w = rect.width;
    h = rect.width / viewRatio;
  }
  return { w, h, ox: (rect.width - w) / 2, oy: (rect.height - h) / 2 };
}

function resizeCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = el.canvas.clientWidth;
  const h = el.canvas.clientHeight;
  el.canvas.width = Math.round(w * dpr);
  el.canvas.height = Math.round(h * dpr);
  el.c.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* 渲染 */
function draw() {
  if (!state.d) return;
  const f = fitCanvas();
  const ctx = el.c;
  state.drawScale = f.w / VIEW_W;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(0, 0, el.canvas.clientWidth, el.canvas.clientHeight);
  ctx.save();
  ctx.translate(f.ox, f.oy);
  ctx.scale(state.drawScale, state.drawScale);

  const d = state.d;
  const cx = d.player.x;
  const cy = d.player.y;
  const col0 = Math.max(0, cx - 9);
  const col1 = Math.min(d.w - 1, cx + 9);
  const row0 = Math.max(0, cy - 6);
  const row1 = Math.min(d.h - 1, cy + 6);

  // 視界外的格畫黑色霧
  for (let y = row0; y <= row1; y++) {
    for (let x = col0; x <= col1; x++) {
      const idx = y * d.w + x;
      const vis = d.visible[idx];
      const exp = d.explored[idx];
      const px = (x - col0) * TILE;
      const py = (y - row0) * TILE;
      if (!exp) {
        ctx.fillStyle = "#000";
        ctx.fillRect(px, py, TILE, TILE);
        continue;
      }
      if (!vis) {
        ctx.fillStyle = "#11131a";
        ctx.fillRect(px, py, TILE, TILE);
        continue;
      }
      // 畫圖塊
      const t = d.grid[y][x];
      let tile;
      switch (t) {
        case WALL: tile = TILES.wall; break;
        case DOOR: tile = TILES.door; break;
        case STAIRS: tile = TILES.stairs; break;
        case EXIT: tile = TILES.exit; break;
        case CHEST: tile = TILES.chest; break;
        default: tile = TILES.floor;
      }
      const r = tileRect(tile);
      ctx.drawImage(atlas, r.sx, r.sy, r.sw, r.sh, px, py, TILE, TILE);
    }
  }

  // 敵人
  for (const e of d.enemies) {
    if (!e.alive) continue;
    if (e.x < col0 || e.x > col1 || e.y < row0 || e.y > row1) continue;
    const idx = e.y * d.w + e.x;
    if (!d.visible[idx]) continue;
    const tk = TILES.enemy[e.kind] || TILES.enemy.skeleton;
    const r = tileRect(tk);
    const px = (e.x - col0) * TILE;
    const py = (e.y - row0) * TILE;
    ctx.drawImage(atlas, r.sx, r.sy, r.sw, r.sh, px, py, TILE, TILE);
    // HP 條
    const ratio = e.hp / e.maxHp;
    ctx.fillStyle = "#000";
    ctx.fillRect(px + 1, py - 3, TILE - 2, 2);
    ctx.fillStyle = ratio > 0.5 ? "#5cff5c" : ratio > 0.25 ? "#ffcd5c" : "#ff5c5c";
    ctx.fillRect(px + 1, py - 3, Math.floor((TILE - 2) * ratio), 2);
  }

  // 玩家
  {
    const px = (cx - col0) * TILE;
    const py = (cy - row0) * TILE;
    const tk = state.anim % 40 < 20 ? TILES.player : TILES.playerWalk;
    const r = tileRect(tk);
    ctx.drawImage(atlas, r.sx, r.sy, r.sw, r.sh, px, py, TILE, TILE);
  }

  // 視口框
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, VIEW_W, VIEW_H);

  ctx.restore();
}

/* HUD */
function updateHud() {
  if (!state.d) return;
  const d = state.d;
  el.floorN.textContent = String(d.level);
  el.hpText.textContent = `${Math.max(0, d.player.hp)}/${d.player.maxHp}`;
  const ratio = Math.max(0, d.player.hp) / d.player.maxHp;
  el.hpBar.style.width = `${Math.floor(ratio * 100)}%`;
  el.hpBar.style.background = ratio > 0.5 ? "#5cff5c" : ratio > 0.25 ? "#ffcd5c" : "#ff5c5c";
  el.gold.textContent = String(d.player.gold);
  el.potions.textContent = String(d.player.potions);
  el.atk.textContent = String(d.player.atk);
  el.log.innerHTML = "";
  for (const item of d.log.slice(0, 6)) {
    const li = document.createElement("li");
    li.dataset.tone = item.kind;
    li.textContent = item.text;
    el.log.appendChild(li);
  }
  // 戰鬥 modal
  if (d.state === "combat") {
    const e = d.enemies.find(
      (e) => e.alive && Math.abs(e.x - d.player.x) + Math.abs(e.y - d.player.y) === 1
    );
    if (e) {
      el.combat.dataset.show = "true";
      el.combatName.textContent = `${KIND_LABEL[e.kind] || e.kind}`;
      el.combatHp.textContent = `${e.hp}/${e.maxHp}`;
      el.combatBar.style.width = `${Math.floor((e.hp / e.maxHp) * 100)}%`;
    }
  } else {
    el.combat.dataset.show = "";
  }
  // 結束 overlay
  if (d.state === "dead" || d.state === "won") {
    el.overlay.dataset.show = "true";
    if (d.state === "won") {
      el.overlayTitle.textContent = "🎉 過關！";
      el.overlayTitle.dataset.tone = "win";
      el.overlayText.textContent = `完成 5 層地城，帶走 ${d.player.gold} 金幣。`;
    } else {
      el.overlayTitle.textContent = "💀 死亡";
      el.overlayTitle.dataset.tone = "die";
      el.overlayText.textContent = `倒在第 ${d.level} 樓，帶走 ${d.player.gold} 金幣。`;
    }
  } else {
    el.overlay.dataset.show = "";
  }
}

/* 流程 */
function newGame(seed) {
  state.seed = seed != null ? seed : Math.floor(Math.random() * 100000);
  state.d = generateDungeon(state.seed, 1, 5);
  recomputeVisibility(state.d);
  state.d.log.unshift({ kind: "system", text: `歡迎來到地下城，第 ${state.d.level} 樓` });
  audio.stopBgm();
  if (audio.enabled) audio.playBgm();
  setStatus("使用方向鍵或下方按鈕移動。");
}

function move(dx, dy) {
  if (!state.d) return;
  if (state.d.state !== "playing") return;
  audio.unlock();
  const before = state.d.player.hp;
  const r = tryPlayerMove(state.d, dx, dy);
  if (r.combat) {
    audio.play("draw_sword");
  } else if (r.moved) {
    audio.play("step");
  }
  if (r.descend) {
    audio.play("door");
    state.d = descendLevel(state.d);
    recomputeVisibility(state.d);
    audio.play("door");
    return;
  }
  if (r.won || (state.d.player.hp <= 0 && before > 0)) {
    audio.stopBgm();
    if (r.won) audio.play("spell");
  }
}

function setStatus(msg) {
  el.status.textContent = msg;
}

/* 輸入 */
function wireInput() {
  window.addEventListener("keydown", (e) => {
    audio.unlock();
    if (state.d && state.d.state === "combat") {
      // 戰鬥中：1=攻 2=藥 3=逃
      if (e.key === "1" || e.key === "Enter") { doCombat("attack"); e.preventDefault(); }
      if (e.key === "2") { doCombat("potion"); e.preventDefault(); }
      if (e.key === "3" || e.key === "Escape") { doCombat("flee"); e.preventDefault(); }
      return;
    }
    if (e.repeat) return;
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") move(-1, 0);
    else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") move(1, 0);
    else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") move(0, -1);
    else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") move(0, 1);
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); /* no-op */ }
  });

  // 觸控鍵
  const mk = (elx, fn) => {
    let pressed = false;
    const start = (e) => { e.preventDefault(); audio.unlock(); pressed = true; fn(); };
    const end = (e) => { e.preventDefault(); pressed = false; };
    elx.addEventListener("touchstart", start, { passive: false });
    elx.addEventListener("touchend", end, { passive: false });
    elx.addEventListener("touchcancel", end, { passive: false });
    elx.addEventListener("mousedown", start);
    elx.addEventListener("mouseup", end);
    elx.addEventListener("mouseleave", end);
  };
  mk(el.touchLeft, () => move(-1, 0));
  mk(el.touchRight, () => move(1, 0));
  mk(el.touchUp, () => move(0, -1));
  mk(el.touchDown, () => move(0, 1));

  // 畫面 swipe
  let touchStart = null;
  el.canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    audio.unlock();
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  el.canvas.addEventListener("touchend", (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (Math.max(adx, ady) > 24) {
      if (adx > ady) move(dx > 0 ? 1 : -1, 0);
      else move(0, dy > 0 ? 1 : -1);
    } else if (Date.now() - touchStart.t < 250) {
      move(0, -1); // tap = up
    }
    touchStart = null;
  }, { passive: true });

  // 按鈕
  el.btnNewGame.addEventListener("click", () => newGame());
  el.btnRestart.addEventListener("click", () => newGame(state.seed));
  el.btnMute.addEventListener("click", () => {
    const on = !audio.enabled;
    audio.setEnabled(on);
    el.btnMute.setAttribute("aria-pressed", String(on));
    el.btnMute.textContent = on ? "音效開" : "音效關";
    if (on) audio.playBgm();
    else audio.stopBgm();
  });

  el.btnAttack.addEventListener("click", () => doCombat("attack"));
  el.btnPotion.addEventListener("click", () => doCombat("potion"));
  el.btnFlee.addEventListener("click", () => doCombat("flee"));

  window.addEventListener("resize", resizeCanvas);
}

function doCombat(action) {
  if (!state.d || state.d.state !== "combat") return;
  audio.unlock();
  const r = combatAction(state.d, action);
  // 音效
  if (action === "attack") audio.play("sword");
  else if (action === "potion") audio.play("coin2");
  else audio.play("step");
  if (r.death) audio.play("hurt");
  if (r.victory) audio.play("pickup");
  // 戰鬥結束 → 敵人回合（若存活）
  if (r.done) {
    if (!r.death && !r.victory && state.d.state === "playing") {
      // 已逃脫或回合未結束時，敵不會再動因為 combatAction 已經處理
    }
  }
}

/* 主迴圈 */
function tick() {
  state.anim++;
  draw();
  updateHud();
  requestAnimationFrame(tick);
}

/* 啟動 */
async function init() {
  try {
    resizeCanvas();
    wireInput();
    await audio.unlock();
    await audio.preloadAll();
    // 預先下載圖塊（atlas）
    if (!atlas.complete) {
      await new Promise((res) => { atlas.onload = res; atlas.onerror = res; });
    }
    newGame();
    requestAnimationFrame(tick);
  } catch (e) {
    console.error("[pg-microdungeon] init failed", e);
    setStatus("初始化失敗：" + (e?.message || e));
  }
}

init();

// devtools helper
if (typeof window !== "undefined") {
  window.__dung = { state, audio, get dungeon() { return state.d; } };
}