import { describe, expect, it } from "vitest";
import {
  MILESTONE_COUNTS,
  TIER_CONFIG,
  UPGRADE_CONFIG,
} from "./config.ts";
import {
  buyTierBulk,
  buyUpgrade,
  buyTier,
  getOfflineSettings,
  getMilestoneMultiplier,
  getTierCost,
  getTotalIncome,
  isTierUnlocked,
} from "./economy.ts";
import { calculateOfflineScrap, applyOfflineEarnings } from "./offline.ts";
import { loadGame, saveGame } from "./save.ts";
import { createGameState, tickGame, tapFinding } from "./state.ts";
import { simulateEconomy } from "./simulation.ts";
import {
  applyRemoteGameConfig,
  getRuntimeGameConfig,
  resetRuntimeGameConfig,
} from "./runtime-config.ts";
import type { SaveStorage } from "./save.ts";
import {
  buyCosmetic,
  buyTalent,
  claimAirshipReward,
  claimDailyReward,
  claimRequest,
  getPrestigeBlueprintGain,
  setActiveZone,
  skipRequestWithReward,
  startNewRun,
  getZoneTransitionProgress,
  transitionToNextZone,
  updateProgression,
} from "./progression.ts";

describe("economy", () => {
  it("uses the documented base costs and exponential growth", () => {
    expect(getTierCost(1, 0)).toBe(10);
    expect(getTierCost(1, 1)).toBeCloseTo(11);
    expect(getTierCost(3, 0)).toBe(1_562);
  });

  it("applies milestone doublings at 10, 25 and 50 owned units", () => {
    expect(MILESTONE_COUNTS).toEqual([10, 25, 50, 100, 200, 300, 400, 500]);
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

  it("supports all eight tiers and bulk purchases", () => {
    const state = createGameState(0);
    expect(TIER_CONFIG).toHaveLength(8);
    state.scrap = getTierCost(1, 0) + getTierCost(1, 1) + getTierCost(1, 2);
    expect(buyTierBulk(state, 1, 3)).toBe(3);
    expect(state.tiers[0].owned).toBe(3);
    expect(state.totalPurchasedByTier[1]).toBe(3);
    expect(state.scrap).toBeCloseTo(0);
  });

  it("requires the route region before unlocking its generators", () => {
    const state = createGameState(0);
    state.unlockedZones.push("plains");
    expect(isTierUnlocked(state, 3)).toBe(false);
    expect(setActiveZone(state, "plains").success).toBe(true);
    state.tiers[1].owned = 10;
    expect(isTierUnlocked(state, 3)).toBe(true);
  });

  it("uses income progress and requires an explicit action to enter the next zone", () => {
    const state = createGameState(0);
    state.tiers[0].owned = 5_000;
    updateProgression(state);

    expect(state.unlockedZones).toEqual(["ruins"]);
    expect(getZoneTransitionProgress(state).canTransition).toBe(true);
    expect(transitionToNextZone(state).success).toBe(true);
    expect(state.unlockedZones).toEqual(["ruins", "plains"]);
    expect(state.activeZoneId).toBe("plains");
  });

  it("applies permanent upgrade multipliers and charges once", () => {
    const state = createGameState(0);
    state.tiers[0].owned = 10;
    state.scrap = 10_000;
    const incomeBefore = getTotalIncome(state);
    const upgrade = UPGRADE_CONFIG.find((entry) => entry.id === "tier-1-1");
    expect(upgrade).toBeDefined();
    expect(buyUpgrade(state, "tier-1-1")).toBe(true);
    expect(getTotalIncome(state)).toBe(incomeBefore * 2);
    expect(buyUpgrade(state, "tier-1-1")).toBe(false);
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

    expect(() => loadGame(storage, 100)).toThrow(/unsupported save version/i);
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

  it("starts a prestige run and preserves permanent progression", () => {
    const state = createGameState(0);
    state.scrap = 1_000;
    state.runScrapEarned = 250_000_000;
    state.tiers[0].owned = 40;
    state.tokens = 9;
    state.completedAchievementIds.push("scrap-1");
    expect(getPrestigeBlueprintGain(state)).toBe(5);

    const result = startNewRun(state, 123_000);
    expect(result.success).toBe(true);
    expect(state.scrap).toBe(0);
    expect(state.runScrapEarned).toBe(0);
    expect(state.tiers[0].owned).toBe(0);
    expect(state.blueprints).toBe(5);
    expect(state.blueprintsTotal).toBe(5);
    expect(state.tokens).toBe(12);
    expect(state.completedAchievementIds).toContain("scrap-1");
    expect(state.prestigeCount).toBe(1);
  });

  it("spends blueprints on capped talents and applies their income effect", () => {
    const state = createGameState(0);
    state.blueprints = 3;
    state.tiers[0].owned = 1;
    const before = getTotalIncome(state);
    expect(buyTalent(state, "salvage-income").success).toBe(true);
    expect(state.talentLevels["salvage-income"]).toBe(1);
    expect(getTotalIncome(state)).toBeCloseTo(before * 1.1);
    expect(state.blueprints).toBe(0);
  });

  it("completes requests and grants tokens and scrap", () => {
    const state = createGameState(0);
    state.requests = [{
      id: 99,
      kind: "find",
      target: 2,
      startProgress: 0,
      progress: 0,
      rewardTokens: 2,
      rewardScrap: 15,
    }];
    state.findsTapped = 2;
    const result = claimRequest(state, 99);
    expect(result.success).toBe(true);
    expect(state.ordersCompleted).toBe(1);
    expect(state.tokens).toBe(7);
    expect(state.scrap).toBe(15);
    expect(state.requests).toHaveLength(3);
  });

  it("replaces a request and grants its token reward after an ad", () => {
    const state = createGameState(0);
    state.requests = [{
      id: 99,
      kind: "find",
      target: 5,
      startProgress: 0,
      progress: 0,
      rewardTokens: 3,
      rewardScrap: 15,
    }];
    expect(skipRequestWithReward(state, 99).success).toBe(true);
    expect(state.tokens).toBe(3);
    expect(state.requests).toHaveLength(1);
    expect(state.requests.some((request) => request.id === 99)).toBe(false);
  });

  it("claims daily rewards once per UTC day and drops one step after a missed day", () => {
    const state = createGameState(0);
    const first = claimDailyReward(state, new Date("2026-01-01T12:00:00Z"));
    expect(first.success).toBe(true);
    expect(claimDailyReward(state, new Date("2026-01-01T20:00:00Z")).success).toBe(false);
    claimDailyReward(state, new Date("2026-01-02T12:00:00Z"));
    expect(state.dailyStreak).toBe(1);
    claimDailyReward(state, new Date("2026-01-04T12:00:00Z"));
    expect(state.dailyStreak).toBe(0);
  });

  it("doubles the daily reward only when the rewarded-ad path is requested", () => {
    const state = createGameState(0);
    state.tiers[0].owned = 1;
    expect(
      claimDailyReward(state, new Date("2026-01-01T12:00:00Z"), 2).success,
    ).toBe(true);
    expect(state.scrap).toBe(120);
    expect(state.dailyLastClaimDay).toBe("2026-01-01");
  });

  it("grants one of the configured airship rewards while it is visible", () => {
    const state = createGameState(0);
    state.airshipExpiresAtSeconds = 6;
    expect(claimAirshipReward(state, () => 0.99).success).toBe(true);
    expect(state.tokens).toBe(3);
    expect(claimAirshipReward(state, () => 0.5).success).toBe(false);
  });

  it("buys and equips cosmetics with tokens", () => {
    const state = createGameState(0);
    state.tokens = 5;
    expect(buyCosmetic(state, "beacon-rust").success).toBe(true);
    expect(state.tokens).toBe(0);
    expect(state.selectedCosmeticId).toBe("beacon-rust");
    expect(buyCosmetic(state, "beacon-rust").success).toBe(true);
    expect(state.tokens).toBe(0);
  });

  it("migrates the previous three-tier save without losing scrap", () => {
    const values = new Map<string, string>();
    const storage: SaveStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    values.set("ashen-caravan-prototype-v1", JSON.stringify({
      version: 1,
      state: {
        scrap: 321,
        lifetimeScrap: 654,
        clockSeconds: 12,
        tiers: [{ id: 1, owned: 4 }, { id: 2, owned: 2 }, { id: 3, owned: 1 }],
        savedAtMs: 456,
        nextFindingId: 1,
        nextFindAtSeconds: 4,
        findComboCount: 0,
        findComboExpiresAtSeconds: 0,
        findBoostUntilSeconds: 0,
        finds: [],
        stats: { taps: 7 },
      },
    }));

    const migrated = loadGame(storage, 999);
    expect(migrated.scrap).toBe(321);
    expect(migrated.tiers).toHaveLength(8);
    expect(migrated.tiers[0].owned).toBe(4);
    expect(migrated.tiers[7].owned).toBe(0);
    expect(migrated.findsTapped).toBe(7);
  });
});

describe("remote game configuration", () => {
  it("applies validated flags to economy and progression values", () => {
    resetRuntimeGameConfig();
    const result = applyRemoteGameConfig({
      config_schema_version: "2",
      tier_cost_multiplier: "1.5",
      tier_income_multiplier: "1.1",
      offline_cap_hours: "8",
      offline_efficiency: "0.7",
      plains_unlock_income: "100000",
      flooded_unlock_income: "10000000",
      mountain_unlock_income: "100000000000",
    });

    expect(result.rejectedFlags).toEqual([]);
    expect(getRuntimeGameConfig().tierCostMultiplier).toBe(1.5);
    expect(getRuntimeGameConfig().offlineCapHours).toBe(8);
    expect(getRuntimeGameConfig().offlineEfficiency).toBe(0.7);
    expect(getRuntimeGameConfig().plainsUnlockIncome).toBe(100_000);
    expect(getTierCost(1, 0)).toBe(15);
    const state = createGameState(0);
    state.tiers[0].owned = 1;
    expect(getTotalIncome(state)).toBeCloseTo(0.55);
    expect(getOfflineSettings(state)).toEqual({
      capSeconds: 8 * 60 * 60,
      efficiency: 0.7,
    });
    state.tiers[0].owned = 5_000;
    updateProgression(state);
    expect(state.unlockedZones).not.toContain("plains");
    expect(transitionToNextZone(state).success).toBe(true);
    expect(state.unlockedZones).toContain("plains");
    resetRuntimeGameConfig();
  });

  it("rejects out-of-range values and falls back to safe defaults", () => {
    resetRuntimeGameConfig();
    const result = applyRemoteGameConfig({
      offline_cap_hours: "1000",
      offline_efficiency: "NaN",
      tier_income_multiplier: "0",
    });

    expect(result.rejectedFlags).toEqual([
      "tier_income_multiplier",
      "offline_cap_hours",
      "offline_efficiency",
    ]);
    expect(getRuntimeGameConfig().offlineCapHours).toBe(4);
    expect(getRuntimeGameConfig().offlineEfficiency).toBe(0.5);
    expect(getRuntimeGameConfig().tierIncomeMultiplier).toBe(1);
    resetRuntimeGameConfig();
  });

  it("rejects fractional values for integer progression settings", () => {
    resetRuntimeGameConfig();
    const result = applyRemoteGameConfig({
      plains_unlock_income: "1000.5",
      order_refresh_seconds: "75.5",
    });

    expect(result.rejectedFlags).toEqual([
      "plains_unlock_income",
      "order_refresh_seconds",
    ]);
    expect(getRuntimeGameConfig().plainsUnlockIncome).toBe(10_000);
    expect(getRuntimeGameConfig().orderRefreshSeconds).toBe(600);
    resetRuntimeGameConfig();
  });

  it("rejects incompatible schema versions without replacing the active config", () => {
    resetRuntimeGameConfig();
    applyRemoteGameConfig({ offline_cap_hours: "8" });
    const result = applyRemoteGameConfig({
      config_schema_version: "3",
      offline_cap_hours: "10",
    });

    expect(result.rejectedFlags).toEqual(["config_schema_version"]);
    expect(getRuntimeGameConfig().offlineCapHours).toBe(8);
    resetRuntimeGameConfig();
  });

  it("rejects route thresholds that are not in increasing order", () => {
    resetRuntimeGameConfig();
    const result = applyRemoteGameConfig({
      config_schema_version: "2",
      plains_unlock_income: "10000000",
      flooded_unlock_income: "1000000",
      mountain_unlock_income: "100000000000",
    });

    expect(result.rejectedFlags).toEqual([
      "plains_unlock_income",
      "flooded_unlock_income",
    ]);
    expect(getRuntimeGameConfig().plainsUnlockIncome).toBe(10_000);
    expect(getRuntimeGameConfig().floodedUnlockIncome).toBe(10_000_000);
    resetRuntimeGameConfig();
  });
});
