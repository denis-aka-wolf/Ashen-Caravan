import type { GamePlatform, LeaderboardEntry } from "./types.ts";

interface YandexPlayer {
  getData(keys?: string[]): Promise<Record<string, unknown>>;
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>;
  isAuthorized(): boolean;
}

interface YandexSdk {
  adv?: {
    showFullscreenAdv(options: {
      callbacks: {
        onClose: (wasShown: boolean) => void;
        onError: (error: unknown) => void;
        onOpen?: () => void;
      };
    }): void;
    showRewardedVideo(options: {
      callbacks: {
        onClose: (wasShown: boolean) => void;
        onError: (error: unknown) => void;
        onOpen?: () => void;
        onRewarded: () => void;
      };
    }): void;
  };
  auth?: { openAuthDialog(): Promise<void> };
  environment?: { i18n?: { lang?: string } };
  features?: {
    GameplayAPI?: { start(): void; stop(): void };
    LoadingAPI?: { ready(): void };
  };
  getFlags(
    options?: { defaultFlags?: Record<string, string> },
  ): Record<string, string> | Promise<Record<string, string>>;
  getPlayer(options?: { scopes?: boolean }): Promise<YandexPlayer>;
  isAvailableMethod?(methodName: string): boolean;
  leaderboards?: {
    getEntries(
      name: string,
      options: { quantityTop: number },
    ): Promise<{ entries: Array<{ rank: number; score: number; player: { publicName: string } }> }>;
    setScore(name: string, score: number): Promise<void>;
  };
  serverTime?(): number;
}

declare global {
  interface Window {
    YaGames?: { init(): Promise<YandexSdk> };
  }
}

const CLOUD_SAVE_KEY = "ashenCaravanSave";
const MAX_CLOUD_SAVE_BYTES = 200 * 1024;

export async function connectYandexGames(): Promise<GamePlatform | null> {
  if (!window.YaGames && shouldLoadYandexSdk()) {
    await loadYandexSdk();
  }
  if (!window.YaGames) {
    return null;
  }

  const sdk = await window.YaGames.init();
  return new YandexGamesPlatform(sdk);
}

function shouldLoadYandexSdk(): boolean {
  const host = window.location?.hostname.toLowerCase() ?? "";
  const isPlatformHost = isYandexHost(host);
  const explicitlyEnabled =
    new URLSearchParams(window.location?.search ?? "").get("yandex-sdk") === "1";
  return isPlatformHost || explicitlyEnabled;
}

function loadYandexSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const host = window.location.hostname.toLowerCase();
    const isPlatformHost = isYandexHost(host);
    script.src = isPlatformHost ? "/sdk.js" : "https://yandex.ru/games/sdk/v2";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the Yandex Games SDK."));
    document.head.append(script);
  });
}

function isYandexHost(host: string): boolean {
  return ["yandex.ru", "yandex.com", "yandex.net", "yandex.by", "yandex.kz"]
    .some((domain) => host === domain || host.endsWith(`.${domain}`));
}

class YandexGamesPlatform implements GamePlatform {
  readonly kind = "yandex" as const;
  private player: YandexPlayer | null = null;
  private readonly sdk: YandexSdk;

  constructor(sdk: YandexSdk) {
    this.sdk = sdk;
  }

  get rewardedAdsAvailable(): boolean {
    return typeof this.sdk.adv?.showRewardedVideo === "function";
  }

  get fullscreenAdsAvailable(): boolean {
    return typeof this.sdk.adv?.showFullscreenAdv === "function";
  }

  async getRemoteFlags(
    defaultFlags: Record<string, string>,
  ): Promise<Record<string, string>> {
    return await this.sdk.getFlags({ defaultFlags });
  }

  getServerTime(): number {
    const time = this.sdk.serverTime?.();
    return typeof time === "number" && Number.isFinite(time) ? time : Date.now();
  }

  showRewardedVideo(): Promise<boolean> {
    const show = this.sdk.adv?.showRewardedVideo;
    if (!show) {
      return Promise.reject(new Error("Rewarded ads are not available in this SDK session."));
    }

    return new Promise((resolve, reject) => {
      let rewarded = false;
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        callback();
      };

      show.call(this.sdk.adv, {
        callbacks: {
          onRewarded: () => {
            rewarded = true;
          },
          onClose: (wasShown) => finish(() => resolve(wasShown && rewarded)),
          onError: (error) =>
            finish(() => reject(toError("Rewarded ad failed.", error))),
        },
      });
    });
  }

  showFullscreenAd(): Promise<void> {
    const show = this.sdk.adv?.showFullscreenAdv;
    if (!show) {
      return Promise.reject(new Error("Fullscreen ads are not available in this SDK session."));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        callback();
      };
      show.call(this.sdk.adv, {
        callbacks: {
          onClose: () => finish(resolve),
          onError: (error) =>
            finish(() => reject(toError("Fullscreen ad failed.", error))),
        },
      });
    });
  }

  async authorizePlayer(): Promise<boolean> {
    let player = await this.sdk.getPlayer({ scopes: false });
    if (!player.isAuthorized()) {
      if (!this.sdk.auth) {
        return false;
      }
      await this.sdk.auth.openAuthDialog();
      player = await this.sdk.getPlayer({ scopes: false });
    }
    this.player = player.isAuthorized() ? player : null;
    return this.player !== null;
  }

  async loadCloudSave(): Promise<string | null> {
    const player = this.requireAuthorizedPlayer();
    const data = await player.getData([CLOUD_SAVE_KEY]);
    const save = data[CLOUD_SAVE_KEY];
    if (save === undefined || save === null) {
      return null;
    }
    if (typeof save !== "string") {
      throw new Error("Cloud save has an unsupported format.");
    }
    return save;
  }

  async saveCloudSave(serializedSave: string): Promise<void> {
    if (new TextEncoder().encode(serializedSave).byteLength > MAX_CLOUD_SAVE_BYTES) {
      throw new RangeError("Cloud save exceeds the platform's 200 KB limit.");
    }
    await this.requireAuthorizedPlayer().setData(
      { [CLOUD_SAVE_KEY]: serializedSave },
      true,
    );
  }

  async submitLeaderboardScore(name: string, score: number): Promise<void> {
    if (!Number.isFinite(score) || score < 0) {
      throw new RangeError("Leaderboard score must be finite and non-negative.");
    }
    if (!this.sdk.leaderboards?.setScore) {
      throw new Error("Leaderboard submission is not available in this SDK session.");
    }
    if (
      this.sdk.isAvailableMethod &&
      !this.sdk.isAvailableMethod("leaderboards.setScore")
    ) {
      throw new Error("Leaderboard submission is unavailable for this player.");
    }
    await this.requireAuthorizedPlayer();
    await this.sdk.leaderboards.setScore(name, Math.floor(score));
  }

  async getLeaderboardEntries(name: string): Promise<LeaderboardEntry[]> {
    if (!this.sdk.leaderboards?.getEntries) {
      throw new Error("Leaderboards are not available in this SDK session.");
    }
    const result = await this.sdk.leaderboards.getEntries(name, {
      quantityTop: 10,
    });
    return result.entries.map((entry) => ({
      rank: entry.rank,
      score: entry.score,
      publicName: entry.player.publicName,
    }));
  }

  markReady(): void {
    this.sdk.features?.LoadingAPI?.ready();
  }

  startGameplay(): void {
    this.sdk.features?.GameplayAPI?.start();
  }

  stopGameplay(): void {
    this.sdk.features?.GameplayAPI?.stop();
  }

  private requireAuthorizedPlayer(): YandexPlayer {
    if (!this.player?.isAuthorized()) {
      throw new Error("Connect a Yandex ID account before using cloud features.");
    }
    return this.player;
  }
}

function toError(message: string, cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(message, { cause });
}
