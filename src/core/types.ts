export interface TierConfig {
  id: number;
  name: string;
  zoneId: string;
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
  runScrapEarned: number;
  clockSeconds: number;
  totalPlaySeconds: number;
  tiers: TierState[];
  totalPurchasedByTier: number[];
  blueprints: number;
  blueprintsTotal: number;
  tokens: number;
  prestigeCount: number;
  unlockedZones: string[];
  activeZoneId: string;
  buyMode: 1 | 10 | 100 | "max";
  purchasedUpgradeIds: string[];
  talentLevels: Record<string, number>;
  completedAchievementIds: string[];
  requests: RequestState[];
  nextRequestId: number;
  nextOrderRefreshAtSeconds: number;
  ordersCompleted: number;
  findsTapped: number;
  airshipNextAtSeconds: number;
  airshipExpiresAtSeconds: number;
  incomeBoostUntilSeconds: number;
  incomeBoostMultiplier: number;
  dailyStreak: number;
  dailyLastClaimDay: string | null;
  cosmeticOwnedIds: string[];
  selectedCosmeticId: string | null;
  radioRecordIds: string[];
  finds: Finding[];
  nextFindingId: number;
  nextFindAtSeconds: number;
  findComboCount: number;
  findComboExpiresAtSeconds: number;
  findBoostUntilSeconds: number;
  savedAtMs: number;
}

export interface RequestState {
  id: number;
  kind: "scrap" | "tier" | "find";
  target: number;
  startProgress: number;
  tierId?: number;
  progress: number;
  rewardTokens: number;
  rewardScrap: number;
}

export interface GameActionResult {
  success: boolean;
  message: string;
}
