import Phaser from "phaser";
import "./style.css";
import {
  buyTierBulk,
  buyUpgrade,
  getTotalIncome,
} from "./core/economy.ts";
import { applyOfflineEarnings } from "./core/offline.ts";
import {
  buyCosmetic,
  buyTalent,
  claimAirshipReward,
  claimDailyReward,
  claimRequest,
  setActiveZone,
  skipRequest,
  startNewRun,
  updateProgression,
} from "./core/progression.ts";
import { loadGame, resetGame, saveGame } from "./core/save.ts";
import { TIER_CONFIG, UPGRADE_CONFIG } from "./core/config.ts";
import { tickGame, tapFinding } from "./core/state.ts";
import { RouteScene } from "./scene/route-scene.ts";
import {
  getGameUiElements,
  renderGameUi,
  setActiveTab,
  showOfflineNotice,
} from "./ui/game-ui.ts";
import type { GameTab, GameUiElements } from "./ui/game-ui.ts";
import type { GameState } from "./core/types.ts";

const errorElement = document.querySelector<HTMLElement>("#game-error");
const actionNotice = document.querySelector<HTMLElement>("#action-notice");

function startGame(): void {
  const nowMs = Date.now();
  let state = loadGame(window.localStorage, nowMs);
  const offlineResult = applyOfflineEarnings(state, nowMs);
  const elements = getGameUiElements();
  const routeScene = new RouteScene();
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: "route-scene",
    backgroundColor: "#323a3b",
    scene: [routeScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: 900,
      height: 300,
    },
    render: {
      antialias: false,
      pixelArt: true,
    },
  });

  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab as GameTab | undefined;
      if (tab) {
        setActiveTab(tab);
        renderGameUi(elements, state);
      }
    });
  });

  elements.tabView.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>("button[data-action]");
    if (!button || button.disabled) {
      return;
    }
    const action = button.dataset.action;
    const id = button.dataset.id;
    let message: string | null = null;

    switch (action) {
      case "buy-tier": {
        const tierId = Number(id);
        const tier = state.tiers.find((entry) => entry.id === tierId);
        const quantity = state.buyMode === "max" ? "max" : state.buyMode;
        if (tier && buyTierBulk(state, tierId, quantity) > 0) {
          updateProgression(state);
        }
        break;
      }
      case "buy-mode": {
        const mode = button.dataset.mode;
        state.buyMode = mode === "max" ? "max" : Number(mode) as 1 | 10 | 100;
        break;
      }
      case "upgrade":
        if (id && buyUpgrade(state, id)) {
          message = UPGRADE_CONFIG.find((upgrade) => upgrade.id === id)?.name
            ? `Улучшение куплено: ${UPGRADE_CONFIG.find((upgrade) => upgrade.id === id)?.name}.`
            : "Улучшение куплено.";
        }
        break;
      case "prestige": {
        const confirmed = window.confirm(
          "Начать новый перегон? Лом, техника, улучшения и открытые зоны сбросятся.",
        );
        if (confirmed) {
          const result = startNewRun(state, Date.now());
          message = result.message;
        }
        break;
      }
      case "talent":
        if (id) {
          message = buyTalent(state, id).message;
        }
        break;
      case "claim-request":
        if (id) {
          message = claimRequest(state, Number(id)).message;
        }
        break;
      case "skip-request":
        if (id) {
          message = skipRequest(state, Number(id)).message;
        }
        break;
      case "daily":
        message = claimDailyReward(state).message;
        break;
      case "cosmetic":
        if (id) {
          message = buyCosmetic(state, id).message;
        }
        break;
    }

    if (message) {
      showActionNotice(actionNotice, message);
    }
    saveGame(window.localStorage, state);
    renderGameUi(elements, state);
    routeScene.renderState(state);
  });

  elements.findingLayer.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>("button[data-finding]");
    if (!button) {
      return;
    }
    const findingId = Number(button.dataset.finding);
    if (tapFinding(state, findingId) > 0) {
      updateProgression(state);
      saveGame(window.localStorage, state);
      renderGameUi(elements, state);
    }
  });

  elements.zoneSelect.addEventListener("change", () => {
    const result = setActiveZone(state, elements.zoneSelect.value);
    if (!result.success) {
      showActionNotice(actionNotice, result.message);
    }
    saveGame(window.localStorage, state);
    routeScene.renderState(state);
  });

  elements.airshipButton.addEventListener("click", () => {
    const result = claimAirshipReward(state);
    showActionNotice(actionNotice, result.message);
    updateProgression(state);
    saveGame(window.localStorage, state);
    renderGameUi(elements, state);
  });

  document.querySelector<HTMLButtonElement>("#reset-game")?.addEventListener("click", () => {
    if (!window.confirm("Сбросить весь локальный прогресс прототипа?")) {
      return;
    }
    state = resetGame(window.localStorage);
    renderGameUi(elements, state);
    routeScene.renderState(state);
  });

  document.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !event.repeat) {
      const finding = elements.findingLayer.querySelector<HTMLButtonElement>("button[data-finding]");
      if (finding) {
        event.preventDefault();
        finding.click();
      }
    }
    if (event.code.startsWith("Digit")) {
      const tabIndex = Number(event.code.slice(5)) - 1;
      const tab = elements.tabButtons[tabIndex];
      if (tab) {
        tab.click();
      }
    }
  });

  showOfflineNotice(
    elements.offlineNotice,
    offlineResult.elapsedSeconds,
    offlineResult.creditedScrap,
  );
  renderGameUi(elements, state);
  routeScene.renderState(state);
  saveGame(window.localStorage, state, nowMs);

  let previousFrameMs = performance.now();
  let accumulatedSeconds = 0;
  let saveElapsedSeconds = 0;
  let renderElapsedSeconds = 0;
  const fixedStepSeconds = 0.1;

  game.events.on("step", (time: number) => {
    const frameSeconds = Math.min((time - previousFrameMs) / 1000, 0.5);
    previousFrameMs = time;
    accumulatedSeconds += frameSeconds;

    while (accumulatedSeconds >= fixedStepSeconds) {
      tickGame(state, fixedStepSeconds);
      accumulatedSeconds -= fixedStepSeconds;
    }

    saveElapsedSeconds += frameSeconds;
    renderElapsedSeconds += frameSeconds;
    if (saveElapsedSeconds >= 10) {
      saveGame(window.localStorage, state);
      saveElapsedSeconds = 0;
    }
    if (renderElapsedSeconds >= 0.25) {
      renderGameUi(elements, state);
      renderElapsedSeconds = 0;
    }

    routeScene.renderState(state);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      saveGame(window.localStorage, state);
      return;
    }

    const result = applyOfflineEarnings(state, Date.now());
    showOfflineNotice(elements.offlineNotice, result.elapsedSeconds, result.creditedScrap);
    renderGameUi(elements, state);
    saveGame(window.localStorage, state);
  });
  window.addEventListener("pagehide", () => saveGame(window.localStorage, state));

  if (!Number.isFinite(getTotalIncome(state))) {
    throw new Error("The current game state has a non-finite income.");
  }
}

function showActionNotice(element: HTMLElement | null, message: string): void {
  if (!element) {
    return;
  }
  element.textContent = message;
  element.hidden = false;
  window.setTimeout(() => {
    element.hidden = true;
  }, 4_000);
}

try {
  startGame();
} catch (error) {
  if (errorElement) {
    errorElement.hidden = false;
    errorElement.textContent =
      error instanceof Error
        ? `Не удалось запустить игру: ${error.message}`
        : "Не удалось запустить игру из-за неизвестной ошибки.";
  }
  console.error("Failed to start Ashen Caravan prototype.", error);
}
