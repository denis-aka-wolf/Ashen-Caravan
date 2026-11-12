import Phaser from "phaser";
import "./style.css";
import {
  addScrap,
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
  skipRequestWithReward,
  setActiveZone,
  skipRequest,
  startNewRun,
  transitionToNextZone,
  updateProgression,
} from "./core/progression.ts";
import { loadGame, resetGame, saveGame } from "./core/save.ts";
import type { SaveStorage } from "./core/save.ts";
import { SAVE_KEY, TIER_CONFIG, UPGRADE_CONFIG } from "./core/config.ts";
import {
  applyRemoteGameConfig,
  getDefaultRemoteFlags,
} from "./core/runtime-config.ts";
import { tickGame, tapFinding } from "./core/state.ts";
import { RouteScene } from "./scene/route-scene.ts";
import { connectYandexGames } from "./platform/yandex-games.ts";
import type { GamePlatform } from "./platform/types.ts";
import {
  getGameUiElements,
  renderGameUi,
  setActiveTab,
  showOfflineNotice,
} from "./ui/game-ui.ts";
import type {
  GameTab,
  GameUiElements,
  PlatformUiState,
} from "./ui/game-ui.ts";
import type { GameState } from "./core/types.ts";

const errorElement = document.querySelector<HTMLElement>("#game-error");
const actionNotice = document.querySelector<HTMLElement>("#action-notice");
const leaderboardName =
  import.meta.env.VITE_YANDEX_LEADERBOARD_NAME?.trim() || "best_navigators";

async function startGame(): Promise<void> {
  let platform: GamePlatform | null = null;
  try {
    platform = await connectYandexGames();
  } catch (error) {
    console.error("Yandex Games SDK initialization failed; using local mode.", error);
  }

  const flagResult = platform
    ? await platform.getRemoteFlags(getDefaultRemoteFlags()).catch((error) => {
        console.error("Failed to load remote game configuration; using defaults.", error);
        return getDefaultRemoteFlags();
      })
    : getDefaultRemoteFlags();
  const configResult = applyRemoteGameConfig(flagResult);
  if (configResult.rejectedFlags.length > 0) {
    console.error(
      "Rejected invalid or incompatible remote game flags.",
      configResult.rejectedFlags,
    );
  }

  const currentTime = () => platform?.getServerTime() ?? Date.now();
  const nowMs = currentTime();
  let state = loadGame(window.localStorage, nowMs);
  const offlineResult = applyOfflineEarnings(state, nowMs);
  let pendingOfflineReward = offlineResult.creditedScrap;
  let pendingOfflineElapsedSeconds = offlineResult.elapsedSeconds;
  const elements = getGameUiElements();
  const platformUi: PlatformUiState = {
    available: platform !== null,
    rewardedAdsAvailable: platform?.rewardedAdsAvailable ?? false,
    cloudEnabled: false,
    leaderboardEntries: null,
    leaderboardName,
  };
  const render = () => {
    renderGameUi(elements, state, new Date(currentTime()), platformUi);
  };
  let pointerDownInTabView = false;
  let deferredTabRender = false;
  elements.tabView.addEventListener("pointerdown", () => {
    pointerDownInTabView = true;
  });
  document.addEventListener("pointerup", () => {
    if (!pointerDownInTabView) {
      return;
    }
    pointerDownInTabView = false;
    if (deferredTabRender) {
      window.setTimeout(() => {
        if (!pointerDownInTabView && deferredTabRender) {
          deferredTabRender = false;
          render();
        }
      }, 50);
    }
  });
  document.addEventListener("pointercancel", () => {
    pointerDownInTabView = false;
    if (deferredTabRender) {
      deferredTabRender = false;
      render();
    }
  });
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
        render();
      }
    });
  });

  elements.tabView.addEventListener("click", async (event) => {
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
          const result = startNewRun(state, currentTime());
          message = result.message;
          if (result.success && platform?.fullscreenAdsAvailable) {
            pauseGameplayForAd();
            try {
              await platform.showFullscreenAd();
            } catch (error) {
              console.error("Prestige interstitial failed.", error);
              message += ` Не удалось показать рекламу: ${getErrorMessage(error)}`;
            } finally {
              resumeGameplayAfterAd();
            }
          }
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
          const result = claimRequest(state, Number(id));
          message = result.message;
          if (result.success && platform?.fullscreenAdsAvailable) {
            pauseGameplayForAd();
            try {
              await platform.showFullscreenAd();
            } catch (error) {
              console.error("Request completion interstitial failed.", error);
              message += ` Не удалось показать рекламу: ${getErrorMessage(error)}`;
            } finally {
              resumeGameplayAfterAd();
            }
          }
        }
        break;
      case "skip-request":
        if (id) {
          message = skipRequest(state, Number(id)).message;
        }
        break;
      case "skip-request-ad":
        if (id && platform) {
          button.disabled = true;
          pauseGameplayForAd();
          try {
            if (await platform.showRewardedVideo()) {
              message = skipRequestWithReward(state, Number(id)).message;
            } else {
              button.disabled = false;
              message = "Реклама закрыта до получения награды.";
            }
          } catch (error) {
            button.disabled = false;
            console.error("Request skip video failed.", error);
            message = `Не удалось показать рекламу: ${getErrorMessage(error)}`;
          } finally {
            resumeGameplayAfterAd();
          }
        }
        break;
      case "daily":
        message = claimDailyReward(state, new Date(currentTime())).message;
        break;
      case "daily-x2":
        if (platform) {
          button.disabled = true;
          pauseGameplayForAd();
          try {
            if (await platform.showRewardedVideo()) {
              message = claimDailyReward(state, new Date(currentTime()), 2).message;
            } else {
              button.disabled = false;
              message = "Реклама закрыта до получения награды.";
            }
          } catch (error) {
            button.disabled = false;
            console.error("Daily reward video failed.", error);
            message = `Не удалось показать рекламу: ${getErrorMessage(error)}`;
          } finally {
            resumeGameplayAfterAd();
          }
        }
        break;
      case "cosmetic":
        if (id) {
          message = buyCosmetic(state, id).message;
        }
        break;
      case "cloud-sync":
        if (platform) {
          button.disabled = true;
          try {
            if (await platform.authorizePlayer()) {
              state = await synchronizeCloudSave(platform, state, currentTime());
              platformUi.cloudEnabled = true;
              message = "Облачное сохранение синхронизировано.";
            } else {
              message = "Облачное сохранение не подключено: вход отменён.";
            }
          } catch (error) {
            console.error("Cloud save synchronization failed.", error);
            message = `Ошибка облачной синхронизации: ${getErrorMessage(error)}`;
          }
        }
        break;
      case "leaderboard-refresh":
        if (platform) {
          button.disabled = true;
          try {
            platformUi.leaderboardEntries =
              await platform.getLeaderboardEntries(leaderboardName);
            message = "Общий лидерборд обновлён.";
          } catch (error) {
            console.error("Failed to load the Yandex Games leaderboard.", error);
            message = `Не удалось загрузить лидерборд: ${getErrorMessage(error)}`;
          }
        }
        break;
      case "leaderboard-submit":
        if (platform) {
          button.disabled = true;
          try {
            if (await platform.authorizePlayer()) {
              await platform.submitLeaderboardScore(
                leaderboardName,
                state.blueprintsTotal,
              );
              platformUi.leaderboardEntries =
                await platform.getLeaderboardEntries(leaderboardName);
              message = "Результат отправлен в общий лидерборд.";
            } else {
              message = "Для отправки результата войдите через Яндекс ID.";
            }
          } catch (error) {
            console.error("Failed to submit the Yandex Games leaderboard score.", error);
            message = `Не удалось отправить результат: ${getErrorMessage(error)}`;
          }
        }
        break;
    }

    if (message) {
      showActionNotice(actionNotice, message);
    }
    saveGame(window.localStorage, state, currentTime());
    render();
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
      saveGame(window.localStorage, state, currentTime());
      render();
    }
  });

  elements.zoneMap.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const stop = target.closest<HTMLButtonElement>("button[data-zone]");
    if (!stop || stop.disabled) {
      return;
    }
    const result = setActiveZone(state, stop.dataset.zone ?? "");
    showActionNotice(actionNotice, result.message);
    saveGame(window.localStorage, state, currentTime());
    render();
    routeScene.renderState(state);
  });

  elements.advanceZoneButton.addEventListener("click", () => {
    const result = transitionToNextZone(state);
    showActionNotice(actionNotice, result.message);
    saveGame(window.localStorage, state, currentTime());
    render();
    routeScene.renderState(state);
  });

  elements.airshipButton.addEventListener("click", () => {
    const result = claimAirshipReward(state);
    showActionNotice(actionNotice, result.message);
    updateProgression(state);
    saveGame(window.localStorage, state, currentTime());
    render();
  });

  document.querySelector<HTMLButtonElement>("#reset-game")?.addEventListener("click", () => {
    if (!window.confirm("Сбросить весь локальный прогресс прототипа?")) {
      return;
    }
    state = resetGame(window.localStorage);
    render();
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
    platform?.rewardedAdsAvailable ?? false,
  );
  elements.offlineNotice.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>(
      'button[data-action="offline-double"]',
    );
    if (!button || !platform || pendingOfflineReward <= 0) {
      return;
    }
    button.disabled = true;
    try {
      if (await platform.showRewardedVideo()) {
        addScrap(state, pendingOfflineReward);
        pendingOfflineReward = 0;
        updateProgression(state);
        elements.offlineNotice.hidden = true;
        showActionNotice(actionNotice, "Офлайн-награда удвоена.");
        saveGame(window.localStorage, state, currentTime());
        render();
      } else {
        button.disabled = false;
        showActionNotice(actionNotice, "Реклама закрыта до получения награды.");
      }
    } catch (error) {
      console.error("Offline reward video failed.", error);
      button.disabled = false;
      showActionNotice(
        actionNotice,
        `Не удалось показать рекламу: ${getErrorMessage(error)}`,
      );
    } finally {
      resumeGameplayAfterAd();
    }
  });
  render();
  routeScene.renderState(state);
  saveGame(window.localStorage, state, nowMs);
  platform?.markReady();
  platform?.startGameplay();

  let previousFrameMs = performance.now();
  let accumulatedSeconds = 0;
  let saveElapsedSeconds = 0;
  let renderElapsedSeconds = 0;
  let cloudSaveElapsedSeconds = 0;
  const pauseReasons = new Set<string>();
  const fixedStepSeconds = 0.1;

  game.events.on("step", (time: number) => {
    const frameSeconds = Math.min((time - previousFrameMs) / 1000, 0.5);
    previousFrameMs = time;
    if (pauseReasons.size > 0) {
      return;
    }
    accumulatedSeconds += frameSeconds;

    while (accumulatedSeconds >= fixedStepSeconds) {
      tickGame(state, fixedStepSeconds);
      accumulatedSeconds -= fixedStepSeconds;
    }

    saveElapsedSeconds += frameSeconds;
    renderElapsedSeconds += frameSeconds;
    cloudSaveElapsedSeconds += frameSeconds;
    if (saveElapsedSeconds >= 10) {
      saveGame(window.localStorage, state, currentTime());
      saveElapsedSeconds = 0;
    }
    if (renderElapsedSeconds >= 0.25) {
      if (pointerDownInTabView) {
        deferredTabRender = true;
      } else {
        render();
      }
      renderElapsedSeconds = 0;
    }
    if (platform && platformUi.cloudEnabled && cloudSaveElapsedSeconds >= 60) {
      saveGame(window.localStorage, state, currentTime());
      void saveCloudSnapshot(platform).catch((error: unknown) => {
          console.error("Automatic cloud save failed.", error);
          platformUi.cloudEnabled = false;
          showActionNotice(
            actionNotice,
            `Не удалось обновить облачное сохранение: ${getErrorMessage(error)}`,
          );
          render();
        });
      cloudSaveElapsedSeconds = 0;
    }

    routeScene.renderState(state);
  });

  const pauseGameplay = (reason: string) => {
    if (pauseReasons.size === 0) {
      platform?.stopGameplay();
      saveGame(window.localStorage, state, currentTime());
    }
    pauseReasons.add(reason);
  };
  const resumeGameplay = (reason: string) => {
    if (!pauseReasons.delete(reason)) {
      return;
    }
    const now = currentTime();
    if (reason === "ad") {
      state.savedAtMs = now;
    }
    if (pauseReasons.size > 0) {
      saveGame(window.localStorage, state, now);
      return;
    }
    const result = applyOfflineEarnings(state, now);
    if (result.creditedScrap > 0) {
      pendingOfflineReward += result.creditedScrap;
      pendingOfflineElapsedSeconds += result.elapsedSeconds;
      showOfflineNotice(
        elements.offlineNotice,
        pendingOfflineElapsedSeconds,
        pendingOfflineReward,
        platform?.rewardedAdsAvailable ?? false,
      );
    }
    platform?.startGameplay();
    render();
    saveGame(window.localStorage, state, now);
  };
  const pauseGameplayForAd = () => {
    pauseGameplay("ad");
  };
  const resumeGameplayAfterAd = () => {
    resumeGameplay("ad");
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      pauseGameplay("visibility");
      return;
    }
    resumeGameplay("visibility");
  });
  window.addEventListener("blur", () => pauseGameplay("focus"));
  window.addEventListener("focus", () => resumeGameplay("focus"));
  window.addEventListener("game_api_pause", () => pauseGameplay("platform"));
  window.addEventListener("game_api_resume", () => resumeGameplay("platform"));
  window.addEventListener("pagehide", () =>
    saveGame(window.localStorage, state, currentTime()),
  );

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

void startGame().catch((error: unknown) => {
  if (errorElement) {
    errorElement.hidden = false;
    errorElement.textContent =
      error instanceof Error
        ? `Не удалось запустить игру: ${error.message}`
        : "Не удалось запустить игру из-за неизвестной ошибки.";
  }
  console.error("Failed to start Ashen Caravan prototype.", error);
});

async function synchronizeCloudSave(
  platform: GamePlatform,
  localState: GameState,
  nowMs: number,
): Promise<GameState> {
  const localSavedAtMs = localState.savedAtMs;
  saveGame(window.localStorage, localState, nowMs);
  const cloudSave = await platform.loadCloudSave();
  if (!cloudSave) {
    await saveCloudSnapshot(platform);
    return localState;
  }

  const cloudState = loadGame(
    createSerializedSaveStorage(cloudSave),
    nowMs,
  );
  const isPreferredCloudSave =
    cloudState.blueprintsTotal > localState.blueprintsTotal ||
    (cloudState.blueprintsTotal === localState.blueprintsTotal &&
      cloudState.savedAtMs > localSavedAtMs);
  const hasMeaningfulConflict =
    cloudState.blueprintsTotal !== localState.blueprintsTotal ||
    Math.abs(cloudState.savedAtMs - localSavedAtMs) >= 5 * 60 * 1000;
  const useCloud = hasMeaningfulConflict
    ? window.confirm(
        `Найдено облачное сохранение (${cloudState.blueprintsTotal} ЧР, ${new Date(cloudState.savedAtMs).toLocaleString()}) и локальное (${localState.blueprintsTotal} ЧР, ${new Date(localSavedAtMs).toLocaleString()}). Использовать облачное?`,
      )
    : isPreferredCloudSave;
  const selectedState = useCloud ? cloudState : localState;
  applyOfflineEarnings(selectedState, nowMs);
  saveGame(window.localStorage, selectedState, nowMs);
  await saveCloudSnapshot(platform);
  return selectedState;
}

function createSerializedSaveStorage(serializedSave: string): SaveStorage {
  let value: string | null = serializedSave;
  return {
    getItem: (key) => key === SAVE_KEY ? value : null,
    setItem: (key, nextValue) => {
      if (key === SAVE_KEY) {
        value = nextValue;
      }
    },
    removeItem: (key) => {
      if (key === SAVE_KEY) {
        value = null;
      }
    },
  };
}

async function saveCloudSnapshot(platform: GamePlatform): Promise<void> {
  const serializedSave = window.localStorage.getItem(SAVE_KEY);
  if (!serializedSave) {
    throw new Error("The local save is not available for cloud synchronization.");
  }
  await platform.saveCloudSave(serializedSave);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "неизвестная ошибка";
}
