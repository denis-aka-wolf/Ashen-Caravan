import { describe, expect, it } from "vitest";
import { MILESTONE_COUNTS } from "./config.ts";
import {
  buyTier,
  getMilestoneMultiplier,
  getTierCost,
  getTotalIncome,
  isTierUnlocked,
} from "./economy.ts";
import { calculateOfflineScrap, applyOfflineEarnings } from "./offline.ts";
import { loadGame, saveGame } from "./save.ts";
import { createGameState, tickGame, tapFinding } from "./state.ts";
import { simulateEconomy } from "./simulation.ts";
import type { SaveStorage } from "./save.ts";

describe("economy", () => {
  it("uses the documented base costs and exponential growth", () => {
    expect(getTierCost(1, 0)).toBe(10);
    expect(getTierCost(1, 1)).toBeCloseTo(11);
    expect(getTierCost(3, 0)).toBe(1_562);
  });

  it("applies milestone doublings at 10, 25 and 50 owned units", () => {
    expect(MILESTONE_COUNTS).toEqual([10, 25, 50]);
    expect(getMilestoneMultiplier(9)).toBe(1);
    expect(getMilestoneMultiplier(10)).toBe(2);
    expect(getMilestoneMultiplier(25)).toBe(4);
    expect(getMilestoneMultiplier(50)).toBe(8);
  });

  it("unlocks tiers in order and buys only when affordable", () => {
    const state = createGameState(0);
    expect(isTierUnlocked(state, 1)).toBe(true);
    expect(isTierUnlocked(state, 2)).toBe(false);
    expect(buyTier(state, 1)).toBe(false);

    state.scrap = 10;
    expect(buyTier(state, 1)).toBe(true);
    expect(state.tiers[0].owned).toBe(1);
    expect(state.scrap).toBe(0);

    state.tiers[0].owned = 10;
    expect(isTierUnlocked(state, 2)).toBe(true);
  });

  it("accumulates passive income and spawns clickable findings", () => {
    const state = createGameState(0);
    state.tiers[0].owned = 1;
    state.nextFindAtSeconds = 0.1;

    tickGame(state, 0.1, () => 0.5);

    expect(state.scrap).toBeCloseTo(0.05);
    expect(state.finds).toHaveLength(1);
    expect(tapFinding(state, state.finds[0].id)).toBe(5);
    expect(state.scrap).toBeCloseTo(5.05);
    expect(state.finds).toHaveLength(0);
  });

  it("doubles find rewards after five consecutive taps", () => {
    const state = createGameState(0);
    const tap = () => {
      const id = state.nextFindingId++;
      state.finds.push({ id, x: 0.5, y: 0.5, expiresAtSeconds: 100 });
      return tapFinding(state, id);
    };

    for (let index = 0; index < 4; index += 1) {
      tap();
    }
    expect(tap()).toBe(2);
    expect(state.findBoostUntilSeconds).toBe(10);
    state.clockSeconds = 1;
    state.finds.push({
      id: state.nextFindingId++,
      x: 0.5,
      y: 0.5,
      expiresAtSeconds: 100,
    });
    expect(tapFinding(state, state.finds[0].id)).toBe(2);
  });
});

describe("offline progress and persistence", () => {
  it("applies the 50 percent offline rate with a four-hour cap", () => {
    expect(calculateOfflineScrap(2, 3600)).toBe(3600);
    expect(calculateOfflineScrap(2, 24 * 3600)).toBe(14_400);
  });

  it("does not grant offline earnings for less than a minute", () => {
    const state = createGameState(0);
    state.tiers[0].owned = 1;
    expect(applyOfflineEarnings(state, 59_000).creditedScrap).toBe(0);
    const minuteAway = createGameState(0);
    minuteAway.tiers[0].owned = 1;
    expect(applyOfflineEarnings(minuteAway, 60_000).creditedScrap).toBe(15);
  });

  it("round-trips the game state through a storage adapter", () => {
    const values = new Map<string, string>();
    const storage: SaveStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    const state = createGameState(123);
    state.scrap = 42;
    saveGame(storage, state, 456);

    const loaded = loadGame(storage, 789);
    expect(loaded.scrap).toBe(42);
    expect(loaded.savedAtMs).toBe(456);
  });

  it("rejects saves with an unsupported version instead of silently resetting", () => {
    const values = new Map<string, string>();
    const storage: SaveStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    values.set(
      "ashen-caravan-prototype-v1",
      JSON.stringify({ version: 99, state: createGameState(0) }),
    );

    expect(() => loadGame(storage, 100)).toThrow(/unsupported or invalid format/i);
  });

  it("returns measurable milestones from the economy simulation", () => {
    const result = simulateEconomy(createGameState(0), {
      durationSeconds: 60,
      stepSeconds: 0.25,
      findTapIntervalSeconds: 10,
    });
    expect(result.elapsedSeconds).toBe(60);
    expect(Number.isFinite(getTotalIncome(result.state))).toBe(true);
    expect(result.state.lifetimeScrap).toBeGreaterThan(0);
  });
});
