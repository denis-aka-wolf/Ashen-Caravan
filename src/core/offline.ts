import { OFFLINE_CAP_SECONDS, OFFLINE_EFFICIENCY, OFFLINE_MINIMUM_SECONDS } from "./config.ts";
import { addScrap, getOfflineSettings, getTotalIncome } from "./economy.ts";
import type { GameState } from "./types.ts";
import { updateProgression } from "./progression.ts";

export interface OfflineResult {
  elapsedSeconds: number;
  creditedScrap: number;
}

export function calculateOfflineScrap(
  incomePerSecond: number,
  elapsedSeconds: number,
  capSeconds = OFFLINE_CAP_SECONDS,
  efficiency = OFFLINE_EFFICIENCY,
): number {
  if (
    !Number.isFinite(incomePerSecond) ||
    incomePerSecond < 0 ||
    !Number.isFinite(elapsedSeconds) ||
    elapsedSeconds < 0 ||
    !Number.isFinite(capSeconds) ||
    capSeconds < 0 ||
    !Number.isFinite(efficiency) ||
    efficiency < 0 ||
    efficiency > 1
  ) {
    throw new RangeError("Offline income and elapsed time must be non-negative.");
  }

  return (
    incomePerSecond *
    Math.min(elapsedSeconds, capSeconds) *
    efficiency
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
  const settings = getOfflineSettings(state);
  const creditedScrap =
    elapsedSeconds >= OFFLINE_MINIMUM_SECONDS
      ? calculateOfflineScrap(
          getTotalIncome(state),
          elapsedSeconds,
          settings.capSeconds,
          settings.efficiency,
        )
      : 0;

  if (creditedScrap > 0) {
    addScrap(state, creditedScrap);
    updateProgression(state);
  }
  state.savedAtMs = nowMs;

  return { elapsedSeconds, creditedScrap };
}
