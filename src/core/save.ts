import { SAVE_KEY, SAVE_VERSION } from "./config.ts";
import { createGameState } from "./state.ts";
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

  if (!isSaveEnvelope(parsed)) {
    throw new Error("The saved game has an unsupported or invalid format.");
  }
  return parsed.state;
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
    Number.isFinite(state.clockSeconds) &&
    Number.isFinite(state.savedAtMs) &&
    Number.isInteger(state.nextFindingId) &&
    Array.isArray(state.tiers) &&
    state.tiers.length === 3 &&
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
  return envelope.version === SAVE_VERSION && isGameState(envelope.state);
}
