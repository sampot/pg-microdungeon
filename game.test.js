import { describe, it, expect } from "vitest";
import {
  rng,
  generateDungeon,
  tryPlayerMove,
  combatAction,
  descendLevel,
  recomputeVisibility,
  TILE,
  FLOOR,
  WALL,
  STAIRS,
  EXIT,
  CHEST,
  POTION,
} from "./game.js";

describe("rng", () => {
  it("is deterministic", () => {
    const a = rng(42);
    const b = rng(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });
  it("varies across seeds", () => {
    const a = rng(1);
    const b = rng(2);
    let same = 0;
    for (let i = 0; i < 100; i++) if (a() === b()) same++;
    expect(same).toBeLessThan(10);
  });
});

describe("generateDungeon", () => {
  it("creates a valid grid with rooms and walls", () => {
    const d = generateDungeon(123, 1, 5);
    expect(d.w).toBe(32);
    expect(d.h).toBe(18);
    expect(d.grid.length).toBe(d.h);
    expect(d.grid[0].length).toBe(d.w);
    expect(d.enemies.length).toBeGreaterThan(0);
    expect(d.grid[d.player.y][d.player.x]).toBe(FLOOR);
  });
  it("places stairs on a non-final level", () => {
    const d = generateDungeon(7, 1, 5);
    let stairsCount = 0;
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (d.grid[y][x] === STAIRS) stairsCount++;
    expect(stairsCount).toBeGreaterThanOrEqual(1);
  });
  it("places EXIT on final level", () => {
    const d = generateDungeon(7, 5, 5);
    let exitCount = 0;
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (d.grid[y][x] === EXIT) exitCount++;
    expect(exitCount).toBe(1);
  });
  it("deterministic for same seed", () => {
    const a = generateDungeon(99, 2, 5);
    const b = generateDungeon(99, 2, 5);
    expect(a.player.x).toBe(b.player.x);
    expect(a.player.y).toBe(b.player.y);
    expect(a.enemies.length).toBe(b.enemies.length);
  });
});

describe("tryPlayerMove", () => {
  it("blocks into walls", () => {
    // Construct a small controlled grid: player at (5,5), wall at (6,5)
    const d = generateDungeon(5, 1, 5);
    d.grid[d.player.y][d.player.x] = FLOOR;
    d.grid[d.player.y][d.player.x + 1] = WALL;
    d.enemies = [];
    d.chest.opened = true;
    d.grid[d.chest.y][d.chest.x] = FLOOR;
    const before = { x: d.player.x, y: d.player.y };
    const r = tryPlayerMove(d, 1, 0);
    expect(r.blocked).toBe(true);
    expect(d.player.x).toBe(before.x);
    expect(d.player.y).toBe(before.y);
  });
  it("moves into floor", () => {
    const d = generateDungeon(11, 1, 5);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const nx = d.player.x + dx;
      const ny = d.player.y + dy;
      if (nx < 0 || ny < 0 || nx >= d.w || ny >= d.h) continue;
      if (d.grid[ny][nx] === FLOOR) {
        const r = tryPlayerMove(d, dx, dy);
        expect(r.moved).toBe(true);
        return;
      }
    }
  });
});

describe("combatAction", () => {
  it("attack reduces enemy hp", () => {
    const d = generateDungeon(3, 1, 5);
    // force a combat by placing player next to an enemy
    const e = d.enemies[0];
    d.player.x = e.x - 1;
    d.player.y = e.y;
    d.state = "combat";
    const beforeHp = e.hp;
    const r = combatAction(d, "attack");
    expect(e.hp).toBeLessThan(beforeHp);
    // returns a log
    expect(r.log.length).toBeGreaterThan(0);
  });
  it("returns death when player hp hits 0", () => {
    const d = generateDungeon(4, 1, 5);
    const e = d.enemies[0];
    d.player.x = e.x - 1;
    d.player.y = e.y;
    d.player.hp = 1; // one hit kills
    d.player.atk = 0; // disable player attack so enemy always gets to strike
    d.state = "combat";
    let died = false;
    for (let i = 0; i < 20; i++) {
      const r = combatAction(d, "attack");
      if (r.death) { died = true; break; }
      if (r.done) break;
    }
    expect(died).toBe(true);
  });
});

describe("descendLevel", () => {
  it("carries over player stats", () => {
    const d = generateDungeon(13, 1, 5);
    d.player.gold = 42;
    d.player.potions = 2;
    d.player.atk = 5;
    const next = descendLevel(d);
    expect(next.player.gold).toBe(42);
    expect(next.player.potions).toBe(2);
    expect(next.player.atk).toBe(5);
    expect(next.level).toBe(2);
  });
});

describe("visibility", () => {
  it("tiles within radius are visible", () => {
    const d = generateDungeon(8, 1, 5);
    recomputeVisibility(d);
    const idx = d.player.y * d.w + d.player.x;
    expect(d.visible[idx]).toBe(1);
    expect(d.explored[idx]).toBe(1);
  });
});