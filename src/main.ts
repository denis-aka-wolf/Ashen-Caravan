import Phaser from "phaser";
import "./style.css";
import {
  buyTier,
  getTotalIncome,
} from "./core/economy.ts";
import { applyOfflineEarnings } from "./core/offline.ts";
import { loadGame, resetGame, saveGame } from "./core/save.ts";
import { tickGame, tapFinding } from "./core/state.ts";
import { RouteScene } from "./scene/route-scene.ts";
import {
  getGameUiElements,
  renderGameUi,
  showOfflineNotice,
} from "./ui/game-ui.ts";
import type { GameState } from "./core/types.ts";

const errorElement = document.querySelector<HTMLElement>("#game-error");

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

  document.querySelector<HTMLElement>("#tier-list")?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>("button[data-tier]");
    if (!button || button.disabled) {
      return;
    }
    const tierId = Number(button.dataset.tier);
    if (buyTier(state, tierId)) {
      saveGame(window.localStorage, state);
      renderGameUi(elements, state);
    }
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
      saveGame(window.localStorage, state);
      renderGameUi(elements, state);
    }
  });

  document.querySelector<HTMLButtonElement>("#reset-game")?.addEventListener("click", () => {
    if (!window.confirm("Сбросить весь локальный прогресс прототипа?")) {
      return;
    }
    state = resetGame(window.localStorage);
    renderGameUi(elements, state);
    routeScene.renderState(state);
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
    if (saveElapsedSeconds >= 10) {
      saveGame(window.localStorage, state);
      saveElapsedSeconds = 0;
    }

    renderGameUi(elements, state);
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
