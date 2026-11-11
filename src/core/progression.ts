import {
  ACHIEVEMENT_CONFIG,
  AIRSHIP_VISIBLE_SECONDS,
  COSMETIC_CONFIG,
  DAILY_REWARDS,
  ORDER_SLOT_COUNT,
  PRESTIGE_MIN_BLUEPRINTS,
  PRESTIGE_SCRAP_PER_BLUEPRINT_SQUARED,
  RADIO_RECORDS,
  TALENT_CONFIG,
  TIER_CONFIG,
  ZONE_CONFIG,
} from "./config.ts";
import {
  addScrap,
  getTotalIncome,
} from "./economy.ts";
import type { GameActionResult, GameState, RequestState } from "./types.ts";

export function updateProgression(state: GameState): void {
  for (const zone of ZONE_CONFIG) {
    if (state.unlockedZones.includes(zone.id)) {
      continue;
    }

    const unlocked =
      zone.id === "plains"
        ? (state.tiers[1]?.owned ?? 0) >= 25
        : zone.id === "flooded"
          ? state.runScrapEarned >= 1_000_000
          : zone.id === "mountain"
            ? state.runScrapEarned >= 100_000_000
            : false;
    if (unlocked) {
      state.unlockedZones.push(zone.id);
      unlockRadioForZone(state, zone.id);
    }
  }

  for (const request of state.requests) {
    const current = getRequestMetric(state, request);
    request.progress = Math.max(0, current - request.startProgress);
  }

  for (const achievement of ACHIEVEMENT_CONFIG) {
    if (
      !state.completedAchievementIds.includes(achievement.id) &&
      achievement.check(state)
    ) {
      state.completedAchievementIds.push(achievement.id);
      state.tokens += achievement.reward;
    }
  }
}

export function setActiveZone(state: GameState, zoneId: string): GameActionResult {
  const zone = ZONE_CONFIG.find((entry) => entry.id === zoneId);
  if (!zone || !state.unlockedZones.includes(zoneId)) {
    return { success: false, message: "Эта зона маршрута ещё закрыта." };
  }
  state.activeZoneId = zoneId;
  return { success: true, message: `Караван прибыл: ${zone.name}.` };
}

export function getPrestigeBlueprintGain(state: GameState): number {
  return Math.floor(
    Math.sqrt(state.runScrapEarned / PRESTIGE_SCRAP_PER_BLUEPRINT_SQUARED),
  );
}

export function startNewRun(
  state: GameState,
  nowMs: number,
): GameActionResult {
  const gain = getPrestigeBlueprintGain(state);
  if (gain < PRESTIGE_MIN_BLUEPRINTS) {
    return {
      success: false,
      message: `Для нового перегона нужно ещё ${PRESTIGE_MIN_BLUEPRINTS - gain} Чертежей.`,
    };
  }

  state.blueprints += gain;
  state.blueprintsTotal += gain;
  state.prestigeCount += 1;
  state.scrap = 0;
  state.runScrapEarned = 0;
  state.clockSeconds = 0;
  state.tiers = TIER_CONFIG.map((tier) => ({ id: tier.id, owned: 0 }));
  const startUnits =
    (state.talentLevels["logistics-start"] ?? 0) * 2 +
    (state.talentLevels["free-cart"] ?? 0);
  if (startUnits > 0) {
    state.tiers[0].owned = startUnits;
  }
  state.unlockedZones = ["ruins"];
  state.activeZoneId = "ruins";
  state.purchasedUpgradeIds = [];
  state.finds = [];
  state.findComboCount = 0;
  state.findComboExpiresAtSeconds = 0;
  state.findBoostUntilSeconds = 0;
  state.incomeBoostUntilSeconds = 0;
  state.incomeBoostMultiplier = 1;
  state.airshipExpiresAtSeconds = 0;
  const airshipFrequency = 1 + (state.talentLevels["luck-airship"] ?? 0) * 0.1;
  state.airshipNextAtSeconds = (60 + Math.random() * 60) / airshipFrequency;
  state.nextFindingId = 1;
  state.nextFindAtSeconds = 4 + Math.random() * 3;
  state.nextOrderRefreshAtSeconds = 600;
  state.requests = [];
  refreshRequests(state, Math.random);
  unlockRadioForPrestige(state);
  updateProgression(state);
  state.savedAtMs = nowMs;
  return {
    success: true,
    message: `Новый перегон начат! Получено чертежей: ${gain}.`,
  };
}

export function buyTalent(state: GameState, talentId: string): GameActionResult {
  const talent = TALENT_CONFIG.find((entry) => entry.id === talentId);
  if (!talent) {
    return { success: false, message: "Талант не найден." };
  }
  const level = state.talentLevels[talentId] ?? 0;
  if (level >= talent.maxLevel) {
    return { success: false, message: "Талант уже улучшен до максимума." };
  }
  const cost = talent.baseCost * 2 ** level;
  if (state.blueprints < cost) {
    return { success: false, message: `Нужно чертежей: ${cost}.` };
  }
  state.blueprints -= cost;
  state.talentLevels[talentId] = level + 1;
  return { success: true, message: `Талант «${talent.name}» улучшен.` };
}

export function refreshRequests(
  state: GameState,
  random: () => number = Math.random,
): void {
  while (state.requests.length < ORDER_SLOT_COUNT) {
    state.requests.push(createRequest(state, random));
  }
}

export function claimRequest(
  state: GameState,
  requestId: number,
): GameActionResult {
  const index = state.requests.findIndex((request) => request.id === requestId);
  if (index < 0) {
    return { success: false, message: "Просьба уже недоступна." };
  }
  const request = state.requests[index];
  request.progress = Math.max(
    request.progress,
    getRequestMetric(state, request) - request.startProgress,
  );
  if (request.progress < request.target) {
    return { success: false, message: "Просьба пока не выполнена." };
  }

  const requestBonus = 1 + (state.talentLevels["logistics-orders"] ?? 0) * 0.1;
  state.tokens += Math.floor(request.rewardTokens * requestBonus);
  addScrap(state, request.rewardScrap);
  state.ordersCompleted += 1;
  state.requests.splice(index, 1);
  refreshRequests(state);
  updateProgression(state);
  return { success: true, message: "Просьба выполнена. Попутчики благодарят!" };
}

export function skipRequest(
  state: GameState,
  requestId: number,
): GameActionResult {
  if (state.tokens < 1) {
    return { success: false, message: "Для пропуска нужен 1 жетон." };
  }
  const index = state.requests.findIndex((request) => request.id === requestId);
  if (index < 0) {
    return { success: false, message: "Просьба уже недоступна." };
  }
  state.tokens -= 1;
  state.requests[index] = createRequest(state, Math.random);
  return { success: true, message: "Просьба заменена." };
}

export function buyCosmetic(
  state: GameState,
  cosmeticId: string,
): GameActionResult {
  const cosmetic = COSMETIC_CONFIG.find((entry) => entry.id === cosmeticId);
  if (!cosmetic) {
    return { success: false, message: "Предмет не найден." };
  }
  if (state.cosmeticOwnedIds.includes(cosmeticId)) {
    state.selectedCosmeticId = cosmeticId;
    return { success: true, message: `Выбрано: ${cosmetic.name}.` };
  }
  if (state.tokens < cosmetic.cost) {
    return { success: false, message: `Нужно жетонов: ${cosmetic.cost}.` };
  }
  state.tokens -= cosmetic.cost;
  state.cosmeticOwnedIds.push(cosmeticId);
  state.selectedCosmeticId = cosmeticId;
  return { success: true, message: `Получено: ${cosmetic.name}.` };
}

export function claimDailyReward(
  state: GameState,
  now = new Date(),
): GameActionResult {
  const today = toUtcDay(now);
  if (state.dailyLastClaimDay === today) {
    return { success: false, message: "Ежедневный бонус уже получен сегодня." };
  }

  const previous = state.dailyLastClaimDay
    ? new Date(`${state.dailyLastClaimDay}T00:00:00.000Z`)
    : null;
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const isConsecutive =
    previous !== null && toUtcDay(previous) === toUtcDay(yesterday);
  state.dailyStreak = previous === null
    ? 0
    : isConsecutive
      ? (state.dailyStreak + 1) % DAILY_REWARDS.length
      : Math.max(0, state.dailyStreak - 1);

  const reward = DAILY_REWARDS[state.dailyStreak];
  addScrap(state, getTotalIncome(state) * reward.scrapIncomeMinutes * 60);
  state.tokens += reward.tokens;
  if (reward.airship) {
    state.airshipExpiresAtSeconds = Math.max(
      state.airshipExpiresAtSeconds,
      state.clockSeconds + AIRSHIP_VISIBLE_SECONDS,
    );
  }
  state.dailyLastClaimDay = today;
  updateProgression(state);
  return {
    success: true,
    message: `Бонус ${state.dailyStreak + 1}/7 получен: +${reward.tokens} жетонов.`,
  };
}

export function claimAirshipReward(
  state: GameState,
  random: () => number = Math.random,
): GameActionResult {
  if (
    state.airshipExpiresAtSeconds <= state.clockSeconds ||
    state.airshipExpiresAtSeconds === 0
  ) {
    return { success: false, message: "Дирижабль сейчас не пролетает." };
  }
  state.airshipExpiresAtSeconds = 0;
  const rewardType = Math.floor(random() * 3);
  if (rewardType === 0) {
    state.incomeBoostMultiplier = Math.min(10, state.incomeBoostMultiplier * 7);
    state.incomeBoostUntilSeconds = state.clockSeconds + 30;
    return { success: true, message: "Доход ×7 на 30 секунд!" };
  }
  if (rewardType === 1) {
    addScrap(state, getTotalIncome(state) * 15 * 60);
    updateProgression(state);
    return { success: true, message: "Караван получил 15 минут дохода ломом." };
  }
  state.tokens += 3;
  return { success: true, message: "Дирижабль сбросил 3 жетона!" };
}

export function unlockRadioForZone(state: GameState, zoneId: string): void {
  for (const record of RADIO_RECORDS.filter((entry) => entry.zoneId === zoneId).slice(0, 4)) {
    if (!state.radioRecordIds.includes(record.id)) {
      state.radioRecordIds.push(record.id);
    }
  }
}

function unlockRadioForPrestige(state: GameState): void {
  const id = `radio-prestige-${state.prestigeCount}`;
  if (!state.radioRecordIds.includes(id)) {
    state.radioRecordIds.push(id);
  }
}

function createRequest(
  state: GameState,
  random: () => number,
): RequestState {
  const kind = (["scrap", "tier", "find"] as const)[Math.floor(random() * 3)];
  const income = getTotalIncome(state);
  const id = state.nextRequestId++;
  if (kind === "scrap") {
    const minutes = 20 + random() * 20;
    const target = Math.max(20, income * minutes * 60);
    return {
      id,
      kind,
      target,
      startProgress: state.runScrapEarned,
      progress: 0,
      rewardTokens: Math.max(1, Math.floor(minutes / 10)),
      rewardScrap: Math.max(1, income * 60),
    };
  }
  if (kind === "tier") {
    const eligible = TIER_CONFIG.filter((tier, index) => {
      if (!state.unlockedZones.includes(tier.zoneId)) {
        return false;
      }
      if (index === 0) {
        return true;
      }
      return (
        (state.tiers[index - 1]?.owned ?? 0) >= tier.requiredPreviousOwned
      );
    });
    const tierId = eligible[Math.floor(random() * eligible.length)]?.id ?? 1;
    const target = 5 + Math.floor(random() * 6);
    return {
      id,
      kind,
      tierId,
      target,
      startProgress: state.totalPurchasedByTier[tierId] ?? 0,
      progress: 0,
      rewardTokens: 2,
      rewardScrap: Math.max(1, income * 60),
    };
  }
  const target = 5 + Math.floor(random() * 11);
  return {
    id,
    kind,
    target,
    startProgress: state.findsTapped,
    progress: 0,
    rewardTokens: 2,
    rewardScrap: Math.max(1, income * 60),
  };
}

function getRequestMetric(state: GameState, request: RequestState): number {
  if (request.kind === "scrap") {
    return state.runScrapEarned;
  }
  if (request.kind === "find") {
    return state.findsTapped;
  }
  return state.totalPurchasedByTier[request.tierId ?? 1] ?? 0;
}

function toUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
