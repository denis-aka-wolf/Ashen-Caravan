import { getMilestoneMultiplier, getTierCost, getTierIncome, getTotalIncome, isTierUnlocked } from "../core/economy.ts";
import { TIER_CONFIG } from "../core/config.ts";
import type { GameState } from "../core/types.ts";

export interface GameUiElements {
  scrapValue: HTMLElement;
  incomeValue: HTMLElement;
  tierList: HTMLElement;
  findsHint: HTMLElement;
  offlineNotice: HTMLElement;
  findingLayer: HTMLElement;
}

const findingTargets = new Map<number, HTMLButtonElement>();

export function getGameUiElements(): GameUiElements {
  return {
    scrapValue: requireElement("#scrap-value"),
    incomeValue: requireElement("#income-value"),
    tierList: requireElement("#tier-list"),
    findsHint: requireElement("#finds-hint"),
    offlineNotice: requireElement("#offline-notice"),
    findingLayer: requireElement("#finding-layer"),
  };
}

export function renderGameUi(elements: GameUiElements, state: GameState): void {
  elements.scrapValue.textContent = formatNumber(state.scrap);
  elements.incomeValue.textContent = `${formatNumber(getTotalIncome(state))} / с`;
  elements.findsHint.textContent =
    state.findBoostUntilSeconds > state.clockSeconds
      ? `Золотая жила · ${state.finds.length} находки`
      : `Находки: ${state.finds.length} · серия ${state.findComboCount}/5`;

  if (elements.tierList.childElementCount === 0) {
    elements.tierList.innerHTML = TIER_CONFIG.map((config) => `
      <article class="tier-card ${config.id === 1 ? "" : "is-locked"}" data-tier-card="${config.id}">
        <div>
          <div class="tier-title-row">
            <strong>${config.id}. ${config.name}</strong>
          </div>
          <div class="tier-meta" data-tier-summary="${config.id}"></div>
        </div>
        <div class="tier-details">
          <span class="tier-meta" data-tier-cost="${config.id}"></span>
          <button
            class="buy-button"
            type="button"
            data-tier="${config.id}"
          >Купить</button>
        </div>
      </article>
    `).join("");
  }

  for (const config of TIER_CONFIG) {
    const tier = state.tiers.find((entry) => entry.id === config.id);
    if (!tier) {
      throw new Error(`Missing state for tier ${config.id}.`);
    }

    const unlocked = isTierUnlocked(state, config.id);
    const cost = getTierCost(config.id, tier.owned);
    const income = getTierIncome(config.id, tier.owned);
    const milestone = getMilestoneMultiplier(tier.owned);
    const requirement =
      config.id > 1
        ? `Откроется после ${config.requiredPreviousOwned} шт. предыдущего тира`
        : "Первый тир";
    const card = elements.tierList.querySelector<HTMLElement>(`[data-tier-card="${config.id}"]`);
    const summary = elements.tierList.querySelector<HTMLElement>(`[data-tier-summary="${config.id}"]`);
    const costLabel = elements.tierList.querySelector<HTMLElement>(`[data-tier-cost="${config.id}"]`);
    const buyButton = elements.tierList.querySelector<HTMLButtonElement>(`button[data-tier="${config.id}"]`);
    if (!card || !summary || !costLabel || !buyButton) {
      throw new Error(`Missing UI elements for tier ${config.id}.`);
    }

    card.classList.toggle("is-locked", !unlocked);
    summary.textContent = unlocked
      ? `В караване: ${tier.owned} · Доход: ${formatNumber(income)}/с · Бонус вех: ×${milestone}`
      : requirement;
    costLabel.textContent = `Цена ${formatNumber(cost)}`;
    buyButton.disabled = !unlocked || state.scrap < cost;
  }

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
      elements.findingLayer.append(button);
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

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Required UI element not found: ${selector}`);
  }
  return element;
}
