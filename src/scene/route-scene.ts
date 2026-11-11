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

    graphics.clear();
    graphics.fillStyle(0x323a3b, 1);
    graphics.fillRect(0, 0, width, height);
    graphics.fillStyle(0x626664, 1);
    graphics.fillRect(0, roadY, width, height * 0.3);
    graphics.fillStyle(0x95978d, 1);
    graphics.fillRect(0, roadY + height * 0.13, width, height * 0.025);

    for (let index = 0; index < 5; index += 1) {
      graphics.fillStyle(0x42494a, 1);
      graphics.fillRect(width * index * 0.25, height * 0.17, width * 0.13, height * 0.2);
    }

    const truckX = width * 0.38;
    graphics.fillStyle(0x9d8b67, 1);
    graphics.fillRect(truckX, roadY - height * 0.16, width * 0.17, height * 0.13);
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
