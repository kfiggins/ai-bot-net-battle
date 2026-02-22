import Phaser from "phaser";
import { Entity, SnapshotMessage, PlayerInputData, WORLD_WIDTH, WORLD_HEIGHT } from "shared";
import { NetClient } from "./net.js";

export class GameScene extends Phaser.Scene {
  private net: NetClient;
  private entitySprites: Map<string, Phaser.GameObjects.Arc> = new Map();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private latestSnapshot: SnapshotMessage | null = null;

  constructor() {
    super({ key: "GameScene" });
    this.net = new NetClient();
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#111122");
    this.cursors = this.input.keyboard!.createCursorKeys();

    this.net.setSnapshotHandler((snapshot) => {
      this.latestSnapshot = snapshot;
    });
    this.net.connect();
  }

  update(): void {
    // Send input
    const input: PlayerInputData = {
      up: this.cursors.up.isDown,
      down: this.cursors.down.isDown,
      left: this.cursors.left.isDown,
      right: this.cursors.right.isDown,
      fire: false,
      aimAngle: 0,
    };
    this.net.sendInput(input);

    // Render latest snapshot
    if (this.latestSnapshot) {
      this.renderSnapshot(this.latestSnapshot);
    }
  }

  private renderSnapshot(snapshot: SnapshotMessage): void {
    const activeIds = new Set<string>();

    for (const entity of snapshot.entities) {
      activeIds.add(entity.id);

      let sprite = this.entitySprites.get(entity.id);
      if (!sprite) {
        sprite = this.createEntitySprite(entity);
        this.entitySprites.set(entity.id, sprite);
      }

      sprite.setPosition(entity.pos.x, entity.pos.y);
    }

    // Remove sprites for entities no longer in snapshot
    for (const [id, sprite] of this.entitySprites) {
      if (!activeIds.has(id)) {
        sprite.destroy();
        this.entitySprites.delete(id);
      }
    }
  }

  private createEntitySprite(entity: Entity): Phaser.GameObjects.Arc {
    const color = entity.kind === "player_ship" ? 0x00ff88 : 0xff4444;
    const radius = entity.kind === "player_ship" ? 16 : 4;
    return this.add.circle(entity.pos.x, entity.pos.y, radius, color);
  }
}

export function createGame(): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    scene: GameScene,
    parent: document.body,
  });
}
