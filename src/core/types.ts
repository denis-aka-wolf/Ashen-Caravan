export interface TierConfig {
  id: number;
  name: string;
  baseCost: number;
  baseIncome: number;
  growth: number;
  requiredPreviousOwned: number;
}

export interface TierState {
  id: number;
  owned: number;
}

export interface Finding {
  id: number;
  x: number;
  y: number;
  expiresAtSeconds: number;
}

export interface GameState {
  scrap: number;
  lifetimeScrap: number;
  clockSeconds: number;
  tiers: TierState[];
  finds: Finding[];
  nextFindingId: number;
  nextFindAtSeconds: number;
  findComboCount: number;
  findComboExpiresAtSeconds: number;
  findBoostUntilSeconds: number;
  savedAtMs: number;
}
