import {
  ACHIEVEMENT_CONFIG,
  COSMETIC_CONFIG,
  DAILY_REWARDS,
  RADIO_RECORDS,
  TALENT_CONFIG,
  TIER_CONFIG,
  UPGRADE_CONFIG,
  ZONE_CONFIG,
} from "../core/config.ts";
import {
  getAffordableTierQuantity,
  getBulkTierCost,
  getFindPower,
  getMilestoneMultiplier,
  getOfflineSettings,
  getTierCost,
  getTierIncome,
  getTotalIncome,
  isTierUnlocked,
} from "../core/economy.ts";
import { getPrestigeBlueprintGain } from "../core/progression.ts";
import type { GameState } from "../core/types.ts";

export type GameTab =
  | "route"
  | "upgrades"
  | "orders"
  | "workshop"
  | "rewards"
  | "leaderboard";

export interface GameUiElements {
  scrapValue: HTMLElement;
  incomeValue: HTMLElement;
  blueprintValue: HTMLElement;
  tokenValue: HTMLElement;
  tabView: HTMLElement;
  findsHint: HTMLElement;
  offlineNotice: HTMLElement;
  findingLayer: HTMLElement;
  zoneSelect: HTMLSelectElement;
  airshipButton: HTMLButtonElement;
  tabButtons: HTMLButtonElement[];
}

let activeTab: GameTab = "route";
const findingTargets = new Map<number, HTMLButtonElement>();

export function getGameUiElements(): GameUiElements {
  return {
    scrapValue: requireElement("#scrap-value"),
    incomeValue: requireElement("#income-value"),
    blueprintValue: requireElement("#blueprint-value"),
    tokenValue: requireElement("#token-value"),
    tabView: requireElement("#tab-view"),
    findsHint: requireElement("#finds-hint"),
    offlineNotice: requireElement("#offline-notice"),
    findingLayer: requireElement("#finding-layer"),
    zoneSelect: requireElement("#zone-select") as HTMLSelectElement,
    airshipButton: requireElement("#airship-button") as HTMLButtonElement,
    tabButtons: Array.from(document.querySelectorAll<HTMLButtonElement>("#game-tabs [data-tab]")),
  };
}

export function setActiveTab(tab: GameTab): void {
  activeTab = tab;
}

export function renderGameUi(
  elements: GameUiElements,
  state: GameState,
  now = new Date(),
): void {
  elements.scrapValue.textContent = formatNumber(state.scrap);
  elements.incomeValue.textContent = `${formatNumber(getTotalIncome(state))} / с`;
  elements.blueprintValue.textContent = formatNumber(state.blueprints);
  elements.tokenValue.textContent = formatNumber(state.tokens);
  elements.findsHint.textContent =
    state.findBoostUntilSeconds > state.clockSeconds
      ? `Золотая жила · ${state.finds.length} находки`
      : `Находки: ${state.finds.length} · серия ${state.findComboCount}/5`;
  elements.airshipButton.hidden =
    state.airshipExpiresAtSeconds <= state.clockSeconds ||
    state.airshipExpiresAtSeconds === 0;
  renderZones(elements.zoneSelect, state);

  for (const button of elements.tabButtons) {
    button.classList.toggle("is-active", button.dataset.tab === activeTab);
  }
  elements.tabView.innerHTML = renderTab(state, now);
  renderFindingTargets(elements.findingLayer, state);
}

function renderTab(state: GameState, now: Date): string {
  switch (activeTab) {
    case "route":
      return renderRouteTab(state);
    case "upgrades":
      return renderUpgradesTab(state);
    case "orders":
      return renderOrdersTab(state);
    case "workshop":
      return renderWorkshopTab(state);
    case "rewards":
      return renderRewardsTab(state, now);
    case "leaderboard":
      return renderLeaderboardTab(state);
  }
}

function renderRouteTab(state: GameState): string {
  const tierCards = TIER_CONFIG.map((config) => {
    const tier = state.tiers.find((entry) => entry.id === config.id);
    if (!tier) {
      throw new Error(`Missing state for tier ${config.id}.`);
    }
    const unlocked = isTierUnlocked(state, config.id);
    const cost = getTierCost(config.id, tier.owned);
    const discount = Math.min(0.25, (state.talentLevels["logistics-discount"] ?? 0) * 0.05);
    const purchaseQuantity = state.buyMode === "max"
      ? getAffordableTierQuantity(config.id, tier.owned, state.scrap, discount)
      : state.buyMode;
    const purchaseCost = purchaseQuantity > 0
      ? getBulkTierCost(config.id, tier.owned, purchaseQuantity, discount)
      : cost;
    const nextTier = TIER_CONFIG[config.id - 2];
    const unlockText = !state.unlockedZones.includes(config.zoneId)
      ? `Зона: ${ZONE_CONFIG.find((zone) => zone.id === config.zoneId)?.name ?? config.zoneId}`
      : nextTier
        ? `Откроется после ${config.requiredPreviousOwned} шт. предыдущего тира`
        : "Первый тир";

    return `
      <article class="tier-card ${unlocked ? "" : "is-locked"}">
        <div>
          <div class="tier-title-row"><strong>${config.id}. ${config.name}</strong></div>
          <div class="tier-meta">
            ${unlocked
              ? `В караване: ${tier.owned} · Доход: ${formatNumber(getTierIncome(config.id, tier.owned, state.purchasedUpgradeIds))}/с · Веха ×${getMilestoneMultiplier(tier.owned)}`
              : unlockText}
          </div>
        </div>
        <div class="tier-details">
          <span class="tier-meta">${purchaseQuantity > 1 ? `${purchaseQuantity} шт. · ` : ""}Цена ${formatNumber(purchaseCost)}</span>
          <button class="buy-button" type="button" data-action="buy-tier" data-id="${config.id}" ${!unlocked || purchaseQuantity === 0 || state.scrap < purchaseCost ? "disabled" : ""}>Купить</button>
        </div>
      </article>
    `;
  }).join("");

  const prestigeGain = getPrestigeBlueprintGain(state);
  const offline = getOfflineSettings(state);
  return `
    <div class="section-heading"><h2>Экипажи и техника</h2><span>Зона: ${currentZoneName(state)}</span></div>
    <div class="mode-row">
      <span class="label">Покупка</span>
      ${([1, 10, 100, "max"] as const).map((mode) => `
        <button class="button button-small ${state.buyMode === mode ? "is-selected" : ""}" type="button" data-action="buy-mode" data-mode="${mode}">${mode === "max" ? "Макс." : `×${mode}`}</button>
      `).join("")}
    </div>
    <div class="tier-list">${tierCards}</div>
    <div class="system-card prestige-card">
      <div class="section-heading"><h3>Новый перегон</h3><span>${prestigeGain} ЧР сейчас</span></div>
      <p class="tier-meta">Требуется не меньше 5 ЧР. Сбросится лом, техника, улучшения и открытые зоны. Сохранятся Чертежи, таланты, жетоны, достижения и записи радио.</p>
      <button class="buy-button" type="button" data-action="prestige" ${prestigeGain < 5 ? "disabled" : ""}>Начать новый перегон</button>
    </div>
    <p class="tier-meta">Офлайн: ${Math.round(offline.efficiency * 100)}% · лимит ${offline.capSeconds / 3600} ч</p>
  `;
}

function renderUpgradesTab(state: GameState): string {
  const groups = [
    ["Улучшения техники", "tier"],
    ["Общие улучшения", "global"],
    ["Находки", "find"],
    ["Стоянка и офлайн", "offline"],
  ] as const;
  return groups.map(([title, category]) => {
    const upgrades = UPGRADE_CONFIG.filter((upgrade) => upgrade.category === category);
    return `
      <section class="system-section">
        <div class="section-heading"><h2>${title}</h2><span>${upgrades.filter((upgrade) => state.purchasedUpgradeIds.includes(upgrade.id)).length}/${upgrades.length}</span></div>
        <div class="system-list">
          ${upgrades.map((upgrade) => {
            const purchased = state.purchasedUpgradeIds.includes(upgrade.id);
            const tier = upgrade.tierId ? state.tiers.find((entry) => entry.id === upgrade.tierId) : undefined;
            const available =
              (!upgrade.tierId || isTierUnlocked(state, upgrade.tierId)) &&
              (!tier || tier.owned >= (upgrade.requiredOwned ?? 0));
            return `
              <article class="system-card">
                <div><strong>${upgrade.name}</strong><p class="tier-meta">${upgrade.description}${upgrade.requiredOwned ? ` · Требуется ${upgrade.requiredOwned} шт.` : ""}</p></div>
                <button class="buy-button" type="button" data-action="upgrade" data-id="${upgrade.id}" ${purchased || !available || state.scrap < upgrade.cost ? "disabled" : ""}>${purchased ? "Куплено" : `${formatNumber(upgrade.cost)} лома`}</button>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }).join("");
}

function renderOrdersTab(state: GameState): string {
  const timeLeft = Math.max(0, state.nextOrderRefreshAtSeconds - state.clockSeconds);
  return `
    <div class="section-heading"><h2>Просьбы попутчиков</h2><span>Обновление через ${formatDuration(timeLeft)}</span></div>
    <p class="tier-meta">Гвоздь и тётя Роза просят о помощи. Выполненные просьбы дают жетоны и лом; пропуск стоит 1 жетон.</p>
    <div class="system-list">
      ${state.requests.map((request) => {
        const done = request.progress >= request.target;
        const title = request.kind === "scrap"
          ? `Собрать лом: ${formatNumber(request.target)}`
          : request.kind === "find"
            ? `Поймать находки: ${request.target}`
            : `Купить технику тира ${request.tierId}: ${request.target}`;
        return `
          <article class="system-card">
            <div class="system-copy"><strong>${title}</strong><p class="tier-meta">Прогресс: ${formatNumber(Math.min(request.progress, request.target))}/${formatNumber(request.target)} · Награда: ${request.rewardTokens} жет. + ${formatNumber(request.rewardScrap)} лома</p>
              <progress max="${request.target}" value="${Math.min(request.progress, request.target)}"></progress></div>
            <div class="button-stack">
              <button class="buy-button" type="button" data-action="claim-request" data-id="${request.id}" ${done ? "" : "disabled"}>Забрать</button>
              <button class="button button-small" type="button" data-action="skip-request" data-id="${request.id}" ${state.tokens < 1 ? "disabled" : ""}>Пропустить · 1 жетон</button>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderWorkshopTab(state: GameState): string {
  const talents = TALENT_CONFIG.map((talent) => {
    const level = state.talentLevels[talent.id] ?? 0;
    const cost = talent.baseCost * 2 ** level;
    return `
      <article class="system-card">
        <div><strong>${talent.branch}: ${talent.name} · ${level}/${talent.maxLevel}</strong><p class="tier-meta">${talent.description}</p></div>
        <button class="buy-button" type="button" data-action="talent" data-id="${talent.id}" ${level >= talent.maxLevel || state.blueprints < cost ? "disabled" : ""}>${level >= talent.maxLevel ? "Максимум" : `${cost} ЧР`}</button>
      </article>
    `;
  }).join("");
  return `
    <div class="section-heading"><h2>Мастерская чертежей</h2><span>${state.blueprints} ЧР</span></div>
    ${state.prestigeCount === 0 ? `<p class="notice">Таланты откроются после первого «Нового перегона».</p>` : ""}
    <div class="system-list ${state.prestigeCount === 0 ? "is-locked" : ""}">${talents}</div>
  `;
}

function renderRewardsTab(state: GameState, now: Date): string {
  const todayClaimed = state.dailyLastClaimDay === now.toISOString().slice(0, 10);
  const dailyIndex = todayClaimed
    ? state.dailyStreak
    : state.dailyLastClaimDay
      ? (state.dailyStreak + 1) % DAILY_REWARDS.length
      : 0;
  const daily = DAILY_REWARDS[dailyIndex];
  const achievements = ACHIEVEMENT_CONFIG.map((achievement) => {
    const complete = state.completedAchievementIds.includes(achievement.id);
    return `<article class="system-card compact-card ${complete ? "is-complete" : ""}"><div><strong>${achievement.name}</strong><p class="tier-meta">${achievement.description}</p></div><span class="tier-meta">${complete ? "Получено" : `+${achievement.reward} жет.`}</span></article>`;
  }).join("");
  const cosmetics = COSMETIC_CONFIG.map((cosmetic) => {
    const owned = state.cosmeticOwnedIds.includes(cosmetic.id);
    const selected = state.selectedCosmeticId === cosmetic.id;
    return `
      <article class="system-card compact-card">
        <div><strong>${cosmetic.name}</strong><p class="tier-meta">${cosmetic.cost} жетонов</p></div>
        <button class="buy-button" type="button" data-action="cosmetic" data-id="${cosmetic.id}" ${!owned && state.tokens < cosmetic.cost ? "disabled" : ""}>${selected ? "Выбрано" : owned ? "Выбрать" : "Получить"}</button>
      </article>
    `;
  }).join("");
  const zoneRadioRecords = RADIO_RECORDS
    .filter((record) => state.radioRecordIds.includes(record.id))
    .map((record) => `<article class="system-card compact-card"><strong>Радио · ${currentZoneNameById(record.zoneId)}</strong><p class="tier-meta">${record.text}</p></article>`)
    .join("");
  const prestigeRadioRecords = state.radioRecordIds
    .filter((id) => id.startsWith("radio-prestige-"))
    .map((id) => {
      const run = Number(id.replace("radio-prestige-", ""));
      return `<article class="system-card compact-card"><strong>Радио · перегон ${run}</strong><p class="tier-meta">Шум стихает… Сигнал всё ещё ведёт к берегу. Караван снова готов в путь.</p></article>`;
    })
    .join("");
  const radioRecords = zoneRadioRecords + prestigeRadioRecords;

  return `
    <section class="system-section">
      <div class="section-heading"><h2>Ежедневный бонус · ${dailyIndex + 1}/7</h2><span>${todayClaimed ? "Получен сегодня" : "Тётя Роза приготовила подарок"}</span></div>
      <p class="tier-meta">Награда: ${daily.scrapIncomeMinutes} мин дохода, ${daily.tokens} жетонов${daily.airship ? " и дирижабль" : ""}.</p>
      <button class="buy-button" type="button" data-action="daily" ${todayClaimed ? "disabled" : ""}>${todayClaimed ? "До завтра" : "Забрать подарок"}</button>
    </section>
    <section class="system-section">
      <div class="section-heading"><h2>Достижения</h2><span>${state.completedAchievementIds.length}/${ACHIEVEMENT_CONFIG.length}</span></div>
      <div class="system-list">${achievements}</div>
    </section>
    <section class="system-section">
      <div class="section-heading"><h2>Косметика каравана</h2><span>${state.cosmeticOwnedIds.length}/${COSMETIC_CONFIG.length}</span></div>
      <div class="system-list">${cosmetics}</div>
    </section>
    <section class="system-section">
      <div class="section-heading"><h2>Радио-журнал</h2><span>${state.radioRecordIds.length} записей</span></div>
      <div class="system-list">${radioRecords || `<p class="tier-meta">Пока эфир молчит.</p>`}</div>
    </section>
  `;
}

function renderLeaderboardTab(state: GameState): string {
  return `
    <div class="section-heading"><h2>Лучшие навигаторы</h2><span>Всего Чертежей</span></div>
    <p class="notice">Демонстрационный локальный экран. Для глобальной таблицы нужен подключённый SDK Яндекс Игр и авторизация игрока.</p>
    <div class="leaderboard-row"><strong>Вы · этот браузер</strong><strong>${formatNumber(state.blueprintsTotal)} ЧР</strong></div>
    <p class="tier-meta">После подключения платформы эта панель будет показывать общую таблицу лидеров.</p>
  `;
}

function renderZones(select: HTMLSelectElement, state: GameState): void {
  const currentOptions = ZONE_CONFIG.filter((zone) => state.unlockedZones.includes(zone.id));
  const signature = currentOptions.map((zone) => zone.id).join(",");
  if (select.dataset.options !== signature) {
    select.innerHTML = currentOptions
      .map((zone) => `<option value="${zone.id}">${zone.name}</option>`)
      .join("");
    select.dataset.options = signature;
  }
  select.value = state.activeZoneId;
}

function renderFindingTargets(layer: HTMLElement, state: GameState): void {
  const activeFindIds = new Set(state.finds.map((finding) => finding.id));
  for (const [findingId, button] of findingTargets) {
    if (!activeFindIds.has(findingId)) {
      button.remove();
      findingTargets.delete(findingId);
    }
  }
  for (const finding of state.finds) {
    let button = findingTargets.get(finding.id);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "finding-target";
      button.dataset.finding = String(finding.id);
      button.setAttribute("aria-label", "Подобрать находку");
      layer.append(button);
      findingTargets.set(finding.id, button);
    }
    button.style.left = `${finding.x * 100}%`;
    button.style.top = `${finding.y * 100}%`;
  }
}

export function showOfflineNotice(
  element: HTMLElement,
  elapsedSeconds: number,
  creditedScrap: number,
): void {
  if (creditedScrap <= 0) {
    return;
  }
  element.textContent =
    `Пока караван стоял ${formatDuration(elapsedSeconds)}, он собрал ${formatNumber(creditedScrap)} лома.`;
  element.hidden = false;
}

export function formatNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return new Intl.NumberFormat("ru-RU", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: value < 10 ? 2 : 0,
  }).format(value);
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} ч ${minutes} мин`;
  }
  return `${minutes} мин`;
}

function currentZoneName(state: GameState): string {
  return currentZoneNameById(state.activeZoneId);
}

function currentZoneNameById(zoneId: string): string {
  return ZONE_CONFIG.find((zone) => zone.id === zoneId)?.name ?? zoneId;
}

function requireElement<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required UI element not found: ${selector}`);
  }
  return element;
}
