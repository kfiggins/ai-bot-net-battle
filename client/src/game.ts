import Phaser from "phaser";
import { Entity, PlayerInputData, WORLD_WIDTH, WORLD_HEIGHT } from "shared";
import { NetClient } from "./net.js";
import { SnapshotInterpolator, InterpolatedEntity } from "./interpolation.js";
import { VFXManager } from "./vfx.js";
import { HUD } from "./ui.js";

export class GameScene extends Phaser.Scene {
  private net: NetClient;
  private interpolator: SnapshotInterpolator;
  private entitySprites: Map<string, Phaser.GameObjects.Arc> = new Map();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { w: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key; s: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key };
  private fireKey!: Phaser.Input.Keyboard.Key;
  private mouseWorldPos = { x: 0, y: 0 };
  private vfx!: VFXManager;
  private hud!: HUD;
  private previousEntityIds: Set<string> = new Set();
  private previousEntityHp: Map<string, number> = new Map();

  constructor() {
    super({ key: "GameScene" });
    this.net = new NetClient();
    this.interpolator = new SnapshotInterpolator();
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#111122");
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      w: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.fireKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.vfx = new VFXManager(this);
    this.hud = new HUD(this);

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.mouseWorldPos = { x: pointer.worldX, y: pointer.worldY };
    });

    this.net.setSnapshotHandler((snapshot) => {
      this.interpolator.pushSnapshot(snapshot);
    });

    // Use URL hash as room ID, e.g. http://localhost:5173/#my-room
    const roomId = window.location.hash.slice(1) || "default";
    this.net.connect(roomId);
  }

  update(_time: number, dt: number): void {
    // Calculate aim angle from player's position toward cursor
    let playerX = WORLD_WIDTH / 2;
    let playerY = WORLD_HEIGHT / 2;
    const selfId = this.net.selfEntityId;
    if (selfId) {
      const sprite = this.entitySprites.get(selfId);
      if (sprite) {
        playerX = sprite.x;
        playerY = sprite.y;
      }
    }

    const aimAngle = Math.atan2(
      this.mouseWorldPos.y - playerY,
      this.mouseWorldPos.x - playerX
    );

    const input: PlayerInputData = {
      up: this.cursors.up.isDown || this.wasd.w.isDown,
      down: this.cursors.down.isDown || this.wasd.s.isDown,
      left: this.cursors.left.isDown || this.wasd.a.isDown,
      right: this.cursors.right.isDown || this.wasd.d.isDown,
      fire: this.fireKey.isDown || this.input.activePointer.isDown,
      aimAngle,
    };
    this.net.sendInput(input);

    const entities = this.interpolator.getInterpolatedEntities();
    if (entities.length > 0) {
      this.detectEvents(entities);
      this.renderEntities(entities);
      this.hud.updateHealthBars(entities);
    }

    this.hud.updatePhase(this.interpolator.getPhaseInfo());
    this.vfx.update(dt);
  }

  private detectEvents(entities: InterpolatedEntity[]): void {
    const currentIds = new Set<string>();
    const currentHp = new Map<string, number>();

    for (const entity of entities) {
      currentIds.add(entity.id);
      currentHp.set(entity.id, entity.hp);

      // Detect hits (HP decreased)
      const prevHp = this.previousEntityHp.get(entity.id);
      if (prevHp !== undefined && entity.hp < prevHp) {
        this.vfx.hitFlash(entity.id);
      }
    }

    // Detect deaths (entity disappeared)
    for (const id of this.previousEntityIds) {
      if (!currentIds.has(id)) {
        // Entity was removed - find its last known position for explosion
        const lastHp = this.previousEntityHp.get(id);
        // Only explode if it was alive before (not a bullet that expired)
        if (lastHp !== undefined && lastHp > 0) {
          // We need the last position - check sprites
          const sprite = this.entitySprites.get(id);
          if (sprite) {
            this.vfx.explosion(sprite.x, sprite.y, sprite.fillColor, 10);
          }
        }
      }
    }

    this.previousEntityIds = currentIds;
    this.previousEntityHp = currentHp;
  }

  private renderEntities(entities: InterpolatedEntity[]): void {
    const activeIds = new Set<string>();

    for (const entity of entities) {
      activeIds.add(entity.id);

      let sprite = this.entitySprites.get(entity.id);
      if (!sprite) {
        sprite = this.createEntitySprite(entity);
        this.entitySprites.set(entity.id, sprite);
        // Spawn telegraph for non-bullet entities
        if (entity.kind !== "bullet") {
          this.vfx.spawnTelegraph(entity.pos.x, entity.pos.y, getRadius(entity.kind));
        }
      }

      sprite.setPosition(entity.pos.x, entity.pos.y);

      // Apply hit flash tint
      if (this.vfx.isFlashing(entity.id)) {
        sprite.setFillStyle(0xffffff);
      } else {
        sprite.setFillStyle(getColor(entity));
      }
    }

    for (const [id, sprite] of this.entitySprites) {
      if (!activeIds.has(id)) {
        sprite.destroy();
        this.entitySprites.delete(id);
      }
    }
  }

  private createEntitySprite(entity: Entity): Phaser.GameObjects.Arc {
    const color = getColor(entity);
    const radius = getRadius(entity.kind);
    return this.add.circle(entity.pos.x, entity.pos.y, radius, color);
  }
}

function getColor(entity: Entity): number {
  switch (entity.kind) {
    case "player_ship": return 0x00ff88;
    case "bullet": return entity.team === 1 ? 0xffff44 : 0xff4444;
    case "minion_ship": return 0xff6644;
    case "tower": return 0xff2222;
    case "mothership": return 0xff00ff;
    default: return 0xffffff;
  }
}

function getRadius(kind: string): number {
  switch (kind) {
    case "player_ship": return 16;
    case "bullet": return 4;
    case "minion_ship": return 12;
    case "tower": return 20;
    case "mothership": return 40;
    default: return 8;
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
