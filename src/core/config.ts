import type { TierConfig } from "./types.ts";

export const TIER_CONFIG: readonly TierConfig[] = [
  { id: 1, name: "Ручная тележка", zoneId: "ruins", baseCost: 10, baseIncome: 0.5, growth: 1.1, requiredPreviousOwned: 0 },
  { id: 2, name: "Велосипед-сборщик", zoneId: "ruins", baseCost: 125, baseIncome: 4.25, growth: 1.11, requiredPreviousOwned: 10 },
  { id: 3, name: "Мотодрезина", zoneId: "plains", baseCost: 1_562, baseIncome: 36.1, growth: 1.12, requiredPreviousOwned: 10 },
  { id: 4, name: "Вездеход-сборщик", zoneId: "plains", baseCost: 19_531, baseIncome: 307, growth: 1.13, requiredPreviousOwned: 10 },
  { id: 5, name: "Рой дронов", zoneId: "flooded", baseCost: 244_141, baseIncome: 2_610, growth: 1.14, requiredPreviousOwned: 10 },
  { id: 6, name: "Мобильная мастерская", zoneId: "flooded", baseCost: 3_051_758, baseIncome: 22_185, growth: 1.15, requiredPreviousOwned: 10 },
  { id: 7, name: "Шагающий кран", zoneId: "mountain", baseCost: 38_146_972, baseIncome: 188_575, growth: 1.16, requiredPreviousOwned: 10 },
  { id: 8, name: "Передвижной завод", zoneId: "mountain", baseCost: 476_837_158, baseIncome: 1_600_000, growth: 1.17, requiredPreviousOwned: 10 },
];

export const ZONE_CONFIG = [
  { id: "ruins", name: "Руины города", firstTier: 1, lastTier: 2 },
  { id: "plains", name: "Пыльная равнина", firstTier: 3, lastTier: 4 },
  { id: "flooded", name: "Затопленное шоссе", firstTier: 5, lastTier: 6 },
  { id: "mountain", name: "Горный перевал", firstTier: 7, lastTier: 8 },
] as const;

export const MILESTONE_COUNTS = [10, 25, 50, 100, 200, 300, 400, 500] as const;
export const FIND_MIN_INTERVAL_SECONDS = 4;
export const FIND_MAX_INTERVAL_SECONDS = 7;
export const FIND_LIFETIME_SECONDS = 8;
export const FIND_BOOST_TAPS_REQUIRED = 5;
export const FIND_BOOST_DURATION_SECONDS = 10;
export const OFFLINE_CAP_SECONDS = 4 * 60 * 60;
export const OFFLINE_EFFICIENCY = 0.5;
export const OFFLINE_MINIMUM_SECONDS = 60;
export const OFFLINE_MAX_CAP_SECONDS = 12 * 60 * 60;
export const SAVE_KEY = "ashen-caravan-prototype-v1";
export const SAVE_VERSION = 2;
export const PRESTIGE_MIN_BLUEPRINTS = 5;
export const PRESTIGE_SCRAP_PER_BLUEPRINT_SQUARED = 10_000_000;
export const AIRSHIP_REWARD_INTERVAL_MIN_SECONDS = 60;
export const AIRSHIP_REWARD_INTERVAL_MAX_SECONDS = 120;
export const AIRSHIP_VISIBLE_SECONDS = 6;
export const ORDER_REFRESH_SECONDS = 10 * 60;
export const ORDER_SLOT_COUNT = 3;
export const DAILY_REWARDS = [
  { scrapIncomeMinutes: 2, tokens: 0, airship: false },
  { scrapIncomeMinutes: 5, tokens: 1, airship: false },
  { scrapIncomeMinutes: 10, tokens: 0, airship: true },
  { scrapIncomeMinutes: 15, tokens: 2, airship: false },
  { scrapIncomeMinutes: 20, tokens: 0, airship: true },
  { scrapIncomeMinutes: 30, tokens: 3, airship: false },
  { scrapIncomeMinutes: 60, tokens: 5, airship: true },
] as const;

export interface UpgradeConfig {
  id: string;
  name: string;
  description: string;
  category: "tier" | "global" | "find" | "offline";
  cost: number;
  multiplier?: number;
  tierId?: number;
  findPower?: number;
  offlineEfficiency?: number;
  offlineCapSeconds?: number;
  requiredOwned?: number;
}

export const UPGRADE_CONFIG: readonly UpgradeConfig[] = [
  ...TIER_CONFIG.flatMap((tier) => [
    { id: `tier-${tier.id}-1`, name: `${tier.name}: усиленные детали`, description: `Доход тира ×${tier.id}`, category: "tier" as const, cost: tier.baseCost * 100, multiplier: 2, tierId: tier.id, requiredOwned: 10 },
    { id: `tier-${tier.id}-2`, name: `${tier.name}: смена мастеров`, description: `Доход тира ×${tier.id}`, category: "tier" as const, cost: tier.baseCost * 10_000, multiplier: 3, tierId: tier.id, requiredOwned: 25 },
  ]),
  ...Array.from({ length: 8 }, (_, index) => ({
    id: `global-${index + 1}`,
    name: ["Слаженная смена", "План маршрута", "Общий склад", "Улучшенная рация", "Бережный ремонт", "Сильный двигатель", "Длинная колонна", "К новым берегам"][index],
    description: `Весь доход ×${index < 4 ? 1.5 : 2}`,
    category: "global" as const,
    cost: 1_000 * 100 ** index,
    multiplier: index < 4 ? 1.5 : 2,
  })),
  ...Array.from({ length: 6 }, (_, index) => ({
    id: `find-${index + 1}`,
    name: ["Блики на дороге", "Глазастая Искра", "Сеть ловушек", "Приметные ящики", "Быстрые руки", "Удачная полоса"][index],
    description: "Находки появляются чаще и приносят больше",
    category: "find" as const,
    cost: 100 * 100 ** index,
    findPower: 1,
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    id: `offline-${index + 1}`,
    name: ["Тёплая стоянка", "Запасные канистры", "Дежурный механик", "Укрытый лагерь"][index],
    description: index < 2 ? "+10% эффективности офлайн-дохода" : "+2 часа к лимиту офлайн-дохода",
    category: "offline" as const,
    cost: 1_000 * 100 ** index,
    offlineEfficiency: index < 2 ? 0.1 : 0,
    offlineCapSeconds: index >= 2 ? 2 * 60 * 60 : 0,
  })),
];

export const TALENT_CONFIG = [
  { id: "salvage-income", name: "Опыт сборщиков", branch: "Добыча", maxLevel: 5, baseCost: 3, description: "+10% к доходу за уровень" },
  { id: "free-cart", name: "Запасная тележка", branch: "Добыча", maxLevel: 1, baseCost: 5, description: "Начинай перегон с тележкой" },
  { id: "salvage-find", name: "Ценные находки", branch: "Добыча", maxLevel: 3, baseCost: 8, description: "+25% к находкам за уровень" },
  { id: "logistics-start", name: "Подготовленный старт", branch: "Логистика", maxLevel: 3, baseCost: 5, description: "+2 тележки в начале перегона за уровень" },
  { id: "logistics-discount", name: "Бережные закупки", branch: "Логистика", maxLevel: 5, baseCost: 5, description: "−5% стоимости техники за уровень" },
  { id: "logistics-orders", name: "Знакомые дороги", branch: "Логистика", maxLevel: 3, baseCost: 8, description: "Больше жетонов за просьбы" },
  { id: "luck-airship", name: "Попутный ветер", branch: "Удача", maxLevel: 5, baseCost: 5, description: "Дирижабль появляется чаще" },
  { id: "luck-finds", name: "Верный глаз", branch: "Удача", maxLevel: 5, baseCost: 5, description: "+20% к находкам за уровень" },
  { id: "luck-tokens", name: "Удачный обмен", branch: "Удача", maxLevel: 3, baseCost: 8, description: "Иногда находка приносит жетон" },
  { id: "camp-cap", name: "Уютная стоянка", branch: "Стоянка", maxLevel: 4, baseCost: 5, description: "+2 часа лимита офлайн-дохода за уровень" },
  { id: "camp-efficiency", name: "Дежурная смена", branch: "Стоянка", maxLevel: 3, baseCost: 8, description: "+10% эффективности офлайн-дохода за уровень" },
  { id: "camp-recovery", name: "Быстрый ремонт", branch: "Стоянка", maxLevel: 3, baseCost: 8, description: "+10% общего дохода за уровень" },
] as const;

export const COSMETIC_CONFIG = [
  { id: "beacon-rust", name: "Ржавая классика", cost: 5 },
  { id: "beacon-amber", name: "Янтарные полосы", cost: 10 },
  { id: "beacon-sky", name: "Цвет ясного неба", cost: 15 },
  { id: "garland-warm", name: "Тёплая гирлянда", cost: 8 },
  { id: "garland-color", name: "Праздничные огни", cost: 15 },
  { id: "garland-stars", name: "Звёздная цепочка", cost: 25 },
] as const;

export const RADIO_RECORDS = [
  { id: "radio-ruins-1", zoneId: "ruins", text: "Помехи… Если кто-то слышит, старая дорога всё ещё проходима." },
  { id: "radio-ruins-2", zoneId: "ruins", text: "Мы оставили у моста термос. Может, кому пригодится." },
  { id: "radio-ruins-3", zoneId: "ruins", text: "Сигнал с запада. В эфире сказали: «Зелёный берег»." },
  { id: "radio-plains-1", zoneId: "plains", text: "На равнине ветер такой, что даже флюгеру нужен механик." },
  { id: "radio-plains-2", zoneId: "plains", text: "Сегодня нашли целую коробку пуговиц. У каждого теперь есть выбор." },
  { id: "radio-plains-3", zoneId: "plains", text: "Передача повторяется: у берега теплее." },
  { id: "radio-flooded-1", zoneId: "flooded", text: "Вода отступила. На отбойнике кто-то нарисовал стрелку." },
  { id: "radio-flooded-2", zoneId: "flooded", text: "Мастерская гремит громче грозы, зато снова едет." },
  { id: "radio-flooded-3", zoneId: "flooded", text: "Слышно чаек. Или это Искра учится свистеть?" },
  { id: "radio-mountain-1", zoneId: "mountain", text: "Перевал открыт. Тёплый чай сегодня особенно кстати." },
  { id: "radio-mountain-2", zoneId: "mountain", text: "Под облаками видна полоска моря." },
  { id: "radio-mountain-3", zoneId: "mountain", text: "Сигнал стал яснее. Мы на правильной дороге." },
] as const;

export const ACHIEVEMENT_CONFIG = [
  ...TIER_CONFIG.map((tier) => ({ id: `crew-${tier.id}`, name: `Своя команда: ${tier.name}`, description: `Купить 10 единиц тира ${tier.id}`, reward: 2, check: (state: import("./types.ts").GameState) => (state.totalPurchasedByTier[tier.id] ?? 0) >= 10 })),
  ...[1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000].map((threshold, index) => ({ id: `scrap-${index + 1}`, name: `Запасливый караван ${index + 1}`, description: `Собрать ${threshold.toLocaleString("ru-RU")} лома за всё время`, reward: index + 1, check: (state: import("./types.ts").GameState) => state.lifetimeScrap >= threshold })),
  ...[1, 5, 10, 25].map((threshold) => ({ id: `prestige-${threshold}`, name: `Новый горизонт ${threshold}`, description: `Начать перегоны: ${threshold}`, reward: 3, check: (state: import("./types.ts").GameState) => state.prestigeCount >= threshold })),
  ...[1, 25, 100, 500].map((threshold) => ({ id: `find-${threshold}`, name: `Глазастый сборщик ${threshold}`, description: `Поймать находок: ${threshold}`, reward: 2, check: (state: import("./types.ts").GameState) => state.findsTapped >= threshold })),
  ...[1, 10, 50, 100].map((threshold) => ({ id: `order-${threshold}`, name: `Добрый сосед ${threshold}`, description: `Выполнить просьб: ${threshold}`, reward: 3, check: (state: import("./types.ts").GameState) => state.ordersCompleted >= threshold })),
  ...[60, 600, 3600, 14400].map((threshold, index) => ({ id: `road-${index + 1}`, name: `Время в пути ${index + 1}`, description: `Провести в игре ${threshold} секунд`, reward: 2 + index, check: (state: import("./types.ts").GameState) => state.totalPlaySeconds >= threshold })),
];
