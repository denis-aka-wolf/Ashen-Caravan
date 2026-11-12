import {
  MILESTONE_COUNTS,
  TIER_CONFIG,
  UPGRADE_CONFIG,
} from "./config.ts";
import { getRuntimeGameConfig } from "./runtime-config.ts";
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
  return tier.baseCost * tier.growth ** owned * getRuntimeGameConfig().tierCostMultiplier;
}

export function getMilestoneMultiplier(owned: number): number {
  const reached = MILESTONE_COUNTS.filter((count) => owned >= count).length;
  return 2 ** reached;
}

export function getTierIncome(
  tierId: number,
  owned: number,
  purchasedUpgradeIds: readonly string[] = [],
): number {
  const tier = getTierConfig(tierId);
  const tierUpgrade = UPGRADE_CONFIG
    .filter((upgrade) => upgrade.category === "tier" && upgrade.tierId === tierId)
    .filter((upgrade) => purchasedUpgradeIds.includes(upgrade.id))
    .reduce((multiplier, upgrade) => multiplier * (upgrade.multiplier ?? 1), 1);
  return (
    owned *
    tier.baseIncome *
    getMilestoneMultiplier(owned) *
    tierUpgrade *
    getRuntimeGameConfig().tierIncomeMultiplier
  );
}

export function getTotalIncome(state: GameState): number {
  const baseIncome = state.tiers.reduce(
    (total, tier) =>
      total + getTierIncome(tier.id, tier.owned, state.purchasedUpgradeIds),
    0,
  );
  const globalMultiplier = UPGRADE_CONFIG
    .filter((upgrade) => upgrade.category === "global" && state.purchasedUpgradeIds.includes(upgrade.id))
    .reduce((multiplier, upgrade) => multiplier * (upgrade.multiplier ?? 1), 1);
  const talentMultiplier =
    1 +
    (state.talentLevels["salvage-income"] ?? 0) * 0.1 +
    (state.talentLevels["camp-recovery"] ?? 0) * 0.1;
  const prestigeMultiplier = 1 + 0.02 * state.blueprintsTotal;
  const temporaryMultiplier =
    state.incomeBoostUntilSeconds > state.clockSeconds
      ? state.incomeBoostMultiplier
      : 1;
  return baseIncome * globalMultiplier * talentMultiplier * prestigeMultiplier * temporaryMultiplier;
}

export function isTierUnlocked(state: GameState, tierId: number): boolean {
  const index = state.tiers.findIndex((tier) => tier.id === tierId);
  if (index < 0) {
    return false;
  }
  if (index === 0) {
    return true;
  }

  const config = getTierConfig(tierId);
  if (!state.unlockedZones.includes(config.zoneId)) {
    return false;
  }

  const previousTier = state.tiers[index - 1];
  return previousTier.owned >= config.requiredPreviousOwned;
}

export function buyTier(state: GameState, tierId: number): boolean {
  return buyTierBulk(state, tierId, 1) > 0;
}

export function getBulkTierCost(
  tierId: number,
  owned: number,
  quantity: number,
  discount = 0,
): number {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new RangeError("Purchase quantity must be a positive integer.");
  }
  const tier = getTierConfig(tierId);
  const firstPrice = getTierCost(tierId, owned);
  const cost =
    quantity === 1
      ? firstPrice
      : firstPrice * (tier.growth ** quantity - 1) / (tier.growth - 1);
  return cost * Math.max(0, 1 - discount);
}

export function getAffordableTierQuantity(
  tierId: number,
  owned: number,
  scrap: number,
  discount = 0,
): number {
  const tier = getTierConfig(tierId);
  const firstPrice = getTierCost(tierId, owned) * Math.max(0.01, 1 - discount);
  if (scrap < firstPrice) {
    return 0;
  }
  return Math.max(
    1,
    Math.floor(Math.log(1 + scrap * (tier.growth - 1) / firstPrice) / Math.log(tier.growth)),
  );
}

export function buyTierBulk(
  state: GameState,
  tierId: number,
  requestedQuantity: number | "max",
): number {
  const tierState = state.tiers.find((entry) => entry.id === tierId);
  if (!tierState || !isTierUnlocked(state, tierId)) {
    return 0;
  }

  const discount = Math.min(0.25, (state.talentLevels["logistics-discount"] ?? 0) * 0.05);
  const quantity =
    requestedQuantity === "max"
      ? getAffordableTierQuantity(tierId, tierState.owned, state.scrap, discount)
      : requestedQuantity;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return 0;
  }

  const affordable = getAffordableTierQuantity(tierId, tierState.owned, state.scrap, discount);
  const actualQuantity = Math.min(quantity, affordable);
  if (actualQuantity <= 0) {
    return 0;
  }
  const cost = getBulkTierCost(tierId, tierState.owned, actualQuantity, discount);
  state.scrap = Math.max(0, state.scrap - cost);
  tierState.owned += actualQuantity;
  state.totalPurchasedByTier[tierId] = (state.totalPurchasedByTier[tierId] ?? 0) + actualQuantity;
  return actualQuantity;
}

export function addScrap(state: GameState, amount: number): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError("Scrap amount must be a finite non-negative number.");
  }
  state.scrap += amount;
  state.lifetimeScrap += amount;
  state.runScrapEarned += amount;
}

export function getFindPower(state: GameState): number {
  const findUpgradeCount = UPGRADE_CONFIG.filter(
    (upgrade) => upgrade.category === "find" && state.purchasedUpgradeIds.includes(upgrade.id),
  ).length;
  return (
    1 +
    findUpgradeCount +
    (state.talentLevels["luck-finds"] ?? 0) * 0.2 +
    (state.talentLevels["salvage-find"] ?? 0) * 0.25
  );
}

export function getOfflineSettings(state: GameState): { capSeconds: number; efficiency: number } {
  const offlineUpgrades = UPGRADE_CONFIG.filter(
    (upgrade) => upgrade.category === "offline" && state.purchasedUpgradeIds.includes(upgrade.id),
  );
  const upgradeEfficiency = offlineUpgrades.reduce(
    (sum, upgrade) => sum + (upgrade.offlineEfficiency ?? 0),
    0,
  );
  const upgradeCap = offlineUpgrades.reduce(
    (sum, upgrade) => sum + (upgrade.offlineCapSeconds ?? 0),
    0,
  );
  const talentCap = (state.talentLevels["camp-cap"] ?? 0) * 2 * 60 * 60;
  const talentEfficiency = (state.talentLevels["camp-efficiency"] ?? 0) * 0.1;
  return {
    capSeconds: Math.min(
      12 * 60 * 60,
      getRuntimeGameConfig().offlineCapHours * 60 * 60 + talentCap + upgradeCap,
    ),
    efficiency: Math.min(
      0.8,
      getRuntimeGameConfig().offlineEfficiency + upgradeEfficiency + talentEfficiency,
    ),
  };
}

export function buyUpgrade(state: GameState, upgradeId: string): boolean {
  const upgrade = UPGRADE_CONFIG.find((entry) => entry.id === upgradeId);
  if (
    !upgrade ||
    state.purchasedUpgradeIds.includes(upgradeId) ||
    state.scrap < upgrade.cost
  ) {
    return false;
  }
  if (upgrade.tierId && !isTierUnlocked(state, upgrade.tierId)) {
    return false;
  }
  const tier = upgrade.tierId
    ? state.tiers.find((entry) => entry.id === upgrade.tierId)
    : undefined;
  if (tier && tier.owned < (upgrade.requiredOwned ?? 0)) {
    return false;
  }
  state.scrap -= upgrade.cost;
  state.purchasedUpgradeIds.push(upgradeId);
  return true;
}

export function getStateTierIncome(state: GameState, tierId: number): number {
  const tier = state.tiers.find((entry) => entry.id === tierId);
  if (!tier) {
    return 0;
  }
  return getTierIncome(tierId, tier.owned, state.purchasedUpgradeIds);
}
