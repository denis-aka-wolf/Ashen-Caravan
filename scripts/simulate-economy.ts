import { createGameState } from "../src/core/state.ts";
import { simulateEconomy } from "../src/core/simulation.ts";
import { getTotalIncome } from "../src/core/economy.ts";
import { calculateOfflineScrap } from "../src/core/offline.ts";
import { OFFLINE_CAP_SECONDS } from "../src/core/config.ts";

const hours = readNumericOption("--hours", 1);
const findTapInterval = readNumericOption("--tap-every", 10);
if (hours <= 0 || findTapInterval <= 0) {
  throw new RangeError("--hours and --tap-every must be greater than zero.");
}

const result = simulateEconomy(createGameState(0), {
  durationSeconds: hours * 3600,
  findTapIntervalSeconds: findTapInterval,
});

console.log(`Симуляция: ${hours} ч, находка собирается раз в ${findTapInterval} с`);
console.log("Цели прогрессии и маршрута:");
for (const milestone of result.milestones) {
  console.log(
    `- ${milestone.label}: ${formatDuration(milestone.elapsedSeconds)}, ` +
      `доход ${formatNumber(milestone.incomePerSecond)}/с, ` +
      `остаток ${formatNumber(milestone.scrap)} лома`,
  );
}

console.log("\nСостояние к концу симуляции:");
for (const tier of result.state.tiers) {
  console.log(`- Тир ${tier.id}: ${tier.owned}`);
}
console.log(`- Лом: ${formatNumber(result.state.scrap)}`);
console.log(`- Доход: ${formatNumber(getTotalIncome(result.state))}/с`);

const offlineSeconds = OFFLINE_CAP_SECONDS;
console.log(
  `- Офлайн за 4 ч: ${formatNumber(calculateOfflineScrap(getTotalIncome(result.state), offlineSeconds))} лома`,
);

function readNumericOption(name: string, defaultValue: number): number {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return defaultValue;
  }
  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value)) {
    throw new TypeError(`Expected a numeric value after ${name}.`);
  }
  return value;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
  }).format(value);
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}
