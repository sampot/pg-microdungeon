/**
 * 迷你地城核心。
 *
 * 一局三層，每層都是短小、可重玩的迷宮。玩家找到符石後前往出口；
 * 碰撞敵人即攻擊，不切換畫面，讓鍵盤、滑動與方向鍵都能一路玩到底。
 */

export const TILE = 32;
export const FLOOR = 0;
export const WALL = 1;
export const STAIRS = 2;
export const EXIT = 3;
export const CHEST = 4;
export const RELIC = 5;

export const VIEW_W = 15 * TILE;
export const VIEW_H = 11 * TILE;

export function rng(seed) {
  let value = seed | 0;
  return function random() {
    value = (value + 0x6d2b79f5) | 0;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(random, low, high) {
  return low + Math.floor(random() * (high - low));
}

function shuffle(random, values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [values[index], values[other]] = [values[other], values[index]];
  }
  return values;
}

function createGrid(width, height, value) {
  return Array.from({ length: height }, () => Array(width).fill(value));
}

function carveMaze(grid, random) {
  const width = grid[0].length;
  const height = grid.length;
  const stack = [{ x: 1, y: 1 }];
  grid[1][1] = FLOOR;

  while (stack.length) {
    const current = stack[stack.length - 1];
    const choices = shuffle(random, [
      { dx: 2, dy: 0 },
      { dx: -2, dy: 0 },
      { dx: 0, dy: 2 },
      { dx: 0, dy: -2 },
    ]).filter(({ dx, dy }) => {
      const x = current.x + dx;
      const y = current.y + dy;
      return x > 0 && y > 0 && x < width - 1 && y < height - 1 && grid[y][x] === WALL;
    });

    if (!choices.length) {
      stack.pop();
      continue;
    }

    const { dx, dy } = choices[0];
    grid[current.y + dy / 2][current.x + dx / 2] = FLOOR;
    grid[current.y + dy][current.x + dx] = FLOOR;
    stack.push({ x: current.x + dx, y: current.y + dy });
  }

  // 開幾條環路，避免每次走錯都必須原路折返。
  const walls = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (grid[y][x] !== WALL) continue;
      const horizontal = grid[y][x - 1] === FLOOR && grid[y][x + 1] === FLOOR;
      const vertical = grid[y - 1][x] === FLOOR && grid[y + 1][x] === FLOOR;
      if (horizontal !== vertical) walls.push({ x, y });
    }
  }
  shuffle(random, walls)
    .slice(0, 8)
    .forEach(({ x, y }) => {
      grid[y][x] = FLOOR;
    });
}

function distancesFrom(grid, start) {
  const width = grid[0].length;
  const height = grid.length;
  const distances = new Map([[`${start.x},${start.y}`, 0]]);
  const previous = new Map([[`${start.x},${start.y}`, null]]);
  const queue = [start];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const distance = distances.get(`${current.x},${current.y}`);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = `${x},${y}`;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (grid[y][x] === WALL || distances.has(key)) continue;
      distances.set(key, distance + 1);
      previous.set(key, `${current.x},${current.y}`);
      queue.push({ x, y });
    }
  }
  return { distances, previous, tiles: queue };
}

function chooseObjectives(grid, random, start) {
  const { distances, previous, tiles } = distancesFrom(grid, start);
  const ranked = tiles
    .filter((tile) => distances.get(`${tile.x},${tile.y}`) >= 6)
    .sort((a, b) => distances.get(`${b.x},${b.y}`) - distances.get(`${a.x},${a.y}`));
  const goal = ranked[0];
  const shortestPath = [];
  let pathKey = `${goal.x},${goal.y}`;
  while (pathKey) {
    const [x, y] = pathKey.split(",").map(Number);
    shortestPath.push({ x, y });
    pathKey = previous.get(pathKey);
  }
  shortestPath.reverse();
  const relicProgress = 0.45 + random() * 0.2;
  const relicIndex = Math.max(2, Math.min(shortestPath.length - 2, Math.floor(shortestPath.length * relicProgress)));
  const relic = shortestPath[relicIndex];
  return { goal, relic, floorTiles: tiles };
}

function enemyKind(random, level, index) {
  const pools = [
    ["slime", "bat", "rat"],
    ["skeleton", "ghost", "slime", "bat"],
    ["guard", "ghost", "skeleton", "demon"],
  ];
  const pool = pools[Math.min(level - 1, pools.length - 1)];
  return index === 0 && level === 3 ? "demon" : pool[randomInt(random, 0, pool.length)];
}

const ENEMY_STATS = {
  rat: { hp: 2, atk: 1 },
  bat: { hp: 2, atk: 1 },
  slime: { hp: 3, atk: 1 },
  skeleton: { hp: 4, atk: 2 },
  ghost: { hp: 3, atk: 2 },
  guard: { hp: 5, atk: 2 },
  demon: { hp: 8, atk: 3 },
};

function tileKey({ x, y }) {
  return `${x},${y}`;
}

export function generateDungeon(seed, level = 1, maxFloor = 3) {
  const width = 21;
  const height = 15;
  const random = rng(seed + level * 7919);
  const grid = createGrid(width, height, WALL);
  carveMaze(grid, random);

  const playerStart = { x: 1, y: 1 };
  const { goal, relic, floorTiles } = chooseObjectives(grid, random, playerStart);
  grid[goal.y][goal.x] = level === maxFloor ? EXIT : STAIRS;
  grid[relic.y][relic.x] = RELIC;

  const occupied = new Set([tileKey(playerStart), tileKey(goal), tileKey(relic)]);
  const placementPool = shuffle(
    random,
    floorTiles.filter(({ x, y }) => {
      const distance = Math.abs(x - playerStart.x) + Math.abs(y - playerStart.y);
      return distance > 5 && grid[y][x] === FLOOR;
    }),
  );

  const chests = [];
  for (let index = 0; index < 2; index += 1) {
    const tile = placementPool.find((candidate) => !occupied.has(tileKey(candidate)));
    if (!tile) break;
    occupied.add(tileKey(tile));
    grid[tile.y][tile.x] = CHEST;
    chests.push({
      ...tile,
      opened: false,
      kind: index === 0 ? "potion" : "gold",
      amount: index === 0 ? 1 : 5 + level * 3,
    });
  }

  const enemies = [];
  const enemyCount = 3 + level;
  for (let index = 0; index < enemyCount; index += 1) {
    const tile = placementPool.find((candidate) => !occupied.has(tileKey(candidate)));
    if (!tile) break;
    occupied.add(tileKey(tile));
    const kind = enemyKind(random, level, index);
    const base = ENEMY_STATS[kind];
    const hp = base.hp + Math.max(0, level - 1);
    enemies.push({ kind, ...tile, hp, maxHp: hp, atk: base.atk, alive: true });
  }

  const dungeon = {
    seed,
    level,
    maxFloor,
    w: width,
    h: height,
    grid,
    goal,
    relic,
    chests,
    enemies,
    player: {
      ...playerStart,
      hp: 14,
      maxHp: 14,
      atk: 2,
      gold: 0,
      potions: 2,
      kills: 0,
      hasRelic: false,
    },
    turns: 0,
    explored: new Uint8Array(width * height),
    visible: new Uint8Array(width * height),
    log: [],
    state: "playing",
  };
  recomputeVisibility(dungeon);
  return dungeon;
}

function addLog(dungeon, kind, text) {
  dungeon.log.unshift({ kind, text });
  dungeon.log.length = Math.min(dungeon.log.length, 8);
}

export function recomputeVisibility(dungeon) {
  const radius = 6;
  dungeon.visible.fill(0);
  for (let y = 0; y < dungeon.h; y += 1) {
    for (let x = 0; x < dungeon.w; x += 1) {
      const distance = Math.abs(x - dungeon.player.x) + Math.abs(y - dungeon.player.y);
      const visible = distance <= radius + (dungeon.grid[y][x] === WALL ? 1 : 0);
      const index = y * dungeon.w + x;
      dungeon.visible[index] = visible ? 1 : 0;
      if (visible) dungeon.explored[index] = 1;
    }
  }
}

function livingEnemyAt(dungeon, x, y) {
  return dungeon.enemies.find((enemy) => enemy.alive && enemy.x === x && enemy.y === y);
}

function defeatEnemy(dungeon, enemy) {
  enemy.alive = false;
  dungeon.player.kills += 1;
  dungeon.player.gold += 2 + dungeon.level;
  addLog(dungeon, "kill", `${enemyLabel(enemy.kind)}倒下了！`);

  if (dungeon.player.kills % 3 === 0) {
    dungeon.player.atk += 1;
    dungeon.player.maxHp += 1;
    dungeon.player.hp = Math.min(dungeon.player.maxHp, dungeon.player.hp + 3);
    addLog(dungeon, "level", "勇氣提升：攻擊與生命上升！");
  }
}

function attackEnemy(dungeon, enemy) {
  enemy.hp -= dungeon.player.atk;
  dungeon.turns += 1;
  if (enemy.hp <= 0) {
    defeatEnemy(dungeon, enemy);
    dungeon.player.x = enemy.x;
    dungeon.player.y = enemy.y;
    const enemyResult = enemyTurn(dungeon);
    recomputeVisibility(dungeon);
    return {
      moved: true,
      hit: true,
      killed: true,
      hurt: enemyResult.hurt,
      death: enemyResult.death,
    };
  }

  dungeon.player.hp -= enemy.atk;
  addLog(dungeon, "strike", `${enemyLabel(enemy.kind)}反擊，生命 -${enemy.atk}`);
  if (dungeon.player.hp <= 0) {
    dungeon.player.hp = 0;
    dungeon.state = "dead";
    return { hit: true, death: true };
  }
  return { hit: true };
}

function openChest(dungeon, x, y) {
  const chest = dungeon.chests.find((item) => !item.opened && item.x === x && item.y === y);
  if (!chest) return;
  chest.opened = true;
  dungeon.grid[y][x] = FLOOR;
  if (chest.kind === "potion") {
    dungeon.player.potions += chest.amount;
    addLog(dungeon, "loot", "寶箱裡有一瓶紅藥水！");
  } else {
    dungeon.player.gold += chest.amount;
    addLog(dungeon, "loot", `找到 ${chest.amount} 枚古幣！`);
  }
}

export function tryPlayerMove(dungeon, dx, dy) {
  if (dungeon.state !== "playing") return { blocked: true };
  const x = dungeon.player.x + dx;
  const y = dungeon.player.y + dy;
  if (x < 0 || y < 0 || x >= dungeon.w || y >= dungeon.h) return { blocked: true };
  if (dungeon.grid[y][x] === WALL) return { blocked: true };

  const enemy = livingEnemyAt(dungeon, x, y);
  if (enemy) return attackEnemy(dungeon, enemy);

  const tile = dungeon.grid[y][x];
  if ((tile === STAIRS || tile === EXIT) && !dungeon.player.hasRelic) {
    addLog(dungeon, "locked", "出口沒有反應——先找到發光符石。");
    return { locked: true };
  }

  dungeon.player.x = x;
  dungeon.player.y = y;
  dungeon.turns += 1;

  const result = { moved: true };
  if (tile === CHEST) {
    openChest(dungeon, x, y);
    result.chest = true;
  } else if (tile === RELIC) {
    dungeon.player.hasRelic = true;
    dungeon.grid[y][x] = FLOOR;
    addLog(dungeon, "relic", "符石入手！出口的火焰亮起了。");
    result.relic = true;
  } else if (tile === STAIRS) {
    result.descend = true;
    return result;
  } else if (tile === EXIT) {
    dungeon.state = "won";
    result.won = true;
    return result;
  }

  const enemyResult = enemyTurn(dungeon);
  recomputeVisibility(dungeon);
  if (enemyResult.death) return { ...result, death: true };
  if (enemyResult.hurt) result.hurt = enemyResult.hurt;
  return result;
}

function passableForEnemy(dungeon, x, y, movingEnemy) {
  if (x < 0 || y < 0 || x >= dungeon.w || y >= dungeon.h) return false;
  if (dungeon.grid[y][x] === WALL) return false;
  if (livingEnemyAt(dungeon, x, y) && livingEnemyAt(dungeon, x, y) !== movingEnemy) return false;
  return true;
}

function nextEnemyStep(dungeon, enemy) {
  const startKey = `${enemy.x},${enemy.y}`;
  const queue = [{ x: enemy.x, y: enemy.y }];
  const previous = new Map([[startKey, null]]);
  let targetKey = null;

  for (let index = 0; index < queue.length && index < 90; index += 1) {
    const current = queue[index];
    if (current.x === dungeon.player.x && current.y === dungeon.player.y) {
      targetKey = `${current.x},${current.y}`;
      break;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: current.x + dx, y: current.y + dy };
      const key = `${next.x},${next.y}`;
      if (previous.has(key) || !passableForEnemy(dungeon, next.x, next.y, enemy)) continue;
      previous.set(key, `${current.x},${current.y}`);
      queue.push(next);
    }
  }

  if (!targetKey) return null;
  let stepKey = targetKey;
  while (previous.get(stepKey) !== startKey) {
    stepKey = previous.get(stepKey);
    if (!stepKey) return null;
  }
  const [x, y] = stepKey.split(",").map(Number);
  return { x, y };
}

function enemyTurn(dungeon) {
  let hurt = 0;
  let attacked = false;
  for (const enemy of dungeon.enemies) {
    if (!enemy.alive) continue;
    const distance = Math.abs(enemy.x - dungeon.player.x) + Math.abs(enemy.y - dungeon.player.y);
    if (distance === 1) {
      if (!attacked) {
        dungeon.player.hp -= enemy.atk;
        hurt += enemy.atk;
        attacked = true;
      }
      continue;
    }
    if (distance > 5) continue;
    const step = nextEnemyStep(dungeon, enemy);
    if (step && !(step.x === dungeon.player.x && step.y === dungeon.player.y)) {
      enemy.x = step.x;
      enemy.y = step.y;
    }
  }

  if (hurt) addLog(dungeon, "strike", `怪物圍攻，生命 -${hurt}`);
  if (dungeon.player.hp <= 0) {
    dungeon.player.hp = 0;
    dungeon.state = "dead";
    return { hurt, death: true };
  }
  return { hurt };
}

export function drinkPotion(dungeon) {
  if (dungeon.state !== "playing") return { used: false };
  if (dungeon.player.potions <= 0) {
    addLog(dungeon, "system", "紅藥水用完了。");
    return { used: false };
  }
  if (dungeon.player.hp >= dungeon.player.maxHp) {
    addLog(dungeon, "system", "生命已經全滿。");
    return { used: false };
  }

  dungeon.player.potions -= 1;
  dungeon.player.hp = Math.min(dungeon.player.maxHp, dungeon.player.hp + 6);
  dungeon.turns += 1;
  addLog(dungeon, "heal", "喝下紅藥水，恢復生命。");
  const result = enemyTurn(dungeon);
  recomputeVisibility(dungeon);
  return { used: true, death: result.death };
}

export function descendLevel(dungeon) {
  const next = generateDungeon(dungeon.seed, dungeon.level + 1, dungeon.maxFloor);
  next.player = {
    ...next.player,
    hp: Math.min(dungeon.player.maxHp, dungeon.player.hp + 2),
    maxHp: dungeon.player.maxHp,
    atk: dungeon.player.atk,
    gold: dungeon.player.gold,
    potions: dungeon.player.potions,
    kills: dungeon.player.kills,
    hasRelic: false,
  };
  next.turns = dungeon.turns;
  addLog(next, "level", `深入第 ${next.level} 層，喘口氣恢復 2 點生命。`);
  recomputeVisibility(next);
  return next;
}

export function enemyLabel(kind) {
  return {
    rat: "洞窟鼠",
    bat: "暗影蝠",
    slime: "苔泥怪",
    skeleton: "骷髏兵",
    ghost: "迷途幽靈",
    guard: "地城守衛",
    demon: "深淵魔像",
  }[kind] ?? kind;
}
