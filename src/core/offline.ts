import {
  OFFLINE_CAP_SECONDS,
  OFFLINE_EFFICIENCY,
  OFFLINE_MINIMUM_SECONDS,
} from "./config.ts";
import { addScrap, getTotalIncome } from "./economy.ts";
import type { GameState } from "./types.ts";

export interface OfflineResult {
  elapsedSeconds: number;
  creditedScrap: number;
}

export function calculateOfflineScrap(
  incomePerSecond: number,
  elapsedSeconds: number,
): number {
  if (
    !Number.isFinite(incomePerSecond) ||
    incomePerSecond < 0 ||
    !Number.isFinite(elapsedSeconds) ||
    elapsedSeconds < 0
  ) {
    throw new RangeError("Offline income and elapsed time must be non-negative.");
  }

  return (
    incomePerSecond *
    Math.min(elapsedSeconds, OFFLINE_CAP_SECONDS) *
    OFFLINE_EFFICIENCY
  );
}

export function applyOfflineEarnings(
  state: GameState,
  nowMs: number,
): OfflineResult {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new RangeError("Current time must be a finite non-negative number.");
  }
  if (nowMs < state.savedAtMs) {
    return { elapsedSeconds: 0, creditedScrap: 0 };
  }

  const elapsedSeconds = Math.floor((nowMs - state.savedAtMs) / 1000);
  const creditedScrap =
    elapsedSeconds >= OFFLINE_MINIMUM_SECONDS
      ? calculateOfflineScrap(getTotalIncome(state), elapsedSeconds)
      : 0;

  if (creditedScrap > 0) {
    addScrap(state, creditedScrap);
  }
  state.savedAtMs = nowMs;

  return { elapsedSeconds, creditedScrap };
}
