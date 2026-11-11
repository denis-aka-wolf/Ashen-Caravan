import { SAVE_KEY, SAVE_VERSION, TIER_CONFIG } from "./config.ts";
import { createGameState } from "./state.ts";
import { updateProgression } from "./progression.ts";
import type { GameState } from "./types.ts";

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface SaveEnvelope {
  version: number;
  state: GameState;
}

export function loadGame(storage: SaveStorage, nowMs = Date.now()): GameState {
  const serialized = storage.getItem(SAVE_KEY);
  if (serialized === null) {
    return createGameState(nowMs);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new Error("The saved game is not valid JSON.", { cause: error });
  }

  if (isSaveEnvelope(parsed) && parsed.version === SAVE_VERSION) {
    if (!isGameState(parsed.state)) {
      throw new Error("The saved game has an unsupported or invalid format.");
    }
    return parsed.state;
  }
  if (isLegacyEnvelope(parsed)) {
    return migrateLegacyState(parsed.state, nowMs);
  }
  if (isLegacyGameState(parsed)) {
    return migrateLegacyState(parsed, nowMs);
  }
  if (!isSaveEnvelope(parsed)) {
    throw new Error("The saved game has an unsupported or invalid format.");
  }
  throw new Error(`Unsupported save version: ${parsed.version}.`);
}

export function saveGame(
  storage: SaveStorage,
  state: GameState,
  nowMs = Date.now(),
): void {
  state.savedAtMs = nowMs;
  const envelope: SaveEnvelope = { version: SAVE_VERSION, state };
  storage.setItem(SAVE_KEY, JSON.stringify(envelope));
}

export function resetGame(storage: SaveStorage, nowMs = Date.now()): GameState {
  storage.removeItem(SAVE_KEY);
  return createGameState(nowMs);
}

function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const state = value as Partial<GameState>;
  return (
    Number.isFinite(state.scrap) &&
    Number.isFinite(state.lifetimeScrap) &&
    Number.isFinite(state.runScrapEarned) &&
    Number.isFinite(state.clockSeconds) &&
    Number.isFinite(state.totalPlaySeconds) &&
    Number.isFinite(state.savedAtMs) &&
    Number.isInteger(state.nextFindingId) &&
    Array.isArray(state.tiers) &&
    state.tiers.length === TIER_CONFIG.length &&
    state.tiers.every(
      (tier, index) =>
        tier.id === index + 1 &&
        Number.isInteger(tier.owned) &&
        tier.owned >= 0,
    ) &&
    Array.isArray(state.finds) &&
    state.finds.every(
      (finding) =>
        Number.isInteger(finding.id) &&
        Number.isFinite(finding.x) &&
        Number.isFinite(finding.y) &&
        Number.isFinite(finding.expiresAtSeconds),
    ) &&
    Number.isInteger(state.findComboCount) &&
    Array.isArray(state.totalPurchasedByTier) &&
    state.totalPurchasedByTier.length === TIER_CONFIG.length + 1 &&
    Number.isFinite(state.blueprints) &&
    Number.isFinite(state.blueprintsTotal) &&
    Number.isFinite(state.tokens) &&
    Number.isFinite(state.prestigeCount) &&
    Array.isArray(state.unlockedZones) &&
    typeof state.activeZoneId === "string" &&
    Array.isArray(state.purchasedUpgradeIds) &&
    isStringArray(state.purchasedUpgradeIds) &&
    isRecordOfNumbers(state.talentLevels) &&
    Array.isArray(state.completedAchievementIds) &&
    isStringArray(state.completedAchievementIds) &&
    Array.isArray(state.requests) &&
    state.requests.length <= 3 &&
    state.requests.every(
      (request) =>
        Number.isInteger(request.id) &&
        ["scrap", "tier", "find"].includes(request.kind) &&
        Number.isFinite(request.target) &&
        Number.isFinite(request.startProgress) &&
        Number.isFinite(request.progress) &&
        Number.isFinite(request.rewardTokens) &&
        Number.isFinite(request.rewardScrap) &&
        (request.tierId === undefined || Number.isInteger(request.tierId)),
    ) &&
    Number.isFinite(state.nextOrderRefreshAtSeconds) &&
    Number.isInteger(state.ordersCompleted) &&
    Number.isInteger(state.findsTapped) &&
    Number.isFinite(state.airshipNextAtSeconds) &&
    Number.isFinite(state.airshipExpiresAtSeconds) &&
    Number.isFinite(state.incomeBoostUntilSeconds) &&
    Number.isFinite(state.incomeBoostMultiplier) &&
    Number.isInteger(state.dailyStreak) &&
    (state.dailyLastClaimDay === null || typeof state.dailyLastClaimDay === "string") &&
    Array.isArray(state.cosmeticOwnedIds) &&
    isStringArray(state.cosmeticOwnedIds) &&
    (state.selectedCosmeticId === null || typeof state.selectedCosmeticId === "string") &&
    Array.isArray(state.radioRecordIds) &&
    isStringArray(state.radioRecordIds) &&
    Number.isFinite(state.nextFindAtSeconds) &&
    Number.isFinite(state.findComboExpiresAtSeconds) &&
    Number.isFinite(state.findBoostUntilSeconds)
  );
}

function isSaveEnvelope(value: unknown): value is SaveEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }
  const envelope = value as Partial<SaveEnvelope>;
  return Number.isInteger(envelope.version) && envelope.state !== undefined;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isRecordOfNumbers(value: unknown): value is Record<string, number> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (entry) => Number.isInteger(entry) && Number(entry) >= 0,
    )
  );
}

function isLegacyEnvelope(
  value: unknown,
): value is { version: 1; state: LegacyGameState } {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { version?: unknown }).version === 1 &&
    isLegacyGameState((value as { state?: unknown }).state)
  );
}

interface LegacyGameState {
  scrap: number;
  lifetimeScrap: number;
  clockSeconds: number;
  tiers: Array<{ id: number; owned: number }>;
  savedAtMs: number;
  [key: string]: unknown;
}

function isLegacyGameState(value: unknown): value is LegacyGameState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const state = value as Partial<LegacyGameState>;
  return (
    Number.isFinite(state.scrap) &&
    Number.isFinite(state.lifetimeScrap) &&
    Number.isFinite(state.clockSeconds) &&
    Number.isFinite(state.savedAtMs) &&
    Array.isArray(state.tiers) &&
    state.tiers.length === 3 &&
    state.tiers.every(
      (tier, index) =>
        tier.id === index + 1 &&
        Number.isInteger(tier.owned) &&
        tier.owned >= 0,
    )
  );
}

function migrateLegacyState(
  legacy: LegacyGameState,
  nowMs: number,
): GameState {
  const migrated = createGameState(legacy.savedAtMs);
  migrated.scrap = legacy.scrap;
  migrated.lifetimeScrap = legacy.lifetimeScrap;
  migrated.runScrapEarned = legacy.lifetimeScrap;
  migrated.clockSeconds = legacy.clockSeconds;
  migrated.tiers = TIER_CONFIG.map((tier) => ({
    id: tier.id,
    owned: legacy.tiers.find((entry) => entry.id === tier.id)?.owned ?? 0,
  }));
  migrated.totalPurchasedByTier = [
    0,
    ...migrated.tiers.map((tier) => tier.owned),
  ];
  migrated.savedAtMs = legacy.savedAtMs >= 0 ? legacy.savedAtMs : nowMs;
  if (Array.isArray(legacy.finds)) {
    migrated.finds = legacy.finds as GameState["finds"];
  }
  if (Number.isFinite(legacy.nextFindingId)) {
    migrated.nextFindingId = legacy.nextFindingId as number;
  }
  if (Number.isFinite(legacy.nextFindAtSeconds)) {
    migrated.nextFindAtSeconds = legacy.nextFindAtSeconds as number;
  }
  if (Number.isInteger(legacy.findComboCount)) {
    migrated.findComboCount = legacy.findComboCount as number;
  }
  if (Number.isFinite(legacy.findComboExpiresAtSeconds)) {
    migrated.findComboExpiresAtSeconds = legacy.findComboExpiresAtSeconds as number;
  }
  if (Number.isFinite(legacy.findBoostUntilSeconds)) {
    migrated.findBoostUntilSeconds = legacy.findBoostUntilSeconds as number;
  }
  if (legacy.stats && typeof legacy.stats === "object") {
    const stats = legacy.stats as { taps?: unknown };
    if (Number.isInteger(stats.taps)) {
      migrated.findsTapped = stats.taps as number;
    }
  }
  updateProgression(migrated);
  return migrated;
}
