import { afterEach, describe, expect, it, vi } from "vitest";
import { connectYandexGames } from "./yandex-games.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Yandex Games platform adapter", () => {
  it("uses remote defaults and exposes server time and game lifecycle hooks", async () => {
    const sdk = {
      getFlags: vi.fn(({ defaultFlags }: { defaultFlags?: Record<string, string> }) => ({
        ...defaultFlags,
        tier_cost_multiplier: "1.25",
      })),
      serverTime: vi.fn(() => 1234),
      features: {
        GameplayAPI: { start: vi.fn(), stop: vi.fn() },
        LoadingAPI: { ready: vi.fn() },
      },
    };
    vi.stubGlobal("window", { YaGames: { init: vi.fn().mockResolvedValue(sdk) } });

    const platform = await connectYandexGames();
    expect(platform).not.toBeNull();
    expect(await platform!.getRemoteFlags({ tier_cost_multiplier: "1" })).toEqual({
      tier_cost_multiplier: "1.25",
    });
    expect(platform!.getServerTime()).toBe(1234);
    platform!.markReady();
    platform!.startGameplay();
    platform!.stopGameplay();
    expect(sdk.features.LoadingAPI.ready).toHaveBeenCalledOnce();
    expect(sdk.features.GameplayAPI.start).toHaveBeenCalledOnce();
    expect(sdk.features.GameplayAPI.stop).toHaveBeenCalledOnce();
  });

  it("requires explicit player authorization for cloud saves and submits", async () => {
    let authorized = false;
    const cloudData: Record<string, unknown> = {};
    const player = {
      getData: vi.fn(async (keys?: string[]) =>
        keys ? Object.fromEntries(keys.map((key) => [key, cloudData[key]])) : cloudData,
      ),
      isAuthorized: () => authorized,
      setData: vi.fn(async (data: Record<string, unknown>) => {
        Object.assign(cloudData, data);
      }),
    };
    const sdk = {
      getPlayer: vi.fn(async () => player),
      auth: {
        openAuthDialog: vi.fn(async () => {
          authorized = true;
        }),
      },
      leaderboards: {
        setScore: vi.fn(async () => undefined),
        getEntries: vi.fn(async () => ({
          entries: [{ rank: 1, score: 12, player: { publicName: "Капитан" } }],
        })),
      },
    };
    vi.stubGlobal("window", { YaGames: { init: vi.fn().mockResolvedValue(sdk) } });

    const platform = await connectYandexGames();
    expect(await platform!.authorizePlayer()).toBe(true);
    await platform!.saveCloudSave('{"version":2}');
    expect(await platform!.loadCloudSave()).toBe('{"version":2}');
    await platform!.submitLeaderboardScore("best_navigators", 12);
    expect(await platform!.getLeaderboardEntries("best_navigators")).toEqual([
      { rank: 1, score: 12, publicName: "Капитан" },
    ]);
    expect(sdk.auth.openAuthDialog).toHaveBeenCalledOnce();
    expect(sdk.leaderboards.setScore).toHaveBeenCalledWith("best_navigators", 12);
  });

  it("grants a rewarded-ad result only after the SDK reward callback", async () => {
    const sdk = {
      adv: {
        showRewardedVideo: vi.fn((options: {
          callbacks: {
            onRewarded: () => void;
            onClose: (wasShown: boolean) => void;
          };
        }) => {
          options.callbacks.onRewarded();
          options.callbacks.onClose(true);
        }),
      },
    };
    vi.stubGlobal("window", { YaGames: { init: vi.fn().mockResolvedValue(sdk) } });

    const platform = await connectYandexGames();
    await expect(platform!.showRewardedVideo()).resolves.toBe(true);
  });

  it("rejects oversized cloud saves and invalid leaderboard values", async () => {
    const player = {
      getData: vi.fn(async () => ({})),
      isAuthorized: () => true,
      setData: vi.fn(async () => undefined),
    };
    const sdk = {
      getPlayer: vi.fn(async () => player),
      leaderboards: {
        setScore: vi.fn(async () => undefined),
        getEntries: vi.fn(async () => ({ entries: [] })),
      },
    };
    vi.stubGlobal("window", { YaGames: { init: vi.fn().mockResolvedValue(sdk) } });
    const platform = await connectYandexGames();
    await platform!.authorizePlayer();

    await expect(platform!.saveCloudSave("x".repeat(200 * 1024 + 1))).rejects.toThrow(
      /200 kb limit/i,
    );
    await expect(
      platform!.submitLeaderboardScore("best_navigators", Number.NaN),
    ).rejects.toThrow(/finite and non-negative/i);
    expect(player.setData).not.toHaveBeenCalled();
  });

  it("uses local mode when the Yandex SDK is not present", async () => {
    vi.stubGlobal("window", {});
    await expect(connectYandexGames()).resolves.toBeNull();
  });
});
