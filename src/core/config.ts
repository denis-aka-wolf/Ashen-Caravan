import type { TierConfig } from "./types.ts";

export const TIER_CONFIG: readonly TierConfig[] = [
  {
    id: 1,
    name: "Ручная тележка",
    baseCost: 10,
    baseIncome: 0.5,
    growth: 1.1,
    requiredPreviousOwned: 0,
  },
  {
    id: 2,
    name: "Велосипед-сборщик",
    baseCost: 125,
    baseIncome: 4.25,
    growth: 1.11,
    requiredPreviousOwned: 10,
  },
  {
    id: 3,
    name: "Мотодрезина",
    baseCost: 1_562,
    baseIncome: 36.1,
    growth: 1.12,
    requiredPreviousOwned: 10,
  },
];

export const MILESTONE_COUNTS = [10, 25, 50] as const;
export const FIND_MIN_INTERVAL_SECONDS = 4;
export const FIND_MAX_INTERVAL_SECONDS = 7;
export const FIND_LIFETIME_SECONDS = 8;
export const FIND_BOOST_TAPS_REQUIRED = 5;
export const FIND_BOOST_DURATION_SECONDS = 10;
export const OFFLINE_CAP_SECONDS = 4 * 60 * 60;
export const OFFLINE_EFFICIENCY = 0.5;
export const OFFLINE_MINIMUM_SECONDS = 60;
export const SAVE_KEY = "ashen-caravan-prototype-v1";
export const SAVE_VERSION = 1;
