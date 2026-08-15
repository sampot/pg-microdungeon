import { describe, expect, it } from "vitest";
import {
  CHEST,
  EXIT,
  FLOOR,
  RELIC,
  STAIRS,
  WALL,
  descendLevel,
  drinkPotion,
  generateDungeon,
  recomputeVisibility,
  rng,
  tryPlayerMove,
} from "./game.js";

const directions = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function countTiles(dungeon, kind) {
  return dungeon.grid.flat().filter((tile) => tile === kind).length;
}

function reachableTiles(dungeon) {
  const seen = new Set([`${dungeon.player.x},${dungeon.player.y}`]);
  const queue = [{ x: dungeon.player.x, y: dungeon.player.y }];
  while (queue.length) {
    const current = queue.shift();
    for (const [dx, dy] of directions) {
      const x = current.x + dx;
      const y = current.y + dy;
      if (x < 0 || y < 0 || x >= dungeon.w || y >= dungeon.h) continue;
      if (dungeon.grid[y][x] === WALL) continue;
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ x, y });
    }
  }
  return seen;
}

function shortestDistance(dungeon, start, goal) {
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [{ ...start, distance: 0 }];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.x === goal.x && current.y === goal.y) return current.distance;
    for (const [dx, dy] of directions) {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = `${x},${y}`;
      if (x < 0 || y < 0 || x >= dungeon.w || y >= dungeon.h) continue;
      if (dungeon.grid[y][x] === WALL || seen.has(key)) continue;
      seen.add(key);
      queue.push({ x, y, distance: current.distance + 1 });
    }
  }
  return Infinity;
}

describe("rng", () => {
  it("is deterministic", () => {
    const a = rng(42);
    const b = rng(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });
});

describe("generateDungeon", () => {
  it("builds a compact three-floor maze with one relic and one goal", () => {
    const first = generateDungeon(123, 1);
    const final = generateDungeon(123, 3);

    expect(first.w).toBe(21);
    expect(first.h).toBe(15);
    expect(first.maxFloor).toBe(3);
    expect(first.player.hp).toBe(14);
    expect(first.player.potions).toBe(2);
    expect(countTiles(first, RELIC)).toBe(1);
    expect(countTiles(first, STAIRS)).toBe(1);
    expect(countTiles(first, EXIT)).toBe(0);
    expect(countTiles(final, RELIC)).toBe(1);
    expect(countTiles(final, EXIT)).toBe(1);
    expect(countTiles(final, STAIRS)).toBe(0);
  });

  it("keeps the relic, goal, chests, and enemies reachable", () => {
    for (const seed of [1, 7, 42, 999]) {
      const dungeon = generateDungeon(seed, 2);
      const reachable = reachableTiles(dungeon);
      for (let y = 0; y < dungeon.h; y++) {
        for (let x = 0; x < dungeon.w; x++) {
          if ([RELIC, STAIRS, CHEST].includes(dungeon.grid[y][x])) {
            expect(reachable.has(`${x},${y}`)).toBe(true);
          }
        }
      }
      for (const enemy of dungeon.enemies) {
        expect(reachable.has(`${enemy.x},${enemy.y}`)).toBe(true);
      }
    }
  });

  it("places the relic along the shortest route to the goal", () => {
    for (const seed of [2, 19, 77, 404]) {
      const dungeon = generateDungeon(seed, 1);
      const start = dungeon.player;
      const viaRelic =
        shortestDistance(dungeon, start, dungeon.relic) +
        shortestDistance(dungeon, dungeon.relic, dungeon.goal);
      expect(viaRelic).toBe(shortestDistance(dungeon, start, dungeon.goal));
    }
  });

  it("is fully deterministic for the same seed and floor", () => {
    const a = generateDungeon(99, 2);
    const b = generateDungeon(99, 2);
    expect(a.grid).toEqual(b.grid);
    expect(a.player).toEqual(b.player);
    expect(a.enemies).toEqual(b.enemies);
  });
});

describe("tryPlayerMove", () => {
  it("blocks walls without spending a turn", () => {
    const dungeon = generateDungeon(5, 1);
    dungeon.enemies = [];
    dungeon.grid[dungeon.player.y][dungeon.player.x + 1] = WALL;

    const result = tryPlayerMove(dungeon, 1, 0);

    expect(result.blocked).toBe(true);
    expect(dungeon.turns).toBe(0);
  });

  it("uses bump combat and steps onto a defeated enemy", () => {
    const dungeon = generateDungeon(8, 1);
    const x = dungeon.player.x + 1;
    const y = dungeon.player.y;
    dungeon.grid[y][x] = FLOOR;
    dungeon.enemies = [{ kind: "slime", x, y, hp: 1, maxHp: 1, atk: 1, alive: true }];

    const result = tryPlayerMove(dungeon, 1, 0);

    expect(result.killed).toBe(true);
    expect(dungeon.player.x).toBe(x);
    expect(dungeon.player.kills).toBe(1);
  });

  it("lets a surviving enemy retaliate immediately", () => {
    const dungeon = generateDungeon(8, 1);
    const x = dungeon.player.x + 1;
    const y = dungeon.player.y;
    dungeon.grid[y][x] = FLOOR;
    dungeon.enemies = [{ kind: "guard", x, y, hp: 99, maxHp: 99, atk: 2, alive: true }];
    const hp = dungeon.player.hp;

    const result = tryPlayerMove(dungeon, 1, 0);

    expect(result.hit).toBe(true);
    expect(dungeon.player.hp).toBe(hp - 2);
    expect(dungeon.player.x).not.toBe(x);
  });

  it("reports death when another nearby enemy strikes after a kill", () => {
    const dungeon = generateDungeon(8, 1);
    const x = dungeon.player.x + 1;
    const y = dungeon.player.y;
    dungeon.grid[y][x] = FLOOR;
    dungeon.grid[y + 1][x] = FLOOR;
    dungeon.player.hp = 1;
    dungeon.enemies = [
      { kind: "slime", x, y, hp: 1, maxHp: 1, atk: 1, alive: true },
      { kind: "guard", x, y: y + 1, hp: 4, maxHp: 4, atk: 2, alive: true },
    ];

    const result = tryPlayerMove(dungeon, 1, 0);

    expect(result.killed).toBe(true);
    expect(result.death).toBe(true);
    expect(dungeon.state).toBe("dead");
  });

  it("collects the relic and only then unlocks the stairs", () => {
    const dungeon = generateDungeon(15, 1);
    dungeon.enemies = [];
    const x = dungeon.player.x + 1;
    const y = dungeon.player.y;

    dungeon.grid[y][x] = STAIRS;
    expect(tryPlayerMove(dungeon, 1, 0).locked).toBe(true);

    dungeon.grid[y][x] = RELIC;
    const result = tryPlayerMove(dungeon, 1, 0);
    expect(result.relic).toBe(true);
    expect(dungeon.player.hasRelic).toBe(true);

    dungeon.grid[y][x + 1] = STAIRS;
    expect(tryPlayerMove(dungeon, 1, 0).descend).toBe(true);
  });

  it("wins at the final exit after collecting the relic", () => {
    const dungeon = generateDungeon(21, 3);
    dungeon.enemies = [];
    const x = dungeon.player.x + 1;
    const y = dungeon.player.y;
    dungeon.grid[y][x] = EXIT;
    dungeon.player.hasRelic = true;

    const result = tryPlayerMove(dungeon, 1, 0);

    expect(result.won).toBe(true);
    expect(dungeon.state).toBe("won");
  });
});

describe("items and progression", () => {
  it("drinks a potion without exceeding max HP", () => {
    const dungeon = generateDungeon(3, 1);
    dungeon.player.hp = dungeon.player.maxHp - 2;
    dungeon.player.potions = 1;

    const result = drinkPotion(dungeon);

    expect(result.used).toBe(true);
    expect(dungeon.player.hp).toBe(dungeon.player.maxHp);
    expect(dungeon.player.potions).toBe(0);
  });

  it("carries the run stats forward but consumes the relic", () => {
    const dungeon = generateDungeon(13, 1);
    dungeon.player.gold = 42;
    dungeon.player.potions = 2;
    dungeon.player.atk = 5;
    dungeon.player.kills = 4;
    dungeon.player.hasRelic = true;

    const next = descendLevel(dungeon);

    expect(next.level).toBe(2);
    expect(next.player.gold).toBe(42);
    expect(next.player.potions).toBe(2);
    expect(next.player.atk).toBe(5);
    expect(next.player.kills).toBe(4);
    expect(next.player.hasRelic).toBe(false);
  });
});

describe("visibility", () => {
  it("reveals the player area and remembers explored tiles", () => {
    const dungeon = generateDungeon(8, 1);
    recomputeVisibility(dungeon);
    const index = dungeon.player.y * dungeon.w + dungeon.player.x;
    expect(dungeon.visible[index]).toBe(1);
    expect(dungeon.explored[index]).toBe(1);
  });
});