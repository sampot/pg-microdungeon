/**
 * pg-microdungeon 核心：每局隨機生成地牢、回合制行動、戰鬥、寶箱、樓梯。
 * 純 ESM、無 DOM，方便單元測試。
 *
 * 設計：
 * - 16×16 tile，每房 4–8 格寬，隨機 6–10 房；以「任意兩房之中心點走 L 形走廊」相連。
 * - 玩家／敵人輪流行動；回合輸入（WASD / 方向鍵）。
 * - 敵人先靠近玩家再攻。
 * - 寶箱：50% 給金幣／藥水／裝備。樓梯往下走新一關；最終第 N 樓為出口。
 * - 戰鬥：玩家先攻，若 hp > 0 → 敵回手；回合制螢幕跳出 modal。
 * - 視界：半徑 6 格的圓（曼哈頓距離），其餘以黑色遮罩表示「未探索」。
 * - 結束條件：玩家 hp=0 → 失敗；走到最終出口 → 勝利。
 */

export const TILE = 24;

export const FLOOR = 0;
export const WALL = 1;
export const DOOR = 2;
export const STAIRS = 3;
export const EXIT = 4;
export const CHEST = 5;
export const POTION = 6;

const TILE_PALETTE = {
  [FLOOR]: { name: "floor" },
  [WALL]: { name: "wall" },
  [DOOR]: { name: "door" },
  [STAIRS]: { name: "stairs" },
  [EXIT]: { name: "exit" },
  [CHEST]: { name: "chest" },
  [POTION]: { name: "potion" },
};

export const TILE_KIND = TILE_PALETTE;

/** Mulberry32 PRNG（給定 seed → 確定隨機；單元測試友善） */
export function rng(seed) {
  let t = seed | 0;
  return function () {
    t = (t + 0x6d2b79f5) | 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** 隨機整數 [lo, hi) */
function ri(rand, lo, hi) {
  return lo + Math.floor(rand() * (hi - lo));
}

/** 房間：寬高範圍隨機；不相交即可 */
function placeRooms(rand, w, h) {
  const rooms = [];
  const tries = 60;
  for (let i = 0; i < tries; i++) {
    const rw = ri(rand, 4, 8);
    const rh = ri(rand, 3, 6);
    const x = ri(rand, 1, w - rw - 1);
    const y = ri(rand, 1, h - rh - 1);
    const r = { x, y, w: rw, h: rh, cx: x + Math.floor(rw / 2), cy: y + Math.floor(rh / 2) };
    // 不與現有房間太近（保留 1 格走廊空間）
    let ok = true;
    for (const o of rooms) {
      if (r.x - 2 < o.x + o.w && r.x + r.w + 2 > o.x && r.y - 2 < o.y + o.h && r.y + r.h + 2 > o.y) {
        ok = false;
        break;
      }
    }
    if (ok) rooms.push(r);
    if (rooms.length >= 9) break;
  }
  return rooms;
}

function carveRoom(grid, r) {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      grid[y][x] = FLOOR;
    }
  }
}

function carveCorridor(grid, ax, ay, bx, by) {
  // L 形：先橫再豎；走隨機順序以增加多樣
  const horizFirst = Math.random() < 0.5;
  if (horizFirst) {
    carveH(grid, ax, ay, bx);
    carveV(grid, bx, ay, by);
  } else {
    carveV(grid, ax, ay, by);
    carveH(grid, ax, by, bx);
  }
}

function carveH(grid, ax, y, bx) {
  const [lo, hi] = ax < bx ? [ax, bx] : [bx, ax];
  for (let x = lo; x <= hi; x++) {
    if (grid[y][x] !== FLOOR) grid[y][x] = FLOOR;
  }
}

function carveV(grid, x, ay, by) {
  const [lo, hi] = ay < by ? [ay, by] : [by, ay];
  for (let y = lo; y <= hi; y++) {
    if (grid[y][x] !== FLOOR) grid[y][x] = FLOOR;
  }
}

/** 隨機生成地牢網格 + 樓梯位置 + 玩家起點。 */
export function generateDungeon(seed, level = 1, maxFloor = 5) {
  const rand = rng(seed + level * 7919);
  const w = 32;
  const h = 18;
  const grid = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) row.push(WALL);
    grid.push(row);
  }
  const rooms = placeRooms(rand, w, h);
  for (const r of rooms) carveRoom(grid, r);
  // 走廊：每房連到下一房（順序打亂）
  const order = rooms.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let i = 1; i < order.length; i++) {
    const a = order[i - 1];
    const b = order[i];
    carveCorridor(grid, a.cx, a.cy, b.cx, b.cy);
  }
  // 樓梯／出口
  const lastRoom = rooms[rooms.length - 1];
  const stairsRoom = rooms[rooms.length - 1 - Math.floor(rand() * Math.min(2, rooms.length - 1))];
  const stairs = { x: stairsRoom.cx, y: stairsRoom.cy };
  grid[stairs.y][stairs.x] = STAIRS;
  const exit = { x: lastRoom.cx, y: lastRoom.cy };
  if (level === maxFloor) grid[exit.y][exit.x] = EXIT;
  else grid[exit.y][exit.x] = STAIRS;
  // 敵人：每房一隻（除了第一房）
  const enemies = [];
  for (let i = 1; i < rooms.length; i++) {
    const r = rooms[i];
    if (r.cx === stairs.x && r.cy === stairs.y) continue;
    const kind = pickEnemyKind(rand, level);
    enemies.push({
      kind,
      x: r.cx,
      y: r.cy,
      hp: enemyHp(kind, level),
      maxHp: enemyHp(kind, level),
      atk: enemyAtk(kind, level),
      alive: true,
      turnDelay: 1, // 玩家先動；之後與玩家輪流
    });
  }
  // 寶箱：一個隨機房間放一個寶箱（金幣或藥水）
  let chestRoom = rooms[Math.floor(rand() * rooms.length)];
  let tries = 0;
  while ((chestRoom.cx === stairs.x && chestRoom.cy === stairs.y) && tries < 8) {
    chestRoom = rooms[Math.floor(rand() * rooms.length)];
    tries++;
  }
  const chest = {
    x: chestRoom.cx,
    y: chestRoom.cy,
    opened: false,
    kind: rand() < 0.5 ? "gold" : "potion",
    amount: ri(rand, 8 + level * 2, 18 + level * 4),
  };
  grid[chest.y][chest.x] = CHEST;
  return {
    seed,
    level,
    maxFloor,
    w,
    h,
    grid,
    rooms,
    stairs,
    exit,
    enemies,
    chest,
    player: { x: rooms[0].cx, y: rooms[0].cy, hp: 12, maxHp: 12, atk: 3, gold: 0, potions: 1 },
    explored: new Uint8Array(w * h),
    visible: new Uint8Array(w * h),
    log: [],
    state: "playing", // playing | combat | won | dead
  };
}

function pickEnemyKind(rand, level) {
  const pool = ["rat", "skeleton", "bat"];
  if (level >= 2) pool.push("slime", "zombie");
  if (level >= 3) pool.push("ghost", "skeleton_knight");
  if (level >= 4) pool.push("demon");
  return pool[Math.floor(rand() * pool.length)];
}

function enemyHp(kind, level) {
  const base = { rat: 4, skeleton: 6, bat: 3, slime: 5, zombie: 7, ghost: 6, skeleton_knight: 9, demon: 11 }[kind] || 5;
  return base + Math.floor(level * 1.4);
}
function enemyAtk(kind, level) {
  const base = { rat: 1, skeleton: 2, bat: 1, slime: 1, zombie: 2, ghost: 2, skeleton_knight: 3, demon: 4 }[kind] || 1;
  return base + Math.floor(level * 0.5);
}

/** 計算迷霧：曼哈頓距離 ≤ radius 為可見；曾經可見為 explored。 */
export function recomputeVisibility(d) {
  const r = 6;
  for (let y = 0; y < d.h; y++) {
    for (let x = 0; x < d.w; x++) {
      const idx = y * d.w + x;
      if (d.grid[y][x] === WALL || d.grid[y][x] === DOOR) {
        // 牆只貼鄰才算可見
        if (Math.abs(x - d.player.x) + Math.abs(y - d.player.y) <= r + 1) {
          d.visible[idx] = 1;
        } else {
          d.visible[idx] = 0;
        }
      } else {
        d.visible[idx] = Math.abs(x - d.player.x) + Math.abs(y - d.player.y) <= r ? 1 : 0;
      }
      if (d.visible[idx]) d.explored[idx] = 1;
    }
  }
}

/** 嘗試玩家往 (dx, dy) 走一步。回傳 { moved, encounter, blocked, combat? } */
export function tryPlayerMove(d, dx, dy) {
  if (d.state !== "playing") return { blocked: true };
  const nx = d.player.x + dx;
  const ny = d.player.y + dy;
  if (nx < 0 || ny < 0 || nx >= d.w || ny >= d.h) return { blocked: true };
  const t = d.grid[ny][nx];
  if (t === WALL || t === DOOR) return { blocked: true };
  // 撞敵 → 開打
  const e = d.enemies.find((e) => e.alive && e.x === nx && e.y === ny);
  if (e) {
    return startCombat(d, e);
  }
  d.player.x = nx;
  d.player.y = ny;
  recomputeVisibility(d);
  // 踩樓梯/出口/寶箱
  if (t === STAIRS && d.level < d.maxFloor) {
    return { moved: true, descend: true };
  }
  if (t === EXIT) {
    d.state = "won";
    return { moved: true, won: true };
  }
  if (t === CHEST && !d.chest.opened) {
    openChest(d);
  }
  // 敵人回合（若仍存活）
  enemyTurn(d);
  return { moved: true };
}

function openChest(d) {
  d.chest.opened = true;
  d.grid[d.chest.y][d.chest.x] = FLOOR;
  if (d.chest.kind === "gold") {
    d.player.gold += d.chest.amount;
    d.log.unshift({ kind: "loot", text: `獲得 ${d.chest.amount} 金幣` });
  } else {
    d.player.potions += 1;
    d.log.unshift({ kind: "loot", text: "撿到一瓶藥水" });
  }
}

/** 敵人回合：朝玩家走近一步（沿最少軸），相鄰則不動。 */
function enemyTurn(d) {
  for (const e of d.enemies) {
    if (!e.alive) continue;
    if (Math.abs(e.x - d.player.x) + Math.abs(e.y - d.player.y) === 1) {
      // 相鄰，敵人暫不攻擊；攻擊發生在 combat modal（玩家撞過去）
      continue;
    }
    // 朝玩家移 1 格
    const dx = Math.sign(d.player.x - e.x);
    const dy = Math.sign(d.player.y - e.y);
    // 嘗試先橫後豎；不通就反之
    if (dx !== 0 && canStep(d, e.x + dx, e.y, e)) {
      e.x += dx;
    } else if (dy !== 0 && canStep(d, e.x, e.y + dy, e)) {
      e.y += dy;
    } else if (dy !== 0 && canStep(d, e.x + dx, e.y, e)) {
      // 也允許改走另一軸
      e.x += dx;
    }
  }
  recomputeVisibility(d);
}

function canStep(d, x, y, me) {
  if (x < 0 || y < 0 || x >= d.w || y >= d.h) return false;
  const t = d.grid[y][x];
  if (t === WALL || t === DOOR || t === CHEST || t === STAIRS || t === EXIT) return false;
  if (d.enemies.some((o) => o !== me && o.alive && o.x === x && o.y === y)) return false;
  if (x === d.player.x && y === d.player.y) return false;
  return true;
}

/** 玩家撞到敵人：開戰。回傳 { combat: { enemy, log } } */
function startCombat(d, e) {
  d.state = "combat";
  return { combat: { enemy: e } };
}

/** 玩家在戰鬥選項：attack / flee / potion。回傳 { done, log, flee?, death?, victory? } */
export function combatAction(d, action) {
  if (d.state !== "combat") return { done: true };
  // 找出最近敵
  const e = d.enemies.find((e) => e.alive && Math.abs(e.x - d.player.x) + Math.abs(e.y - d.player.y) === 1);
  if (!e) {
    d.state = "playing";
    return { done: true, log: [{ kind: "system", text: "敵人不見了" }] };
  }
  if (action === "flee") {
    // 50% 成功：玩家退一步
    if (Math.random() < 0.5) {
      d.state = "playing";
      return { done: true, log: [{ kind: "system", text: "成功逃脫" }] };
    }
    // 失敗 → 敵人先打
    return enemyStrike(d, e);
  }
  if (action === "potion") {
    if (d.player.potions <= 0) {
      return { done: false, log: [{ kind: "system", text: "藥水用完" }] };
    }
    d.player.potions -= 1;
    d.player.hp = Math.min(d.player.maxHp, d.player.hp + 5);
    return enemyStrike(d, e);
  }
  // attack
  const dmg = Math.max(1, d.player.atk + Math.floor(Math.random() * 2));
  e.hp -= dmg;
  if (e.hp <= 0) {
    e.alive = false;
    d.player.gold += 3 + d.level;
    d.state = "playing";
    return { done: true, victory: true, log: [{ kind: "kill", text: `${labelKind(e.kind)} 被打倒 (+${3 + d.level} 金幣)` }] };
  }
  return enemyStrike(d, e);
}

function enemyStrike(d, e) {
  const dmg = Math.max(1, e.atk + Math.floor(Math.random() * 2));
  d.player.hp -= dmg;
  if (d.player.hp <= 0) {
    d.state = "dead";
    d.player.hp = 0;
    return { done: true, death: true, log: [{ kind: "death", text: `被 ${labelKind(e.kind)} 打倒 (-${dmg} HP)` }] };
  }
  return { done: false, log: [{ kind: "strike", text: `${labelKind(e.kind)} 還擊 -${dmg} HP` }] };
}

function labelKind(k) {
  return {
    rat: "巨鼠",
    skeleton: "骷髏兵",
    bat: "蝙蝠",
    slime: "史萊姆",
    zombie: "殭屍",
    ghost: "鬼魂",
    skeleton_knight: "骷髏騎士",
    demon: "惡魔",
  }[k] || k;
}

/** 下一樓。生成下一個 dungeon 並保留玩家屬性。 */
export function descendLevel(d) {
  const next = generateDungeon(d.seed, d.level + 1, d.maxFloor);
  next.player.hp = d.player.hp;
  next.player.maxHp = d.player.maxHp;
  next.player.atk = d.player.atk;
  next.player.gold = d.player.gold;
  next.player.potions = d.player.potions;
  recomputeVisibility(next);
  next.log.unshift({ kind: "system", text: `走下樓梯，抵達第 ${next.level} 樓` });
  return next;
}

export const VIEW_W = 18 * TILE;
export const VIEW_H = 12 * TILE;