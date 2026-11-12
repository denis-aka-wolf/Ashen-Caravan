export interface LeaderboardEntry {
  rank: number;
  score: number;
  publicName: string;
}

export interface GamePlatform {
  readonly kind: "yandex";
  readonly rewardedAdsAvailable: boolean;
  readonly fullscreenAdsAvailable: boolean;
  getRemoteFlags(defaultFlags: Record<string, string>): Promise<Record<string, string>>;
  getServerTime(): number;
  showRewardedVideo(): Promise<boolean>;
  showFullscreenAd(): Promise<void>;
  authorizePlayer(): Promise<boolean>;
  loadCloudSave(): Promise<string | null>;
  saveCloudSave(serializedSave: string): Promise<void>;
  submitLeaderboardScore(name: string, score: number): Promise<void>;
  getLeaderboardEntries(name: string): Promise<LeaderboardEntry[]>;
  markReady(): void;
  startGameplay(): void;
  stopGameplay(): void;
}
