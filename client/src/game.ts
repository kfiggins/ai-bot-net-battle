import Phaser from "phaser";
import { Entity, SnapshotMessage, PlayerInputData, WORLD_WIDTH, WORLD_HEIGHT } from "shared";
import { NetClient } from "./net.js";

export class GameScene extends Phaser.Scene {
  private net: NetClient;
  private entitySprites: Map<string, Phaser.GameObjects.Arc> = new Map();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private fireKey!: Phaser.Input.Keyboard.Key;
  private latestSnapshot: SnapshotMessage | null = null;
  private mouseWorldPos = { x: 0, y: 0 };

  constructor() {
    super({ key: "GameScene" });
    this.net = new NetClient();
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#111122");
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.fireKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.mouseWorldPos = { x: pointer.worldX, y: pointer.worldY };
    });

    this.net.setSnapshotHandler((snapshot) => {
      this.latestSnapshot = snapshot;
    });
    this.net.connect();
  }

  update(): void {
    const aimAngle = Math.atan2(
      this.mouseWorldPos.y - (WORLD_HEIGHT / 2),
      this.mouseWorldPos.x - (WORLD_WIDTH / 2)
    );

    const input: PlayerInputData = {
      up: this.cursors.up.isDown,
      down: this.cursors.down.isDown,
      left: this.cursors.left.isDown,
      right: this.cursors.right.isDown,
      fire: this.fireKey.isDown || this.input.activePointer.isDown,
      aimAngle,
    };
    this.net.sendInput(input);

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

    for (const [id, sprite] of this.entitySprites) {
      if (!activeIds.has(id)) {
        sprite.destroy();
        this.entitySprites.delete(id);
      }
    }
  }

  private createEntitySprite(entity: Entity): Phaser.GameObjects.Arc {
    let color: number;
    let radius: number;

    switch (entity.kind) {
      case "player_ship":
        color = 0x00ff88;
        radius = 16;
        break;
      case "bullet":
        color = entity.team === 1 ? 0xffff44 : 0xff4444;
        radius = 4;
        break;
      case "minion_ship":
        color = 0xff6644;
        radius = 12;
        break;
      case "tower":
        color = 0xff2222;
        radius = 20;
        break;
      default:
        color = 0xffffff;
        radius = 8;
    }

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
