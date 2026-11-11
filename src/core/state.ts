import {
  AIRSHIP_REWARD_INTERVAL_MAX_SECONDS,
  AIRSHIP_REWARD_INTERVAL_MIN_SECONDS,
  AIRSHIP_VISIBLE_SECONDS,
  FIND_MAX_INTERVAL_SECONDS,
  FIND_MIN_INTERVAL_SECONDS,
  ORDER_REFRESH_SECONDS,
  RADIO_RECORDS,
  TALENT_CONFIG,
  TIER_CONFIG,
} from "./config.ts";
import { addScrap, getFindPower, getTotalIncome } from "./economy.ts";
import type { Finding, GameState } from "./types.ts";
import { refreshRequests, updateProgression } from "./progression.ts";

export function createGameState(nowMs = Date.now()): GameState {
  const state: GameState = {
    scrap: 0,
    lifetimeScrap: 0,
    runScrapEarned: 0,
    clockSeconds: 0,
    totalPlaySeconds: 0,
    tiers: TIER_CONFIG.map((tier) => ({ id: tier.id, owned: 0 })),
    totalPurchasedByTier: Array(TIER_CONFIG.length + 1).fill(0),
    blueprints: 0,
    blueprintsTotal: 0,
    tokens: 0,
    prestigeCount: 0,
    unlockedZones: ["ruins"],
    activeZoneId: "ruins",
    buyMode: 1,
    purchasedUpgradeIds: [],
    talentLevels: Object.fromEntries(TALENT_CONFIG.map((talent) => [talent.id, 0])),
    completedAchievementIds: [],
    requests: [],
    nextRequestId: 1,
    nextOrderRefreshAtSeconds: ORDER_REFRESH_SECONDS,
    ordersCompleted: 0,
    findsTapped: 0,
    airshipNextAtSeconds: randomAirshipDelay(Math.random),
    airshipExpiresAtSeconds: 0,
    incomeBoostUntilSeconds: 0,
    incomeBoostMultiplier: 1,
    dailyStreak: 0,
    dailyLastClaimDay: null,
    cosmeticOwnedIds: [],
    selectedCosmeticId: null,
    radioRecordIds: RADIO_RECORDS.filter((record) => record.zoneId === "ruins")
      .slice(0, 3)
      .map((record) => record.id),
    finds: [],
    nextFindingId: 1,
    nextFindAtSeconds: randomFindDelay(Math.random),
    findComboCount: 0,
    findComboExpiresAtSeconds: 0,
    findBoostUntilSeconds: 0,
    savedAtMs: nowMs,
  };
  refreshRequests(state, Math.random);
  return state;
}

export function tickGame(
  state: GameState,
  elapsedSeconds: number,
  random: () => number = Math.random,
): void {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError("Elapsed time must be a finite non-negative number.");
  }

  if (elapsedSeconds === 0) {
    return;
  }

  addScrap(state, getTotalIncome(state) * elapsedSeconds);
  state.clockSeconds += elapsedSeconds;
  state.totalPlaySeconds += elapsedSeconds;
  state.finds = state.finds.filter(
    (finding) => finding.expiresAtSeconds > state.clockSeconds,
  );

  while (state.clockSeconds >= state.nextFindAtSeconds) {
    if (state.finds.length < 3) {
      state.finds.push(createFinding(state, random));
    }
    state.nextFindAtSeconds += randomFindDelay(random, state);
  }

  if (state.findComboExpiresAtSeconds <= state.clockSeconds) {
    state.findComboCount = 0;
  }

  if (
    state.airshipExpiresAtSeconds > 0 &&
    state.airshipExpiresAtSeconds <= state.clockSeconds
  ) {
    state.airshipExpiresAtSeconds = 0;
  }
  if (
    state.airshipExpiresAtSeconds === 0 &&
    state.clockSeconds >= state.airshipNextAtSeconds
  ) {
    state.airshipExpiresAtSeconds = state.clockSeconds + AIRSHIP_VISIBLE_SECONDS;
    state.airshipNextAtSeconds =
      state.clockSeconds + randomAirshipDelay(random, state);
  }
  if (state.clockSeconds >= state.nextOrderRefreshAtSeconds) {
    state.requests = state.requests.filter((request) => request.progress >= request.target);
    refreshRequests(state, random);
    state.nextOrderRefreshAtSeconds = state.clockSeconds + ORDER_REFRESH_SECONDS;
  }
  updateProgression(state);
}

export function tapFinding(
  state: GameState,
  findingId: number,
  random: () => number = Math.random,
): number {
  const index = state.finds.findIndex((finding) => finding.id === findingId);
  if (index < 0) {
    return 0;
  }

  state.finds.splice(index, 1);
  if (state.clockSeconds >= state.findComboExpiresAtSeconds) {
    state.findComboCount = 0;
  }
  state.findComboCount += 1;
  state.findsTapped += 1;
  state.findComboExpiresAtSeconds = state.clockSeconds + 8;

  if (state.findComboCount >= 5) {
    state.findComboCount = 0;
    state.findBoostUntilSeconds = state.clockSeconds + 10;
  }

  const multiplier = state.findBoostUntilSeconds > state.clockSeconds ? 2 : 1;
  const reward = Math.max(1, getTotalIncome(state) * 10) * getFindPower(state) * multiplier;
  addScrap(state, reward);
  if (random() < Math.min(0.3, (state.talentLevels["luck-tokens"] ?? 0) * 0.02)) {
    state.tokens += 1;
  }
  updateProgression(state);
  return reward;
}

function createFinding(
  state: GameState,
  random: () => number,
): Finding {
  return {
    id: state.nextFindingId++,
    x: 0.12 + random() * 0.76,
    y: 0.3 + random() * 0.55,
    expiresAtSeconds: state.clockSeconds + 8,
  };
}

function randomFindDelay(
  random: () => number,
  state?: GameState,
): number {
  const findUpgradeCount = state?.purchasedUpgradeIds.filter((id) =>
    id.startsWith("find-"),
  ).length ?? 0;
  const factor = 1 + findUpgradeCount * 0.1;
  return (
    FIND_MIN_INTERVAL_SECONDS / factor +
    (random() * (FIND_MAX_INTERVAL_SECONDS - FIND_MIN_INTERVAL_SECONDS)) / factor
  );
}

function randomAirshipDelay(random: () => number, state?: GameState): number {
  const frequency = 1 + (state?.talentLevels["luck-airship"] ?? 0) * 0.1;
  return (
    AIRSHIP_REWARD_INTERVAL_MIN_SECONDS +
    random() *
      (AIRSHIP_REWARD_INTERVAL_MAX_SECONDS -
        AIRSHIP_REWARD_INTERVAL_MIN_SECONDS)
  ) / frequency;
}
