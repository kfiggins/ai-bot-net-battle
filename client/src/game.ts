import Phaser from "phaser";
import { Entity, PlayerInputData, WORLD_WIDTH, WORLD_HEIGHT, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, GRID_SPACING, PLAYER_SPEED } from "shared";
import { NetClient } from "./net.js";
import { SnapshotInterpolator, InterpolatedEntity } from "./interpolation.js";
import { VFXManager } from "./vfx.js";
import { HUD } from "./ui.js";
import { computeTeammateArrow } from "./teammate-arrows.js";

export class GameScene extends Phaser.Scene {
  private net!: NetClient;
  private interpolator!: SnapshotInterpolator;
  private entitySprites: Map<string, Phaser.GameObjects.Arc> = new Map();
  private entityLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { w: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key; s: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key };
  private fireKey!: Phaser.Input.Keyboard.Key;
  private mouseWorldPos = { x: 0, y: 0 };
  private vfx!: VFXManager;
  private hud!: HUD;
  private previousEntityIds: Set<string> = new Set();
  private previousEntityHp: Map<string, number> = new Map();
  private teammateArrows: Map<string, Phaser.GameObjects.Graphics> = new Map();
  /** Client-side predicted position for local player */
  private predictedPos: { x: number; y: number } | null = null;
  private matchStartMs = 0;
  private victoryShown = false;
  private cameraPos: { x: number; y: number } | null = null;
  private modeText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#111122");

    // Set up world bounds and camera
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.roundPixels = true;
    this.cameraPos = null;

    // Draw background grid for spatial awareness
    this.drawGrid();

    // Draw visible world boundary
    this.drawWorldBoundary();

    // Get shared NetClient from lobby scene via registry
    this.net = this.registry.get("net") as NetClient;
    this.interpolator = new SnapshotInterpolator();

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
    this.matchStartMs = performance.now();
    this.victoryShown = false;

    this.modeText = this.add
      .text(10, 10, `Mode: ${this.net.currentMode === "external_agent" ? "Agent ON" : "Kids AI"}`, {
        fontSize: "14px",
        color: "#7dd3fc",
        fontFamily: "monospace",
        backgroundColor: "#00000088",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0, 0)
      .setDepth(200)
      .setScrollFactor(0);

    // Leave Game button (top-right, viewport-relative)
    const leaveBtn = this.add
      .text(VIEWPORT_WIDTH - 10, 10, "LEAVE", {
        fontSize: "14px",
        color: "#ff4444",
        fontFamily: "monospace",
        backgroundColor: "#00000088",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(1, 0)
      .setDepth(200)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    leaveBtn.on("pointerover", () => leaveBtn.setColor("#ff8888"));
    leaveBtn.on("pointerout", () => leaveBtn.setColor("#ff4444"));
    leaveBtn.on("pointerdown", () => {
      this.net.sendLeaveRoom();
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.mouseWorldPos = { x: pointer.worldX, y: pointer.worldY };
    });

    this.net.setSnapshotHandler((snapshot) => {
      this.interpolator.pushSnapshot(snapshot);
    });

    // Reset prediction when entity ID changes (reconnect / new player)
    this.net.setEntityChangeHandler(() => {
      this.predictedPos = null;
      this.cameraPos = null;
    });

    // Server ended the match — go back to lobby
    this.net.setMatchEndHandler(() => {
      this.scene.start("LobbyScene");
    });
  }

  update(_time: number, dt: number): void {
    const selfId = this.net.selfEntityId;
    const dtSec = dt / 1000;

    // Read input
    const input: PlayerInputData = {
      up: this.cursors.up.isDown || this.wasd.w.isDown,
      down: this.cursors.down.isDown || this.wasd.s.isDown,
      left: this.cursors.left.isDown || this.wasd.a.isDown,
      right: this.cursors.right.isDown || this.wasd.d.isDown,
      fire: this.fireKey.isDown || this.input.activePointer.isDown,
      aimAngle: 0, // set below after prediction
    };

    // Client-side prediction: move local player immediately
    if (selfId && this.predictedPos) {
      let vx = 0;
      let vy = 0;
      if (input.up) vy -= 1;
      if (input.down) vy += 1;
      if (input.left) vx -= 1;
      if (input.right) vx += 1;
      const mag = Math.sqrt(vx * vx + vy * vy);
      if (mag > 0) {
        vx = (vx / mag) * PLAYER_SPEED;
        vy = (vy / mag) * PLAYER_SPEED;
      }
      this.predictedPos.x = Math.max(0, Math.min(WORLD_WIDTH, this.predictedPos.x + vx * dtSec));
      this.predictedPos.y = Math.max(0, Math.min(WORLD_HEIGHT, this.predictedPos.y + vy * dtSec));
    }

    // Calculate aim angle from predicted position (or sprite fallback)
    let playerX = WORLD_WIDTH / 2;
    let playerY = WORLD_HEIGHT / 2;
    if (selfId && this.predictedPos) {
      playerX = this.predictedPos.x;
      playerY = this.predictedPos.y;
    }

    input.aimAngle = Math.atan2(
      this.mouseWorldPos.y - playerY,
      this.mouseWorldPos.x - playerX
    );

    this.net.sendInput(input);

    const entities = this.interpolator.getInterpolatedEntities();
    if (entities.length > 0) {
      // Initialize predicted position from first snapshot containing our entity
      if (selfId && !this.predictedPos) {
        const self = entities.find((e) => e.id === selfId);
        if (self) {
          this.predictedPos = { x: self.pos.x, y: self.pos.y };
        }
      }

      // Reconcile: nudge prediction toward server truth without back-and-forth jitter.
      if (selfId && this.predictedPos) {
        const serverSelf = entities.find((e) => e.id === selfId);
        if (serverSelf) {
          const dx = serverSelf.targetPos.x - this.predictedPos.x;
          const dy = serverSelf.targetPos.y - this.predictedPos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const isMoving = input.up || input.down || input.left || input.right;

          if (dist > 160) {
            // Way off (packet delay/rejoin): hard snap.
            this.predictedPos.x = serverSelf.targetPos.x;
            this.predictedPos.y = serverSelf.targetPos.y;
          } else if (dist > 12) {
            // While moving, apply light correction; while idle, converge faster.
            const alpha = isMoving ? 0.04 : 0.16;
            const maxStep = isMoving ? 4 : 10;
            const step = Math.min(maxStep, dist * alpha);
            this.predictedPos.x += (dx / dist) * step;
            this.predictedPos.y += (dy / dist) * step;
          }
        }
      }

      // Override local player position with prediction before rendering
      if (selfId && this.predictedPos) {
        const selfEntity = entities.find((e) => e.id === selfId);
        if (selfEntity) {
          selfEntity.pos.x = this.predictedPos.x;
          selfEntity.pos.y = this.predictedPos.y;
        }
      }

      // Smooth camera centered on predicted local player position.
      // This decouples camera motion from sprite reconciliation jitter.
      if (selfId && this.predictedPos) {
        if (!this.cameraPos) {
          this.cameraPos = { x: this.predictedPos.x, y: this.predictedPos.y };
        } else {
          this.cameraPos.x += (this.predictedPos.x - this.cameraPos.x) * 0.18;
          this.cameraPos.y += (this.predictedPos.y - this.cameraPos.y) * 0.18;
        }
        this.cameras.main.centerOn(this.cameraPos.x, this.cameraPos.y);
      }

      this.detectEvents(entities);
      this.renderEntities(entities);
      this.updateTeammateArrows(entities, selfId);
      this.hud.updateHealthBars(entities);
      this.hud.updateDebug(entities);
    }

    const phase = this.interpolator.getPhaseInfo();
    this.hud.updatePhase(phase);

    if (phase?.matchOver && !this.victoryShown) {
      this.victoryShown = true;
      this.hud.showVictory({
        durationSec: (performance.now() - this.matchStartMs) / 1000,
        phase: phase.current,
        remaining: phase.remaining,
      }, () => {
        this.net.sendLeaveRoom();
      });
    }

    this.vfx.update(dt);
  }

  /** Draw agar.io-style grid lines across the entire world */
  private drawGrid(): void {
    const gfx = this.add.graphics();
    gfx.setDepth(-1);
    gfx.lineStyle(1, 0x222244, 0.5);

    // Vertical lines
    for (let x = 0; x <= WORLD_WIDTH; x += GRID_SPACING) {
      gfx.lineBetween(x, 0, x, WORLD_HEIGHT);
    }

    // Horizontal lines
    for (let y = 0; y <= WORLD_HEIGHT; y += GRID_SPACING) {
      gfx.lineBetween(0, y, WORLD_WIDTH, y);
    }
  }

  /** Draw visible boundary at the edges of the world */
  private drawWorldBoundary(): void {
    const gfx = this.add.graphics();
    gfx.setDepth(1);
    gfx.lineStyle(4, 0xff4444, 0.8);
    gfx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
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

      // Player labels
      if (entity.label) {
        let label = this.entityLabels.get(entity.id);
        if (!label) {
          label = this.add.text(0, 0, entity.label, {
            fontSize: "11px",
            color: "#ffffff",
            align: "center",
          }).setOrigin(0.5, 1);
          this.entityLabels.set(entity.id, label);
        }
        label.setPosition(entity.pos.x, entity.pos.y - getRadius(entity.kind) - 4);
      }
    }

    for (const [id, sprite] of this.entitySprites) {
      if (!activeIds.has(id)) {
        sprite.destroy();
        this.entitySprites.delete(id);
        const label = this.entityLabels.get(id);
        if (label) {
          label.destroy();
          this.entityLabels.delete(id);
        }
      }
    }
  }

  private createEntitySprite(entity: Entity): Phaser.GameObjects.Arc {
    const color = getColor(entity);
    const radius = getRadius(entity.kind);
    return this.add.circle(entity.pos.x, entity.pos.y, radius, color);
  }

  /** Draw/update screen-edge arrows pointing toward off-screen teammates. */
  private updateTeammateArrows(entities: InterpolatedEntity[], selfId: string | null): void {
    const cam = this.cameras.main;

    if (!selfId) {
      for (const gfx of this.teammateArrows.values()) gfx.setVisible(false);
      return;
    }

    const selfEntity = entities.find((e) => e.id === selfId);
    if (!selfEntity) {
      for (const gfx of this.teammateArrows.values()) gfx.setVisible(false);
      return;
    }

    const teammates = entities.filter(
      (e) => e.kind === "player_ship" && e.id !== selfId && e.team === selfEntity.team
    );

    const activeIds = new Set<string>();

    for (const mate of teammates) {
      activeIds.add(mate.id);

      const result = computeTeammateArrow(
        mate.pos.x, mate.pos.y,
        cam.scrollX, cam.scrollY,
        VIEWPORT_WIDTH, VIEWPORT_HEIGHT
      );

      if (!result.visible) {
        const gfx = this.teammateArrows.get(mate.id);
        if (gfx) gfx.setVisible(false);
        continue;
      }

      let gfx = this.teammateArrows.get(mate.id);
      if (!gfx) {
        gfx = this.add.graphics();
        gfx.setDepth(150);
        gfx.setScrollFactor(0);
        this.teammateArrows.set(mate.id, gfx);
      }

      gfx.setVisible(true);
      gfx.clear();

      const color = getColor(mate);
      const { screenX: ax, screenY: ay, angle } = result;

      // Arrow triangle: tip points toward the off-screen teammate
      const tipLen = 12;
      const baseHalf = 7;
      const tipX = ax + Math.cos(angle) * tipLen;
      const tipY = ay + Math.sin(angle) * tipLen;
      const b1x = ax + Math.cos(angle + Math.PI / 2) * baseHalf;
      const b1y = ay + Math.sin(angle + Math.PI / 2) * baseHalf;
      const b2x = ax + Math.cos(angle - Math.PI / 2) * baseHalf;
      const b2y = ay + Math.sin(angle - Math.PI / 2) * baseHalf;

      gfx.fillStyle(color, 0.9);
      gfx.fillTriangle(tipX, tipY, b1x, b1y, b2x, b2y);
      gfx.lineStyle(1.5, 0xffffff, 0.5);
      gfx.strokeTriangle(tipX, tipY, b1x, b1y, b2x, b2y);
    }

    // Clean up arrows for teammates who left the match
    for (const [id, gfx] of this.teammateArrows) {
      if (!activeIds.has(id)) {
        gfx.destroy();
        this.teammateArrows.delete(id);
      }
    }
  }
}

const PLAYER_COLORS = [0x00ff88, 0x44aaff, 0xffaa00, 0xff44ff];

function getColor(entity: Entity): number {
  switch (entity.kind) {
    case "player_ship": {
      const idx = (entity.playerIndex ?? 1) - 1;
      return PLAYER_COLORS[idx % PLAYER_COLORS.length];
    }
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
