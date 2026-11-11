import { TIER_CONFIG } from "./config.ts";
import { buyTier, getTierCost, getTotalIncome, isTierUnlocked } from "./economy.ts";
import { tapFinding, tickGame } from "./state.ts";
import type { GameState } from "./types.ts";

export interface SimulationOptions {
  durationSeconds: number;
  stepSeconds?: number;
  findTapIntervalSeconds?: number;
}

export interface SimulationResult {
  state: GameState;
  elapsedSeconds: number;
  milestones: SimulationMilestone[];
}

export interface SimulationMilestone {
  label: string;
  elapsedSeconds: number;
  scrap: number;
  incomePerSecond: number;
}

export function simulateEconomy(
  state: GameState,
  options: SimulationOptions,
): SimulationResult {
  const stepSeconds = options.stepSeconds ?? 0.1;
  const findTapInterval = options.findTapIntervalSeconds ?? 10;
  if (
    !Number.isFinite(options.durationSeconds) ||
    options.durationSeconds < 0 ||
    !Number.isFinite(stepSeconds) ||
    stepSeconds <= 0 ||
    !Number.isFinite(findTapInterval) ||
    findTapInterval <= 0
  ) {
    throw new RangeError("Simulation options must be finite and non-negative.");
  }

  const milestones: SimulationMilestone[] = [];
  const targets = [
    { label: "10 тележек", tierId: 1, owned: 10 },
    { label: "25 тележек", tierId: 1, owned: 25 },
    { label: "10 велосипедов", tierId: 2, owned: 10 },
    { label: "10 мотодрезин", tierId: 3, owned: 10 },
  ];
  let nextTarget = 0;
  let nextTapAt = findTapInterval;
  const random = () => 0.5;

  while (state.clockSeconds < options.durationSeconds) {
    const step = Math.min(stepSeconds, options.durationSeconds - state.clockSeconds);
    tickGame(state, step, random);
    const income = getTotalIncome(state);

    while (state.clockSeconds >= nextTapAt) {
      const finding = state.finds[0];
      if (finding) {
        tapFinding(state, finding.id);
      }
      nextTapAt += findTapInterval;
    }

    while (tryBuyBestValueTier(state)) {
      if (!Number.isFinite(state.scrap)) {
        throw new Error("Simulation produced a non-finite scrap balance.");
      }
    }

    while (nextTarget < targets.length) {
      const target = targets[nextTarget];
      const tier = state.tiers.find((entry) => entry.id === target.tierId);
      if (!tier || tier.owned < target.owned) {
        break;
      }
      milestones.push({
        label: target.label,
        elapsedSeconds: state.clockSeconds,
        scrap: state.scrap,
        incomePerSecond: getTotalIncome(state),
      });
      nextTarget += 1;
    }
  }

  return { state, elapsedSeconds: state.clockSeconds, milestones };
}

function tryBuyBestValueTier(state: GameState): boolean {
  const candidates = TIER_CONFIG.filter((tier) => isTierUnlocked(state, tier.id))
    .map((tier) => ({
      id: tier.id,
      cost: getTierCost(
        tier.id,
        state.tiers.find((entry) => entry.id === tier.id)?.owned ?? 0,
      ),
      income: tier.baseIncome,
    }))
    .filter((tier) => tier.cost <= state.scrap)
    .sort((left, right) => left.cost / left.income - right.cost / right.income);

  return candidates.length > 0 ? buyTier(state, candidates[0].id) : false;
}
