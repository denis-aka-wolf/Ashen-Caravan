export interface RuntimeGameConfig {
  schemaVersion: number;
  tierCostMultiplier: number;
  tierIncomeMultiplier: number;
  offlineCapHours: number;
  offlineEfficiency: number;
  prestigeScrapPerBlueprintSquared: number;
  findFrequencyMultiplier: number;
  airshipFrequencyMultiplier: number;
  plainsUnlockBikes: number;
  floodedUnlockScrap: number;
  mountainUnlockScrap: number;
  orderRefreshSeconds: number;
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeGameConfig = {
  schemaVersion: 1,
  tierCostMultiplier: 1,
  tierIncomeMultiplier: 1,
  offlineCapHours: 4,
  offlineEfficiency: 0.5,
  prestigeScrapPerBlueprintSquared: 10_000_000,
  findFrequencyMultiplier: 1,
  airshipFrequencyMultiplier: 1,
  plainsUnlockBikes: 25,
  floodedUnlockScrap: 1_000_000,
  mountainUnlockScrap: 100_000_000,
  orderRefreshSeconds: 600,
};

type NumericSetting = Exclude<keyof RuntimeGameConfig, "schemaVersion">;

const REMOTE_SETTINGS: Record<NumericSetting, { min: number; max: number }> = {
  tierCostMultiplier: { min: 0.5, max: 2 },
  tierIncomeMultiplier: { min: 0.5, max: 2 },
  offlineCapHours: { min: 1, max: 12 },
  offlineEfficiency: { min: 0.3, max: 0.8 },
  prestigeScrapPerBlueprintSquared: { min: 1_000_000, max: 1_000_000_000 },
  findFrequencyMultiplier: { min: 0.5, max: 2 },
  airshipFrequencyMultiplier: { min: 0.5, max: 2 },
  plainsUnlockBikes: { min: 10, max: 100 },
  floodedUnlockScrap: { min: 100_000, max: 100_000_000 },
  mountainUnlockScrap: { min: 10_000_000, max: 1_000_000_000 },
  orderRefreshSeconds: { min: 60, max: 3600 },
};

const REMOTE_FLAG_NAMES: Record<NumericSetting, string> = {
  tierCostMultiplier: "tier_cost_multiplier",
  tierIncomeMultiplier: "tier_income_multiplier",
  offlineCapHours: "offline_cap_hours",
  offlineEfficiency: "offline_efficiency",
  prestigeScrapPerBlueprintSquared: "prestige_scrap_per_blueprint_squared",
  findFrequencyMultiplier: "find_frequency_multiplier",
  airshipFrequencyMultiplier: "airship_frequency_multiplier",
  plainsUnlockBikes: "plains_unlock_bikes",
  floodedUnlockScrap: "flooded_unlock_scrap",
  mountainUnlockScrap: "mountain_unlock_scrap",
  orderRefreshSeconds: "order_refresh_seconds",
};

const INTEGER_SETTINGS = new Set<NumericSetting>([
  "prestigeScrapPerBlueprintSquared",
  "plainsUnlockBikes",
  "floodedUnlockScrap",
  "mountainUnlockScrap",
  "orderRefreshSeconds",
]);

let activeConfig: RuntimeGameConfig = { ...DEFAULT_RUNTIME_CONFIG };

export function getRuntimeGameConfig(): Readonly<RuntimeGameConfig> {
  return activeConfig;
}

export function resetRuntimeGameConfig(): void {
  activeConfig = { ...DEFAULT_RUNTIME_CONFIG };
}

export function applyRemoteGameConfig(
  flags: Record<string, unknown>,
): { config: Readonly<RuntimeGameConfig>; rejectedFlags: string[] } {
  const rawSchemaVersion = flags.config_schema_version;
  const schemaVersion = rawSchemaVersion === undefined
    ? DEFAULT_RUNTIME_CONFIG.schemaVersion
    : typeof rawSchemaVersion === "string"
      ? Number(rawSchemaVersion)
      : Number.NaN;
  if (schemaVersion !== DEFAULT_RUNTIME_CONFIG.schemaVersion) {
    return {
      config: activeConfig,
      rejectedFlags: ["config_schema_version"],
    };
  }

  const next = { ...activeConfig };
  const rejectedFlags: string[] = [];
  for (const [setting, flagName] of Object.entries(REMOTE_FLAG_NAMES) as [
    NumericSetting,
    string,
  ][]) {
    const rawValue = flags[flagName];
    if (rawValue === undefined) {
      continue;
    }

    const value = typeof rawValue === "string" ? Number(rawValue) : Number.NaN;
    const bounds = REMOTE_SETTINGS[setting];
    if (
      typeof rawValue !== "string" ||
      rawValue.trim() === "" ||
      !Number.isFinite(value) ||
      (INTEGER_SETTINGS.has(setting) && !Number.isInteger(value)) ||
      value < bounds.min ||
      value > bounds.max
    ) {
      rejectedFlags.push(flagName);
      continue;
    }
    next[setting] = value;
  }

  activeConfig = next;
  return { config: activeConfig, rejectedFlags };
}

export function getDefaultRemoteFlags(): Record<string, string> {
  return {
    config_schema_version: String(DEFAULT_RUNTIME_CONFIG.schemaVersion),
    ...Object.fromEntries(
      Object.entries(REMOTE_FLAG_NAMES).map(([setting, flagName]) => [
        flagName,
        String(DEFAULT_RUNTIME_CONFIG[setting as NumericSetting]),
      ]),
    ),
  };
}
