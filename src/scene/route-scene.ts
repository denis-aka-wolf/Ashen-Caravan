import Phaser from "phaser";
import type { GameState } from "../core/types.ts";

export class RouteScene extends Phaser.Scene {
  private graphics: Phaser.GameObjects.Graphics | undefined;
  private currentState: GameState | null = null;

  constructor() {
    super("route");
  }

  create(): void {
    this.graphics = this.add.graphics();
    if (this.currentState) {
      this.renderState(this.currentState);
    }
  }

  renderState(state: GameState): void {
    this.currentState = state;
    if (!this.graphics) {
      return;
    }
    const { width, height } = this.scale;
    const graphics = this.graphics;
    const roadY = height * 0.57;
    const palette: Record<string, { sky: number; road: number; line: number }> = {
      ruins: { sky: 0x323a3b, road: 0x626664, line: 0x95978d },
      plains: { sky: 0x56493a, road: 0x78674c, line: 0xb19a71 },
      flooded: { sky: 0x34494d, road: 0x526467, line: 0x93aaad },
      mountain: { sky: 0x44464a, road: 0x67696b, line: 0xb3ada0 },
    };
    const colors = palette[state.activeZoneId] ?? palette.ruins;

    graphics.clear();
    graphics.fillStyle(colors.sky, 1);
    graphics.fillRect(0, 0, width, height);
    graphics.fillStyle(colors.road, 1);
    graphics.fillRect(0, roadY, width, height * 0.3);
    graphics.fillStyle(colors.line, 1);
    graphics.fillRect(0, roadY + height * 0.13, width, height * 0.025);

    for (let index = 0; index < 5; index += 1) {
      graphics.fillStyle(0x42494a, 1);
      graphics.fillRect(width * index * 0.25, height * 0.17, width * 0.13, height * 0.2);
    }

    const truckX = width * 0.38;
    const cosmeticColors: Record<string, number> = {
      "beacon-rust": 0x9d8b67,
      "beacon-amber": 0xc28b3c,
      "beacon-sky": 0x729cad,
      "garland-warm": 0xc69b59,
      "garland-color": 0xb7696a,
      "garland-stars": 0xc7c8bb,
    };
    graphics.fillStyle(cosmeticColors[state.selectedCosmeticId ?? ""] ?? 0x9d8b67, 1);
    graphics.fillRect(truckX, roadY - height * 0.16, width * 0.17, height * 0.13);
    if (state.selectedCosmeticId?.startsWith("garland-")) {
      graphics.lineStyle(2, 0xf3cb7e, 1);
      graphics.lineBetween(
        truckX + width * 0.02,
        roadY - height * 0.16,
        truckX + width * 0.15,
        roadY - height * 0.16,
      );
    }
    graphics.fillStyle(0x262b2c, 1);
    graphics.fillRect(truckX + width * 0.025, roadY - height * 0.045, width * 0.04, height * 0.05);
    graphics.fillRect(truckX + width * 0.12, roadY - height * 0.045, width * 0.04, height * 0.05);

    for (const finding of state.finds) {
      const x = finding.x * width;
      const y = finding.y * height;
      graphics.fillStyle(0xd0a35f, 0.25);
      graphics.fillCircle(x, y, height * 0.075);
      graphics.fillStyle(0xd0a35f, 1);
      graphics.fillRect(x - height * 0.035, y - height * 0.035, height * 0.07, height * 0.07);
      graphics.lineStyle(2, 0xe7d0a6, 0.9);
      graphics.strokeRect(x - height * 0.035, y - height * 0.035, height * 0.07, height * 0.07);
    }
  }
}
