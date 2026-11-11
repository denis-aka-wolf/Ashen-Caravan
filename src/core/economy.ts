import { MILESTONE_COUNTS, TIER_CONFIG } from "./config.ts";
import type { GameState, TierConfig } from "./types.ts";

export function getTierConfig(tierId: number): TierConfig {
  const tier = TIER_CONFIG.find((entry) => entry.id === tierId);
  if (!tier) {
    throw new RangeError(`Unknown tier: ${tierId}`);
  }
  return tier;
}

export function getTierCost(tierId: number, owned: number): number {
  const tier = getTierConfig(tierId);
  return tier.baseCost * tier.growth ** owned;
}

export function getMilestoneMultiplier(owned: number): number {
  const reached = MILESTONE_COUNTS.filter((count) => owned >= count).length;
  return 2 ** reached;
}

export function getTierIncome(tierId: number, owned: number): number {
  const tier = getTierConfig(tierId);
  return owned * tier.baseIncome * getMilestoneMultiplier(owned);
}

export function getTotalIncome(state: GameState): number {
  return state.tiers.reduce(
    (total, tier) => total + getTierIncome(tier.id, tier.owned),
    0,
  );
}

export function isTierUnlocked(state: GameState, tierId: number): boolean {
  const index = state.tiers.findIndex((tier) => tier.id === tierId);
  if (index < 0) {
    return false;
  }
  if (index === 0) {
    return true;
  }

  const previousTier = state.tiers[index - 1];
  return previousTier.owned >= getTierConfig(tierId).requiredPreviousOwned;
}

export function buyTier(state: GameState, tierId: number): boolean {
  const tierState = state.tiers.find((entry) => entry.id === tierId);
  if (!tierState || !isTierUnlocked(state, tierId)) {
    return false;
  }

  const cost = getTierCost(tierId, tierState.owned);
  if (state.scrap < cost) {
    return false;
  }

  state.scrap -= cost;
  tierState.owned += 1;
  return true;
}

export function addScrap(state: GameState, amount: number): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError("Scrap amount must be a finite non-negative number.");
  }
  state.scrap += amount;
  state.lifetimeScrap += amount;
}
