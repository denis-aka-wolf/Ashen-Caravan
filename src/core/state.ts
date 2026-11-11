import {
  FIND_MAX_INTERVAL_SECONDS,
  FIND_MIN_INTERVAL_SECONDS,
  TIER_CONFIG,
} from "./config.ts";
import { addScrap, getTotalIncome } from "./economy.ts";
import type { Finding, GameState } from "./types.ts";

export function createGameState(nowMs = Date.now()): GameState {
  return {
    scrap: 0,
    lifetimeScrap: 0,
    clockSeconds: 0,
    tiers: TIER_CONFIG.map((tier) => ({ id: tier.id, owned: 0 })),
    finds: [],
    nextFindingId: 1,
    nextFindAtSeconds: randomFindDelay(Math.random),
    findComboCount: 0,
    findComboExpiresAtSeconds: 0,
    findBoostUntilSeconds: 0,
    savedAtMs: nowMs,
  };
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
  state.finds = state.finds.filter(
    (finding) => finding.expiresAtSeconds > state.clockSeconds,
  );

  while (state.clockSeconds >= state.nextFindAtSeconds) {
    if (state.finds.length < 3) {
      state.finds.push(createFinding(state, random));
    }
    state.nextFindAtSeconds += randomFindDelay(random);
  }

  if (state.findComboExpiresAtSeconds <= state.clockSeconds) {
    state.findComboCount = 0;
  }
}

export function tapFinding(state: GameState, findingId: number): number {
  const index = state.finds.findIndex((finding) => finding.id === findingId);
  if (index < 0) {
    return 0;
  }

  state.finds.splice(index, 1);
  if (state.clockSeconds >= state.findComboExpiresAtSeconds) {
    state.findComboCount = 0;
  }
  state.findComboCount += 1;
  state.findComboExpiresAtSeconds = state.clockSeconds + 8;

  if (state.findComboCount >= 5) {
    state.findComboCount = 0;
    state.findBoostUntilSeconds = state.clockSeconds + 10;
  }

  const multiplier = state.findBoostUntilSeconds > state.clockSeconds ? 2 : 1;
  const reward = Math.max(1, getTotalIncome(state) * 10) * multiplier;
  addScrap(state, reward);
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

function randomFindDelay(random: () => number): number {
  return (
    FIND_MIN_INTERVAL_SECONDS +
    random() * (FIND_MAX_INTERVAL_SECONDS - FIND_MIN_INTERVAL_SECONDS)
  );
}
