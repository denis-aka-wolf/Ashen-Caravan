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
import {
  getPrestigeBlueprintGain,
  getZoneTransitionProgress,
} from "../core/progression.ts";
import type { GameState } from "../core/types.ts";
import type { LeaderboardEntry } from "../platform/types.ts";

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
  zoneMap: HTMLElement;
  routeProgressLabel: HTMLElement;
  routeProgressValue: HTMLElement;
  advanceZoneButton: HTMLButtonElement;
  airshipButton: HTMLButtonElement;
  tabButtons: HTMLButtonElement[];
}

export interface PlatformUiState {
  available: boolean;
  rewardedAdsAvailable: boolean;
  cloudEnabled: boolean;
  leaderboardEntries: LeaderboardEntry[] | null;
  leaderboardName: string;
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
    zoneMap: requireElement("#zone-map"),
    routeProgressLabel: requireElement("#route-progress-label"),
    routeProgressValue: requireElement("#route-progress-value"),
    advanceZoneButton: requireElement("#advance-zone") as HTMLButtonElement,
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
  platform: PlatformUiState = {
    available: false,
    rewardedAdsAvailable: false,
    cloudEnabled: false,
    leaderboardEntries: null,
    leaderboardName: "best_navigators",
  },
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
  renderZoneJourney(elements, state);

  for (const button of elements.tabButtons) {
    button.classList.toggle("is-active", button.dataset.tab === activeTab);
  }
  elements.tabView.innerHTML = renderTab(state, now, platform);
  renderFindingTargets(elements.findingLayer, state);
}

function renderTab(state: GameState, now: Date, platform: PlatformUiState): string {
  switch (activeTab) {
    case "route":
      return renderRouteTab(state);
    case "upgrades":
      return renderUpgradesTab(state);
    case "orders":
      return renderOrdersTab(state, platform);
    case "workshop":
      return renderWorkshopTab(state);
    case "rewards":
      return renderRewardsTab(state, now, platform);
    case "leaderboard":
      return renderLeaderboardTab(state, platform);
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
      <div class="section-heading"><h3>Новый перегон</h3><span>Награда: +${prestigeGain} ЧР</span></div>
      <p class="tier-meta">ЧР — Чертежи, постоянная валюта для талантов. Сейчас в запасе: ${formatNumber(state.blueprints)}. Награда за этот перегон начислится только после нажатия кнопки. Сбросятся лом, техника, улучшения и открытые зоны; Чертежи, таланты, жетоны, достижения и записи радио сохранятся.</p>
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

function renderOrdersTab(
  state: GameState,
  platform: PlatformUiState,
): string {
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
              ${platform.rewardedAdsAvailable ? `<button class="button button-small" type="button" data-action="skip-request-ad" data-id="${request.id}">Смотреть рекламу: пропустить и получить ${request.rewardTokens} жет.</button>` : ""}
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

function renderRewardsTab(
  state: GameState,
  now: Date,
  platform: PlatformUiState,
): string {
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
      <div class="mode-row">
        <button class="buy-button" type="button" data-action="daily" ${todayClaimed ? "disabled" : ""}>${todayClaimed ? "До завтра" : "Забрать подарок"}</button>
        ${platform.rewardedAdsAvailable ? `<button class="buy-button" type="button" data-action="daily-x2" ${todayClaimed ? "disabled" : ""}>Смотреть рекламу: ×2 награда</button>` : ""}
      </div>
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

function renderLeaderboardTab(
  state: GameState,
  platform: PlatformUiState,
): string {
  const entries = platform.leaderboardEntries?.map((entry) => `
    <div class="leaderboard-row">
      <strong>${entry.rank}. ${escapeHtml(entry.publicName || "Навигатор")}</strong>
      <strong>${formatNumber(entry.score)} ЧР</strong>
    </div>
  `).join("");
  const integrationControls = platform.available
    ? `
      <div class="mode-row">
        <button class="buy-button" type="button" data-action="cloud-sync">${platform.cloudEnabled ? "Синхронизировать облако" : "Подключить облачное сохранение"}</button>
        <button class="buy-button" type="button" data-action="leaderboard-refresh">Обновить общий топ</button>
        <button class="buy-button" type="button" data-action="leaderboard-submit">Войти и отправить результат</button>
      </div>
    `
    : `<p class="notice">SDK Яндекс Игр не найден. Локальная игра и сохранение работают без сети.</p>`;
  return `
    <div class="section-heading"><h2>Лучшие навигаторы</h2><span>Всего Чертежей</span></div>
    <p class="tier-meta">Таблица: ${escapeHtml(platform.leaderboardName)}</p>
    <div class="leaderboard-row"><strong>Вы · этот браузер</strong><strong>${formatNumber(state.blueprintsTotal)} ЧР</strong></div>
    ${entries ?? ""}
    ${integrationControls}
  `;
}

function renderZoneJourney(elements: GameUiElements, state: GameState): void {
  const route = getZoneTransitionProgress(state);
  const percentage = Math.floor(route.progress * 100);
  const unlockedCount = ZONE_CONFIG.filter((zone) =>
    state.unlockedZones.includes(zone.id),
  ).length;
  const signature = state.unlockedZones.join(",");
  if (elements.zoneMap.dataset.signature !== signature) {
    elements.zoneMap.innerHTML = ZONE_CONFIG.map((zone, index) => {
      const connector = index > 0
        ? `<div class="zone-connector" data-connector="${index}" aria-hidden="true"><span></span></div>`
        : "";
      return `${connector}<button class="zone-stop" type="button" data-zone="${zone.id}"><span class="zone-stop-number">${index + 1}</span><strong class="zone-stop-name">${zone.name}</strong><span class="zone-stop-state"></span></button>`;
    }).join("");
    elements.zoneMap.dataset.signature = signature;
  }
  for (const [index, zone] of ZONE_CONFIG.entries()) {
    const stop = elements.zoneMap.querySelector<HTMLButtonElement>(
      `[data-zone="${zone.id}"]`,
    );
    if (!stop) {
      throw new Error(`Missing route stop for zone ${zone.id}.`);
    }
    const isUnlocked = state.unlockedZones.includes(zone.id);
    const isCurrent = state.activeZoneId === zone.id;
    const isNext = index === unlockedCount;
    stop.disabled = !isUnlocked;
    stop.classList.toggle("is-current", isCurrent);
    stop.classList.toggle("is-visited", isUnlocked && !isCurrent);
    stop.classList.toggle("is-next", isNext);
    stop.setAttribute("aria-current", isCurrent ? "step" : "false");
    stop.setAttribute(
      "aria-label",
      `${index + 1}. ${zone.name}: ${
        isCurrent ? "текущая зона" : isUnlocked ? "пройденная зона" : "закрыта"
      }`,
    );
    const status = stop.querySelector<HTMLElement>(".zone-stop-state");
    if (status) {
      status.textContent = isCurrent
        ? "Вы здесь"
        : isUnlocked
          ? "Пройдена"
          : isNext && route.canTransition
            ? "Доступна"
            : "Закрыта";
    }
    const connector = elements.zoneMap.querySelector<HTMLElement>(
      `[data-connector="${index}"]`,
    );
    if (connector) {
      const connectorProgress = index < unlockedCount
        ? 100
        : index === unlockedCount
          ? percentage
          : 0;
      connector.style.setProperty("--connector-progress", `${connectorProgress}%`);
      connector.classList.toggle("is-complete", connectorProgress >= 100);
      connector.classList.toggle("is-active", index === unlockedCount);
    }
  }
  if (!route.zone) {
    elements.routeProgressLabel.textContent = "Все зоны маршрута пройдены";
    elements.routeProgressValue.textContent = "100%";
    elements.advanceZoneButton.hidden = true;
    return;
  }
  elements.routeProgressLabel.textContent = `До зоны «${route.zone.name}»`;
  elements.routeProgressValue.textContent = route.canTransition
    ? "Переход открыт"
    : `${formatNumber(route.income)} / ${formatNumber(route.threshold)} лома/с`;
  elements.advanceZoneButton.hidden = !route.canTransition;
  elements.advanceZoneButton.textContent = `Продолжить путь: ${route.zone.name}`;
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
  canDoubleWithAd = false,
): void {
  if (creditedScrap <= 0) {
    return;
  }
  element.textContent = "";
  const text = document.createElement("span");
  text.textContent =
    `Пока караван стоял ${formatDuration(elapsedSeconds)}, он собрал ${formatNumber(creditedScrap)} лома.`;
  element.append(text);
  if (canDoubleWithAd) {
    const button = document.createElement("button");
    button.className = "buy-button";
    button.type = "button";
    button.dataset.action = "offline-double";
    button.textContent = "Смотреть рекламу: ×2 лом";
    element.append(button);
  }
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function requireElement<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required UI element not found: ${selector}`);
  }
  return element;
}
