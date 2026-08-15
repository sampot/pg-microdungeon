import { DungeonAudio } from "./audio.js";
import {
  CHEST,
  EXIT,
  FLOOR,
  RELIC,
  STAIRS,
  TILE,
  VIEW_H,
  VIEW_W,
  WALL,
  descendLevel,
  drinkPotion,
  enemyLabel,
  generateDungeon,
  tryPlayerMove,
} from "./game.js";

const ATLAS_PATH = "assets/tiles/atlas.png";
const SOURCE_TILE = 16;
const VIEW_COLS = VIEW_W / TILE;
const VIEW_ROWS = VIEW_H / TILE;
const FLOOR_COLOR = "#472d3c";

// atlas.png 是 Kenney colored_packed：49×22、每格 16×16、格間距 0。
const SPRITES = {
  player: { r: 7, c: 24 },
  enemies: {
    rat: { r: 7, c: 28 },
    bat: { r: 8, c: 26 },
    slime: { r: 8, c: 23 },
    skeleton: { r: 8, c: 27 },
    ghost: { r: 8, c: 25 },
    guard: { r: 8, c: 30 },
    demon: { r: 8, c: 22 },
  },
};

const elements = {
  canvas: document.getElementById("stage"),
  floor: document.getElementById("floor-num"),
  hp: document.getElementById("hp"),
  hpBar: document.getElementById("hp-bar"),
  healthTrack: document.querySelector(".health-track"),
  atk: document.getElementById("atk"),
  gold: document.getElementById("gold"),
  kills: document.getElementById("kills"),
  potions: document.getElementById("potions"),
  quest: document.querySelector(".quest"),
  questIcon: document.getElementById("quest-icon"),
  questTitle: document.getElementById("quest-title"),
  status: document.getElementById("status"),
  log: document.getElementById("log"),
  overlay: document.getElementById("overlay"),
  overlayMark: document.getElementById("overlay-mark"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayText: document.getElementById("overlay-text"),
  restart: document.getElementById("btn-restart"),
  newGame: document.getElementById("btn-newgame"),
  potion: document.getElementById("btn-potion"),
  mute: document.getElementById("btn-mute"),
  directions: {
    up: document.getElementById("t-up"),
    left: document.getElementById("t-left"),
    down: document.getElementById("t-down"),
    right: document.getElementById("t-right"),
  },
};

const context = elements.canvas.getContext("2d");
const atlas = new Image();
atlas.src = ATLAS_PATH;
const audio = new DungeonAudio();

const state = {
  dungeon: null,
  seed: 0,
  frame: 0,
  pixelRatio: 1,
  audioStarted: false,
  overlayShown: false,
  impact: null,
};

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function resizeCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  state.pixelRatio = ratio;
  const width = elements.canvas.clientWidth;
  const height = elements.canvas.clientHeight;
  elements.canvas.width = Math.round(width * ratio);
  elements.canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.imageSmoothingEnabled = false;
}

function cameraFor(dungeon) {
  return {
    x: clamp(dungeon.player.x - Math.floor(VIEW_COLS / 2), 0, dungeon.w - VIEW_COLS),
    y: clamp(dungeon.player.y - Math.floor(VIEW_ROWS / 2), 0, dungeon.h - VIEW_ROWS),
  };
}

function fitStage() {
  const width = elements.canvas.clientWidth;
  const height = elements.canvas.clientHeight;
  const scale = Math.min(width / VIEW_W, height / VIEW_H);
  return {
    scale,
    x: (width - VIEW_W * scale) / 2,
    y: (height - VIEW_H * scale) / 2,
  };
}

function drawSprite(sprite, x, y, size = TILE) {
  if (!atlas.complete || !atlas.naturalWidth) return false;
  context.drawImage(
    atlas,
    sprite.c * SOURCE_TILE,
    sprite.r * SOURCE_TILE,
    SOURCE_TILE,
    SOURCE_TILE,
    x,
    y,
    size,
    size,
  );
  return true;
}

function drawFloor(x, y, mapX, mapY) {
  context.fillStyle = FLOOR_COLOR;
  context.fillRect(x, y, TILE, TILE);
  const pattern = (mapX * 13 + mapY * 7) % 5;
  context.fillStyle = pattern < 2 ? "#553447" : "#3d2735";
  context.fillRect(x + 4 + pattern * 3, y + 5 + (pattern % 3) * 7, 3, 3);
  context.fillRect(x + 22 - pattern * 2, y + 23 - (pattern % 2) * 8, 2, 2);
}

function drawWall(x, y, mapX, mapY) {
  context.fillStyle = "#211626";
  context.fillRect(x, y, TILE, TILE);
  context.fillStyle = "#33233a";
  context.fillRect(x + 1, y + 1, TILE - 2, TILE - 3);
  context.strokeStyle = "#563750";
  context.lineWidth = 2;
  context.strokeRect(x + 2, y + 3, 13, 10);
  context.strokeRect(x + 17, y + 3, 13, 10);
  context.strokeRect(x + 8, y + 15, 16, 10);
  if ((mapX + mapY) % 4 === 0) {
    context.fillStyle = "#6a3f58";
    context.fillRect(x + 4, y + 27, 5, 2);
  }
}

function drawChest(x, y) {
  context.fillStyle = "#2d1a24";
  context.fillRect(x + 5, y + 9, 22, 18);
  context.fillStyle = "#bd694b";
  context.fillRect(x + 6, y + 8, 20, 8);
  context.fillStyle = "#8b463e";
  context.fillRect(x + 6, y + 17, 20, 9);
  context.fillStyle = "#ffd166";
  context.fillRect(x + 14, y + 14, 4, 7);
  context.fillStyle = "#582e38";
  context.fillRect(x + 5, y + 16, 22, 2);
}

function drawRelic(x, y) {
  const pulse = state.frame % 50 < 25 ? 1 : 0;
  context.fillStyle = pulse ? "rgb(103 197 232 / 22%)" : "rgb(103 197 232 / 12%)";
  context.fillRect(x + 3, y + 3, 26, 26);
  context.fillStyle = "#b9efff";
  context.beginPath();
  context.moveTo(x + 16, y + 4);
  context.lineTo(x + 25, y + 15);
  context.lineTo(x + 16, y + 28);
  context.lineTo(x + 7, y + 15);
  context.closePath();
  context.fill();
  context.fillStyle = "#47a9d2";
  context.fillRect(x + 14, y + 9, 4, 14);
}

function drawGoal(x, y, final, unlocked) {
  context.fillStyle = unlocked ? "#654c2e" : "#30283b";
  context.fillRect(x + 5, y + 3, 22, 27);
  context.fillStyle = unlocked ? "#ffd166" : "#796a84";
  if (final) {
    context.fillRect(x + 8, y + 7, 16, 3);
    context.fillRect(x + 10, y + 12, 12, 14);
    context.fillStyle = "#1d172b";
    context.fillRect(x + 14, y + 17, 4, 9);
  } else {
    for (let rung = 0; rung < 4; rung += 1) {
      context.fillRect(x + 9, y + 7 + rung * 6, 14, 2);
    }
    context.fillRect(x + 8, y + 5, 3, 23);
    context.fillRect(x + 21, y + 5, 3, 23);
  }
}

function drawFallbackEnemy(x, y, kind) {
  context.fillStyle = kind === "demon" ? "#f4b41b" : "#cfc6b8";
  context.fillRect(x + 7, y + 8, 18, 17);
  context.fillStyle = "#472d3c";
  context.fillRect(x + 11, y + 13, 3, 3);
  context.fillRect(x + 19, y + 13, 3, 3);
}

function drawDungeon() {
  if (!state.dungeon) return;
  const dungeon = state.dungeon;
  const fit = fitStage();
  const camera = cameraFor(dungeon);

  context.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
  context.fillStyle = "#050308";
  context.fillRect(0, 0, elements.canvas.clientWidth, elements.canvas.clientHeight);
  context.save();
  context.translate(fit.x, fit.y);
  context.scale(fit.scale, fit.scale);

  for (let row = 0; row < VIEW_ROWS; row += 1) {
    for (let column = 0; column < VIEW_COLS; column += 1) {
      const mapX = camera.x + column;
      const mapY = camera.y + row;
      const x = column * TILE;
      const y = row * TILE;
      const index = mapY * dungeon.w + mapX;

      if (!dungeon.explored[index]) {
        context.fillStyle = "#07050b";
        context.fillRect(x, y, TILE, TILE);
        continue;
      }

      const tile = dungeon.grid[mapY][mapX];
      if (tile === WALL) drawWall(x, y, mapX, mapY);
      else drawFloor(x, y, mapX, mapY);

      if (dungeon.visible[index]) {
        if (tile === CHEST) drawChest(x, y);
        else if (tile === RELIC) drawRelic(x, y);
        else if (tile === STAIRS) drawGoal(x, y, false, dungeon.player.hasRelic);
        else if (tile === EXIT) drawGoal(x, y, true, dungeon.player.hasRelic);
      } else {
        context.fillStyle = "rgb(5 3 8 / 72%)";
        context.fillRect(x, y, TILE, TILE);
      }
    }
  }

  for (const enemy of dungeon.enemies) {
    if (!enemy.alive) continue;
    const index = enemy.y * dungeon.w + enemy.x;
    if (!dungeon.visible[index]) continue;
    const x = (enemy.x - camera.x) * TILE;
    const y = (enemy.y - camera.y) * TILE;
    if (x < 0 || y < 0 || x >= VIEW_W || y >= VIEW_H) continue;

    const sprite = SPRITES.enemies[enemy.kind] || SPRITES.enemies.skeleton;
    if (!drawSprite(sprite, x, y)) drawFallbackEnemy(x, y, enemy.kind);
    if (enemy.hp < enemy.maxHp) {
      context.fillStyle = "#160d16";
      context.fillRect(x + 4, y + 2, 24, 4);
      context.fillStyle = "#ef5d60";
      context.fillRect(x + 5, y + 3, Math.round(22 * enemy.hp / enemy.maxHp), 2);
    }
  }

  const playerX = (dungeon.player.x - camera.x) * TILE;
  const playerY = (dungeon.player.y - camera.y) * TILE;
  context.fillStyle = dungeon.player.hasRelic ? "rgb(255 209 102 / 24%)" : "rgb(103 197 232 / 16%)";
  context.fillRect(playerX + 2, playerY + 2, 28, 28);
  if (!drawSprite(SPRITES.player, playerX, playerY)) {
    context.fillStyle = "#67c5e8";
    context.fillRect(playerX + 8, playerY + 5, 16, 23);
  }

  if (state.impact && state.frame - state.impact.frame < 8) {
    const x = (state.impact.x - camera.x) * TILE;
    const y = (state.impact.y - camera.y) * TILE;
    context.strokeStyle = "#fff3bd";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(x + 5, y + 26);
    context.lineTo(x + 27, y + 5);
    context.stroke();
  }

  context.strokeStyle = "#6d4c72";
  context.lineWidth = 2;
  context.strokeRect(1, 1, VIEW_W - 2, VIEW_H - 2);
  context.restore();
}

function setStatus(message) {
  elements.status.textContent = message;
}

function updateInterface() {
  if (!state.dungeon) return;
  const dungeon = state.dungeon;
  const hpRatio = dungeon.player.hp / dungeon.player.maxHp;

  elements.floor.textContent = String(dungeon.level);
  elements.hp.textContent = `${dungeon.player.hp} / ${dungeon.player.maxHp}`;
  elements.hpBar.style.width = `${Math.max(0, hpRatio * 100)}%`;
  elements.hpBar.style.background = hpRatio > 0.5 ? "#7bd389" : hpRatio > 0.25 ? "#ffd166" : "#ef5d60";
  elements.healthTrack.setAttribute("aria-valuemax", String(dungeon.player.maxHp));
  elements.healthTrack.setAttribute("aria-valuenow", String(dungeon.player.hp));
  elements.atk.textContent = String(dungeon.player.atk);
  elements.gold.textContent = String(dungeon.player.gold);
  elements.kills.textContent = String(dungeon.player.kills);
  elements.potions.textContent = String(dungeon.player.potions);
  elements.potion.disabled = dungeon.player.potions === 0 || dungeon.player.hp === dungeon.player.maxHp;

  elements.quest.dataset.complete = String(dungeon.player.hasRelic);
  elements.questIcon.textContent = dungeon.player.hasRelic ? "◆" : "◇";
  elements.questTitle.textContent = dungeon.player.hasRelic
    ? dungeon.level === dungeon.maxFloor ? "出口已開啟" : "樓梯已甦醒"
    : "尋找符石";

  elements.log.replaceChildren();
  for (const event of dungeon.log.slice(0, 3)) {
    const item = document.createElement("li");
    item.dataset.tone = event.kind;
    item.textContent = event.text;
    elements.log.append(item);
  }
  if (!dungeon.log.length) {
    const item = document.createElement("li");
    item.textContent = "迷宮深處傳來低沉的回音……";
    elements.log.append(item);
  }

  const ended = dungeon.state === "won" || dungeon.state === "dead";
  elements.overlay.dataset.show = ended ? "true" : "";
  elements.overlay.inert = !ended;
  if (ended) {
    const won = dungeon.state === "won";
    elements.overlayMark.textContent = won ? "✦" : "☠";
    elements.overlayTitle.textContent = won ? "符石征服者！" : "倒在迷宮裡";
    elements.overlayText.textContent = won
      ? `${dungeon.turns} 步穿越三層地城，擊破 ${dungeon.player.kills} 隻怪物，帶回 ${dungeon.player.gold} 枚古幣。`
      : `抵達地下 ${dungeon.level}F，擊破 ${dungeon.player.kills} 隻怪物。下一次會走得更遠。`;
    if (!state.overlayShown) {
      state.overlayShown = true;
      requestAnimationFrame(() => elements.restart.focus());
    }
  } else {
    state.overlayShown = false;
  }
}

async function wakeAudio() {
  await audio.unlock();
  if (!state.audioStarted && audio.enabled) {
    state.audioStarted = true;
    audio.playBgm();
  }
}

function newGame(seed) {
  state.seed = seed ?? Math.floor(Math.random() * 1_000_000);
  state.dungeon = generateDungeon(state.seed);
  state.dungeon.log.unshift({ kind: "system", text: "三層迷宮，一把劍。出發！" });
  state.impact = null;
  setStatus("在迷霧中找到發光符石，再前往出口。");
  updateInterface();
}

function move(dx, dy) {
  if (!state.dungeon || state.dungeon.state !== "playing") return;
  wakeAudio();
  const before = { x: state.dungeon.player.x + dx, y: state.dungeon.player.y + dy };
  const result = tryPlayerMove(state.dungeon, dx, dy);

  if (result.blocked) {
    audio.play("click");
    setStatus("石牆擋住了去路。");
  } else if (result.locked) {
    audio.play("click");
    setStatus("出口沉睡著；符石就在這一層。");
  } else if (result.hit) {
    state.impact = { ...before, frame: state.frame };
    audio.play(result.killed ? "pickup" : "sword");
    setStatus(result.killed ? "漂亮的一擊！繼續前進。" : "怪物反擊了，再撞一次！");
  } else if (result.relic) {
    audio.play("spell");
    setStatus(state.dungeon.level === state.dungeon.maxFloor ? "符石點亮最終出口！" : "符石點亮了通往下一層的樓梯！");
  } else if (result.chest) {
    audio.play("coin2");
    setStatus("寶箱打開了！");
  } else if (result.moved) {
    audio.play("step");
    setStatus(state.dungeon.player.hasRelic ? "出口已開啟，循著金光前進。" : "留意迷霧裡的藍色光芒。");
  }

  if (result.descend) {
    audio.play("door");
    state.dungeon = descendLevel(state.dungeon);
    setStatus(`抵達地下 ${state.dungeon.level}F；本層也藏著一枚符石。`);
  }
  if (result.death || result.won) audio.stopBgm();
  updateInterface();
}

function usePotion() {
  if (!state.dungeon) return;
  wakeAudio();
  const result = drinkPotion(state.dungeon);
  if (result.used) {
    audio.play("spell");
    setStatus("暖流穿過全身，生命恢復了。");
  }
  if (result.death) audio.stopBgm();
  updateInterface();
}

function bindDirection(button, dx, dy) {
  let repeatTimer = 0;
  let repeatInterval = 0;
  const stop = () => {
    window.clearTimeout(repeatTimer);
    window.clearInterval(repeatInterval);
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    move(dx, dy);
    repeatTimer = window.setTimeout(() => {
      repeatInterval = window.setInterval(() => move(dx, dy), 125);
    }, 320);
  });
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("lostpointercapture", stop);
}

function wireInput() {
  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    const moves = {
      arrowleft: [-1, 0],
      a: [-1, 0],
      arrowright: [1, 0],
      d: [1, 0],
      arrowup: [0, -1],
      w: [0, -1],
      arrowdown: [0, 1],
      s: [0, 1],
    };
    if (moves[key]) {
      event.preventDefault();
      move(...moves[key]);
    } else if (key === "h" || key === "p") {
      event.preventDefault();
      usePotion();
    }
  });

  bindDirection(elements.directions.up, 0, -1);
  bindDirection(elements.directions.left, -1, 0);
  bindDirection(elements.directions.down, 0, 1);
  bindDirection(elements.directions.right, 1, 0);

  let pointerStart = null;
  elements.canvas.addEventListener("pointerdown", (event) => {
    pointerStart = { x: event.clientX, y: event.clientY };
    elements.canvas.setPointerCapture?.(event.pointerId);
  });
  elements.canvas.addEventListener("pointerup", (event) => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 18) {
      if (Math.abs(dx) > Math.abs(dy)) move(Math.sign(dx), 0);
      else move(0, Math.sign(dy));
      return;
    }
    const rect = elements.canvas.getBoundingClientRect();
    const fromCenterX = event.clientX - (rect.left + rect.width / 2);
    const fromCenterY = event.clientY - (rect.top + rect.height / 2);
    if (Math.abs(fromCenterX) > Math.abs(fromCenterY)) move(Math.sign(fromCenterX), 0);
    else move(0, Math.sign(fromCenterY));
  });
  elements.canvas.addEventListener("pointercancel", () => {
    pointerStart = null;
  });

  elements.potion.addEventListener("click", usePotion);
  elements.restart.addEventListener("click", () => {
    wakeAudio();
    newGame();
  });
  elements.newGame.addEventListener("click", () => {
    wakeAudio();
    newGame();
  });
  elements.mute.addEventListener("click", () => {
    const muted = audio.enabled;
    audio.setEnabled(!muted);
    elements.mute.setAttribute("aria-pressed", String(muted));
    elements.mute.setAttribute("aria-label", muted ? "開啟音效" : "關閉音效");
    elements.mute.textContent = muted ? "×" : "♪";
    if (!muted) wakeAudio();
  });
  window.addEventListener("resize", resizeCanvas);
}

function tick() {
  state.frame += 1;
  drawDungeon();
  requestAnimationFrame(tick);
}

async function init() {
  resizeCanvas();
  wireInput();
  newGame();
  audio.preloadAll();
  requestAnimationFrame(tick);
}

init().catch((error) => {
  console.error("[pg-microdungeon] init failed", error);
  setStatus("迷宮暫時無法開啟，請重新整理。");
});

if (typeof window !== "undefined") {
  window.__dung = {
    state,
    get dungeon() {
      return state.dungeon;
    },
  };
}
