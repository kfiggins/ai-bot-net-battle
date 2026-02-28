import Phaser from "phaser";
import { Entity, PlayerInputData, WORLD_WIDTH, WORLD_HEIGHT, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, GRID_SPACING, PLAYER_MAX_SPEED, PLAYER_ACCEL, PLAYER_BRAKE_FRICTION, SPEED_PER_UPGRADE, ORB_RADIUS, CANNON_LENGTH, CANNON_WIDTH, CANNON_OFFSET_LATERAL, CANNON_SPREAD_ANGLE, BOOST_PARTICLE_THRESHOLD, PLAYER_RADIUS } from "shared";
import { NetClient } from "./net.js";
import { SnapshotInterpolator, InterpolatedEntity } from "./interpolation.js";
import { VFXManager } from "./vfx.js";
import { HUD } from "./ui.js";
import { AudioManager } from "./audio.js";
import { computeTeammateArrow } from "./teammate-arrows.js";

export class GameScene extends Phaser.Scene {
  private net!: NetClient;
  private interpolator!: SnapshotInterpolator;
  private entitySprites: Map<string, Phaser.GameObjects.Arc | Phaser.GameObjects.Image> = new Map();
  private entityLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { w: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key; s: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key };
  private fireKey!: Phaser.Input.Keyboard.Key;
  private mouseWorldPos = { x: 0, y: 0 };
  private vfx!: VFXManager;
  private hud!: HUD;
  private audio!: AudioManager;
  private previousEntityIds: Set<string> = new Set();
  private previousEntityHp: Map<string, number> = new Map();
  private previousEntityKinds: Map<string, string> = new Map();
  private teammateArrows: Map<string, Phaser.GameObjects.Graphics> = new Map();
  /** Client-side predicted position and velocity for local player */
  private predictedPos: { x: number; y: number } | null = null;
  private predictedVel = { x: 0, y: 0 };
  private matchStartMs = 0;
  private victoryShown = false;
  private cameraPos: { x: number; y: number } | null = null;
  private modeText!: Phaser.GameObjects.Text;
  private predictedMaxSpeed = PLAYER_MAX_SPEED;
  private latestBotResources: number | undefined;
  private cannonSprites: Map<string, Phaser.GameObjects.Rectangle[]> = new Map();
  private localAimAngle = 0;
  private lastShotSoundMs = 0;
  private previousLevel = 1;

  constructor() {
    super({ key: "GameScene" });
  }

  preload(): void {
    this.load.image("tower", "assets/tower.png");
    this.load.image("rocket_tower", "assets/rocketTower.png");
    this.load.image("blue_plasma", "assets/bluePlasma.png");
    this.load.image("nemesis", "assets/nemesis.png");
    this.load.image("rocket", "assets/rocket.png");
    this.load.image("minion", "assets/minion.png");
    this.load.image("spaceship_lime_green", "assets/spaceship_lime_green.png");
    this.load.image("spaceship_cyan_teal", "assets/spaceship_cyan_teal.png");
    this.load.image("spaceship_orange", "assets/spaceship_orange.png");
    this.load.image("spaceship_pink", "assets/spaceship_pink.png");
    this.load.image("spaceship_yellow", "assets/spaceship_yellow.png");
    this.load.image("spaceship_white", "assets/spaceship_white.png");
    this.load.image("spaceship_navy", "assets/spaceship_navy.png");
    this.load.image("spaceship_black", "assets/spaceship_black.png");
    // Phantom ship — place your sprite at client/public/assets/phantom.png
    this.load.image("phantom", "assets/phantom.png");

    AudioManager.preload(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#111122");

    // Clear any stale state from a previous session (Phaser reuses the scene instance)
    this.entitySprites.clear();
    this.entityLabels.clear();
    this.teammateArrows.clear();
    this.previousEntityIds.clear();
    this.previousEntityHp.clear();
    this.previousEntityKinds.clear();
    this.cannonSprites.clear();
    this.predictedPos = null;
    this.cameraPos = null;
    this.victoryShown = false;

    // Set up world bounds and camera
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.roundPixels = true;

    // Draw background grid for spatial awareness
    this.drawGrid();

    // Draw visible world boundary
    this.drawWorldBoundary();

    // Get shared NetClient from lobby scene via registry
    this.net = this.registry.get("net") as NetClient;
    this.interpolator = new SnapshotInterpolator();

    // Crosshair cursor and disable right-click context menu
    this.input.setDefaultCursor("crosshair");
    this.input.mouse?.disableContextMenu();

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
    this.audio = (this.registry.get("audio") as AudioManager) ?? new AudioManager(this);
    this.registry.set("audio", this.audio);
    this.audio.playMusic("music_match_loop");
    this.hud.setDebugEnabled(this.net.debugLogEnabled);
    this.hud.setUpgradeHandler((stat) => {
      this.net.sendUpgrade(stat as "damage" | "speed" | "health" | "fire_rate");
    });
    this.matchStartMs = performance.now();
    this.victoryShown = false;
    this.predictedMaxSpeed = PLAYER_MAX_SPEED;
    this.predictedVel = { x: 0, y: 0 };

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
      this.audio.stopMusic();
      this.net.disconnect();
      this.scene.start("NameEntryScene");
    });

    // mouseWorldPos is updated every frame in update() so it stays
    // correct as the camera scrolls (even while the pointer is held down).

    this.net.setSnapshotHandler((snapshot) => {
      this.latestBotResources = snapshot.botResources;
      this.interpolator.pushSnapshot(snapshot);
    });

    // Reset prediction when entity ID changes (reconnect / new player)
    this.net.setEntityChangeHandler(() => {
      this.predictedPos = null;
      this.predictedVel = { x: 0, y: 0 };
      this.cameraPos = null;
    });

    // Server ended the match — go back to lobby
    this.net.setMatchEndHandler(() => {
      this.audio.stopMusic();
      this.scene.start("LobbyScene");
    });
  }

  update(_time: number, dt: number): void {
    const selfId = this.net.selfEntityId;
    const dtSec = dt / 1000;

    // Recompute mouse world position every frame so aim stays correct
    // as the camera scrolls (pointer.worldX/Y goes stale while held down).
    const pointer = this.input.activePointer;
    this.mouseWorldPos = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

    // Read input
    const input: PlayerInputData = {
      up: this.cursors.up.isDown || this.wasd.w.isDown,
      down: this.cursors.down.isDown || this.wasd.s.isDown,
      left: this.cursors.left.isDown || this.wasd.a.isDown,
      right: this.cursors.right.isDown || this.wasd.d.isDown,
      fire: this.fireKey.isDown || this.input.activePointer.leftButtonDown(),
      fireMissile: this.input.activePointer.rightButtonDown(),
      aimAngle: 0, // set below after prediction
    };

    // Client-side prediction: inertia model mirroring server updatePlayers()
    if (selfId && this.predictedPos) {
      let tx = 0;
      let ty = 0;
      if (input.up) ty -= 1;
      if (input.down) ty += 1;
      if (input.left) tx -= 1;
      if (input.right) tx += 1;

      const hasThrust = tx !== 0 || ty !== 0;
      if (hasThrust) {
        const mag = Math.sqrt(tx * tx + ty * ty);
        tx /= mag;
        ty /= mag;
        this.predictedVel.x += tx * PLAYER_ACCEL * dtSec;
        this.predictedVel.y += ty * PLAYER_ACCEL * dtSec;
        const speed = Math.sqrt(this.predictedVel.x ** 2 + this.predictedVel.y ** 2);
        if (speed > this.predictedMaxSpeed) {
          this.predictedVel.x = (this.predictedVel.x / speed) * this.predictedMaxSpeed;
          this.predictedVel.y = (this.predictedVel.y / speed) * this.predictedMaxSpeed;
        }
        // Boost particles for local player (opposite to thrust direction)
        this.vfx.boostParticle(
          this.predictedPos.x, this.predictedPos.y,
          -tx, -ty, 0x88ddff, PLAYER_RADIUS
        );
      } else {
        this.predictedVel.x *= PLAYER_BRAKE_FRICTION;
        this.predictedVel.y *= PLAYER_BRAKE_FRICTION;
        if (Math.abs(this.predictedVel.x) < 0.1) this.predictedVel.x = 0;
        if (Math.abs(this.predictedVel.y) < 0.1) this.predictedVel.y = 0;
      }

      this.predictedPos.x = Math.max(0, Math.min(WORLD_WIDTH, this.predictedPos.x + this.predictedVel.x * dtSec));
      this.predictedPos.y = Math.max(0, Math.min(WORLD_HEIGHT, this.predictedPos.y + this.predictedVel.y * dtSec));
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
    this.localAimAngle = input.aimAngle;

    this.net.sendInput(input);

    // Play shot sound on local fire (throttled to match server fire rate ~400ms)
    if (input.fire) {
      const now = performance.now();
      if (now - this.lastShotSoundMs >= 400) {
        this.audio.play("weapon_player_shot");
        this.lastShotSoundMs = now;
      }
    }

    // Play missile launch sound on right-click
    if (input.fireMissile) {
      this.audio.play("weapon_player_missile");
    }

    const entities = this.interpolator.getInterpolatedEntities();
    if (entities.length > 0) {
      // Initialize predicted position + velocity from first snapshot containing our entity
      if (selfId && !this.predictedPos) {
        const self = entities.find((e) => e.id === selfId);
        if (self) {
          this.predictedPos = { x: self.pos.x, y: self.pos.y };
          this.predictedVel = { x: self.vel.x, y: self.vel.y };
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
            this.predictedVel.x = serverSelf.vel.x;
            this.predictedVel.y = serverSelf.vel.y;
          } else if (dist > 12) {
            // While moving, apply light correction; while idle, converge faster.
            const alpha = isMoving ? 0.04 : 0.16;
            const maxStep = isMoving ? 4 : 10;
            const step = Math.min(maxStep, dist * alpha);
            this.predictedPos.x += (dx / dist) * step;
            this.predictedPos.y += (dy / dist) * step;
          }

          // Velocity reconciliation: sync when server vel diverges significantly
          // (e.g. after recoil impulse applied server-side that client didn't predict)
          const dvx = serverSelf.vel.x - this.predictedVel.x;
          const dvy = serverSelf.vel.y - this.predictedVel.y;
          const velDiff = Math.sqrt(dvx * dvx + dvy * dvy);
          if (velDiff > 80) {
            this.predictedVel.x = serverSelf.vel.x;
            this.predictedVel.y = serverSelf.vel.y;
          } else if (velDiff > 20) {
            this.predictedVel.x += dvx * 0.15;
            this.predictedVel.y += dvy * 0.15;
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
      this.renderEntities(entities, selfId);
      this.updateTeammateArrows(entities, selfId);
      this.hud.updateHealthBars(entities);
      this.hud.updateDebug(entities, this.latestBotResources);

      // Update XP bar and upgrades for local player
      if (selfId) {
        const selfEntity = entities.find((e) => e.id === selfId);
        if (selfEntity) {
          const currentLevel = selfEntity.level ?? 1;
          if (currentLevel > this.previousLevel) {
            this.audio.play("progress_level_up");
          }
          this.previousLevel = currentLevel;
          this.hud.updateXP(currentLevel, selfEntity.xp ?? 0, selfEntity.xpToNext ?? 0);
          if (selfEntity.upgrades) {
            this.hud.updateUpgrades(selfEntity.upgrades, selfEntity.cannons ?? 1, selfEntity.pendingUpgrades ?? 0);
            // Update predicted max speed cap for client-side prediction
            this.predictedMaxSpeed = PLAYER_MAX_SPEED + (selfEntity.upgrades.speed ?? 0) * SPEED_PER_UPGRADE;
          }
          this.hud.updateMissileCooldown(selfEntity.missileCooldown ?? 0);
        }
      }
    }

    const phase = this.interpolator.getPhaseInfo();
    this.hud.updatePhase(phase);

    if (phase?.matchOver && !this.victoryShown) {
      this.victoryShown = true;
      this.audio.play("state_victory");
      this.hud.showVictory({
        durationSec: (performance.now() - this.matchStartMs) / 1000,
        phase: phase.current,
        remaining: phase.remaining,
      }, () => {
        this.audio.stopMusic();
        this.net.disconnect();
        this.scene.start("NameEntryScene");
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
    let enemyMissileBurst = false;

    for (const entity of entities) {
      currentIds.add(entity.id);
      currentHp.set(entity.id, entity.hp);
      this.previousEntityKinds.set(entity.id, entity.kind);

      // Detect new enemy missiles appearing (missile tower burst) — flag for single play
      if (entity.kind === "missile" && !this.previousEntityIds.has(entity.id) && entity.team === 2) {
        enemyMissileBurst = true;
      }

      // Detect hits (HP decreased)
      const prevHp = this.previousEntityHp.get(entity.id);
      if (prevHp !== undefined && entity.hp < prevHp) {
        this.vfx.hitFlash(entity.id);
        // Play hit sound for local player
        if (entity.id === this.net.selfEntityId) {
          this.audio.play("player_hit");
        }
      }
    }

    if (enemyMissileBurst) {
      this.audio.play("weapon_enemy_missile_burst");
    }

    // Detect deaths (entity disappeared)
    for (const id of this.previousEntityIds) {
      if (!currentIds.has(id)) {
        const lastHp = this.previousEntityHp.get(id);
        // Only explode if it was alive before (not a bullet that expired)
        if (lastHp !== undefined && lastHp > 0) {
          const sprite = this.entitySprites.get(id);
          if (sprite) {
            const explosionColor = sprite instanceof Phaser.GameObjects.Arc
              ? sprite.fillColor
              : getColorByKind(this.previousEntityKinds.get(id) ?? "");
            this.vfx.explosion(sprite.x, sprite.y, explosionColor, 10);

            // Play death sound based on entity kind
            const deadKind = this.previousEntityKinds.get(id);
            if (id === this.net.selfEntityId) {
              this.audio.play("player_death");
            } else if (deadKind === "tower" || deadKind === "missile_tower") {
              this.audio.play("enemy_tower_destroy");
            } else if (deadKind === "minion_ship" || deadKind === "phantom_ship") {
              this.audio.play("enemy_death_small");
            }

            if (deadKind === "sub_base") {
              this.audio.play("enemy_subbase_destroy");
            }

            // Sub-base death: smaller chain explosions
            if (this.previousEntityKinds.get(id) === "sub_base") {
              const pos = { x: sprite.x, y: sprite.y };
              const timings = [100, 250, 450, 650];
              for (const delay of timings) {
                this.time.delayedCall(delay, () => {
                  const ox = (Math.random() - 0.5) * 80;
                  const oy = (Math.random() - 0.5) * 80;
                  this.vfx.explosion(pos.x + ox, pos.y + oy, 0xcc4400, 40);
                });
              }
            }

            // Dreadnought death: big chain explosions
            if (this.previousEntityKinds.get(id) === "dreadnought") {
              const pos = { x: sprite.x, y: sprite.y };
              const timings = [80, 200, 380, 560, 750, 950];
              for (const delay of timings) {
                this.time.delayedCall(delay, () => {
                  const ox = (Math.random() - 0.5) * 120;
                  const oy = (Math.random() - 0.5) * 120;
                  this.vfx.explosion(pos.x + ox, pos.y + oy, 0xcc0000, 30);
                });
              }
            }

            // Mine detonation: small flash explosion
            if (this.previousEntityKinds.get(id) === "mine") {
              this.vfx.explosion(sprite.x, sprite.y, 0xff6600, 12);
            }

            // Mothership death: chain explosions over ~2 s before Nemesis arrives
            if (this.previousEntityKinds.get(id) === "mothership") {
              const pos = { x: sprite.x, y: sprite.y };
              const timings = [120, 300, 520, 740, 960, 1180, 1400, 1650, 1900];
              for (const delay of timings) {
                this.time.delayedCall(delay, () => {
                  const ox = (Math.random() - 0.5) * 140;
                  const oy = (Math.random() - 0.5) * 140;
                  this.vfx.explosion(pos.x + ox, pos.y + oy, 0xff00ff, 100);
                });
              }
            }
          }
        }
      }
    }

    this.previousEntityIds = currentIds;
    this.previousEntityHp = currentHp;
  }

  private renderEntities(entities: InterpolatedEntity[], selfId?: string | null): void {
    const activeIds = new Set<string>();

    for (const entity of entities) {
      activeIds.add(entity.id);

      let sprite = this.entitySprites.get(entity.id);
      if (!sprite) {
        sprite = this.createEntitySprite(entity);
        this.entitySprites.set(entity.id, sprite);
        // Spawn telegraph for non-projectile, non-orb entities
        if (entity.kind !== "bullet" && entity.kind !== "missile" && entity.kind !== "energy_orb") {
          this.vfx.spawnTelegraph(entity.pos.x, entity.pos.y, getRadius(entity.kind));
        }
        // Nemesis arrival: large explosion effect at spawn point
        if (entity.kind === "nemesis") {
          this.vfx.explosion(entity.pos.x, entity.pos.y, 0xaa00ff, 30);
        }
      }

      sprite.setPosition(entity.pos.x, entity.pos.y);

      // Missile particle trail
      if (entity.kind === "missile") {
        this.vfx.missileTrail(entity.pos.x, entity.pos.y);
      }

      // Boost particles for moving AI entities and remote players
      if (entity.kind === "minion_ship" || entity.kind === "nemesis" || entity.kind === "phantom_ship" || entity.kind === "dreadnought" ||
          (entity.kind === "player_ship" && entity.id !== selfId)) {
        const spd = Math.sqrt(entity.vel.x * entity.vel.x + entity.vel.y * entity.vel.y);
        if (spd > BOOST_PARTICLE_THRESHOLD) {
          const color = entity.team === 1 ? 0x88ddff : 0xff8844;
          this.vfx.boostParticle(
            entity.pos.x, entity.pos.y,
            -entity.vel.x / spd, -entity.vel.y / spd,
            color, PLAYER_RADIUS
          );
        }
      }

      // Apply hit flash tint (Arc only — Image sprites use tint instead)
      if (sprite instanceof Phaser.GameObjects.Arc) {
        if (this.vfx.isFlashing(entity.id)) {
          sprite.setFillStyle(0xffffff);
        } else {
          sprite.setFillStyle(getColor(entity));
        }
      } else if (sprite instanceof Phaser.GameObjects.Image) {
        if (this.vfx.isFlashing(entity.id)) {
          sprite.setTintFill(0xffffff);
        } else {
          sprite.clearTint();
        }
      }

      // Tower rotation — image points up (−π/2), offset by +π/2 to align with aimAngle
      if (entity.kind === "tower" || entity.kind === "missile_tower") {
        sprite.setRotation((entity.aimAngle ?? 0) + Math.PI / 2);
      }

      // Plasma bullet / missile / minion / phantom rotation — image points up, rotate to match travel direction
      if ((entity.kind === "bullet" || entity.kind === "missile" || entity.kind === "minion_ship" || entity.kind === "phantom_ship") && sprite instanceof Phaser.GameObjects.Image) {
        const travelAngle = Math.atan2(entity.vel.y, entity.vel.x);
        sprite.setRotation(travelAngle + Math.PI / 2);
      }

      // Cannon barrels for player ships
      if (entity.kind === "player_ship") {
        const cannons = entity.cannons ?? 1;
        const existingRects = this.cannonSprites.get(entity.id);
        if (!existingRects || existingRects.length !== cannons) {
          this.createOrUpdateCannons(entity.id, cannons);
        }
        const aimAngle =
          entity.id === selfId ? this.localAimAngle : (entity.aimAngle ?? 0);
        this.updateCannonPositions(entity.id, entity.pos, aimAngle, cannons);
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
        const cannons = this.cannonSprites.get(id);
        if (cannons) {
          cannons.forEach((r) => r.destroy());
          this.cannonSprites.delete(id);
        }
      }
    }
  }

  private createOrUpdateCannons(entityId: string, cannons: number): void {
    const old = this.cannonSprites.get(entityId);
    if (old) {
      old.forEach((r) => r.destroy());
    }
    const rects: Phaser.GameObjects.Rectangle[] = [];
    for (let i = 0; i < cannons; i++) {
      const rect = this.add.rectangle(0, 0, CANNON_WIDTH, CANNON_LENGTH, 0x888888);
      rect.setDepth(0.5); // above ship circle, below labels
      rects.push(rect);
    }
    this.cannonSprites.set(entityId, rects);
  }

  private updateCannonPositions(
    entityId: string,
    pos: { x: number; y: number },
    aimAngle: number,
    cannons: number
  ): void {
    const rects = this.cannonSprites.get(entityId);
    if (!rects || rects.length !== cannons) return;

    const half = (cannons - 1) / 2;
    const perpAngle = aimAngle + Math.PI / 2;
    const forwardOffset = CANNON_LENGTH / 2;

    for (let i = 0; i < cannons; i++) {
      const lateralOffset = (i - half) * CANNON_OFFSET_LATERAL;
      // Spread cannons angularly to match bullet spread
      const cannonAngle = aimAngle + (i - half) * CANNON_SPREAD_ANGLE;

      const cx =
        pos.x +
        Math.cos(cannonAngle) * forwardOffset +
        Math.cos(perpAngle) * lateralOffset;
      const cy =
        pos.y +
        Math.sin(cannonAngle) * forwardOffset +
        Math.sin(perpAngle) * lateralOffset;

      rects[i].setPosition(cx, cy);
      rects[i].setRotation(cannonAngle + Math.PI / 2);
    }
  }

  private createEntitySprite(entity: Entity): Phaser.GameObjects.Arc | Phaser.GameObjects.Image {
    if (entity.kind === "tower") {
      const radius = getRadius("tower");
      const img = this.add.image(entity.pos.x, entity.pos.y, "tower");
      img.setDisplaySize(radius * 2, radius * 2);
      return img;
    }

    if (entity.kind === "missile_tower") {
      const radius = getRadius("missile_tower");
      const img = this.add.image(entity.pos.x, entity.pos.y, "rocket_tower");
      img.setDisplaySize(radius * 2.5, radius * 2.5);
      return img;
    }

    if (entity.kind === "nemesis") {
      const radius = getRadius("nemesis"); // 38 → 76px display size
      const img = this.add.image(entity.pos.x, entity.pos.y, "nemesis");
      img.setDisplaySize(radius * 2, radius * 2);
      return img;
    }

    if (entity.kind === "minion_ship") {
      const img = this.add.image(entity.pos.x, entity.pos.y, "minion");
      img.setDisplaySize(36, 36);
      return img;
    }

    if (entity.kind === "sub_base") {
      const r = getRadius("sub_base");
      const circle = this.add.circle(entity.pos.x, entity.pos.y, r, 0xcc4400);
      circle.setStrokeStyle(3, 0xff6600);
      return circle;
    }

    if (entity.kind === "dreadnought") {
      const r = getRadius("dreadnought");
      const circle = this.add.circle(entity.pos.x, entity.pos.y, r, 0xcc0000);
      circle.setStrokeStyle(3, 0xff2222);
      return circle;
    }

    if (entity.kind === "mine") {
      const r = getRadius("mine");
      const circle = this.add.circle(entity.pos.x, entity.pos.y, r, 0xff6600);
      circle.setAlpha(0.6);
      circle.setStrokeStyle(1, 0xff4400);
      return circle;
    }

    if (entity.kind === "phantom_ship") {
      // Use the custom sprite if the asset was loaded, otherwise fall back to a tinted circle.
      if (this.textures.exists("phantom") && !this.textures.get("phantom").key.startsWith("__")) {
        const img = this.add.image(entity.pos.x, entity.pos.y, "phantom");
        img.setDisplaySize(32, 32);
        return img;
      }
      // Fallback: small purple circle until the asset is added
      const r = getRadius("phantom_ship");
      return this.add.circle(entity.pos.x, entity.pos.y, r, 0x8844ff);
    }

    if (entity.kind === "missile") {
      const img = this.add.image(entity.pos.x, entity.pos.y, "rocket");
      img.setDisplaySize(35, 70);
      img.setDepth(8); // above trail particles (depth 7)
      return img;
    }

    if (entity.kind === "bullet" && entity.ownerKind === "dreadnought") {
      const r = 12;
      const circle = this.add.circle(entity.pos.x, entity.pos.y, r, 0xff2200);
      circle.setStrokeStyle(2, 0xff8800);
      circle.setDepth(8);
      return circle;
    }

    if (entity.kind === "bullet" && entity.ownerKind === "tower") {
      const img = this.add.image(entity.pos.x, entity.pos.y, "blue_plasma");
      img.setDisplaySize(20, 40);
      return img;
    }

    if (entity.kind === "player_ship") {
      const idx = (entity.playerIndex ?? 1) - 1;
      const key = PLAYER_SHIP_TEXTURES[idx % PLAYER_SHIP_TEXTURES.length];
      const img = this.add.image(entity.pos.x, entity.pos.y, key);
      img.setDisplaySize(56, 56);
      return img;
    }

    const color = getColor(entity);
    const radius = getRadius(entity.kind);
    const circle = this.add.circle(entity.pos.x, entity.pos.y, radius, color);
    if (entity.kind === "energy_orb") {
      circle.setAlpha(0.7);
      circle.setDepth(-0.5); // below ships but above grid
    }
    return circle;
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

const PLAYER_COLORS = [0x88ff00, 0x00ddcc, 0xff8800, 0xff44aa, 0xffee00, 0xffffff, 0x003399, 0x222222];
const PLAYER_SHIP_TEXTURES = [
  "spaceship_lime_green", "spaceship_cyan_teal", "spaceship_orange", "spaceship_pink",
  "spaceship_yellow", "spaceship_white", "spaceship_navy", "spaceship_black",
] as const;

function getColorByKind(kind: string): number {
  switch (kind) {
    case "player_ship": return 0x88ddff;
    case "bullet": return 0xff4444;
    case "missile": return 0xff8800;
    case "minion_ship": return 0xff6644;
    case "tower": return 0xff2222;
    case "missile_tower": return 0xff8800;
    case "mothership": return 0xff00ff;
    case "nemesis": return 0xaa00ff;
    case "phantom_ship": return 0x8844ff;
    case "sub_base": return 0xcc4400;
    case "dreadnought": return 0xcc0000;
    case "mine": return 0xff6600;
    case "energy_orb": return 0x00ffcc;
    default: return 0xffffff;
  }
}

function getColor(entity: Entity): number {
  switch (entity.kind) {
    case "player_ship": {
      const idx = (entity.playerIndex ?? 1) - 1;
      return PLAYER_COLORS[idx % PLAYER_COLORS.length];
    }
    case "bullet": return entity.team === 1 ? 0xffff44 : 0xff4444;
    case "missile": return 0xff8800;
    case "minion_ship": return 0xff6644;
    case "tower": return 0xff2222;
    case "missile_tower": return 0xff8800;
    case "mothership": return 0xff00ff;
    case "nemesis": return 0xaa00ff;
    case "phantom_ship": return 0x8844ff;
    case "sub_base": return 0xcc4400;
    case "dreadnought": return 0xcc0000;
    case "mine": return 0xff6600;
    case "energy_orb": return 0x00ffcc;
    default: return 0xffffff;
  }
}

function getRadius(kind: string): number {
  switch (kind) {
    case "player_ship": return 16;
    case "bullet": return 4;
    case "missile": return 6;
    case "minion_ship": return 12;
    case "tower": return 35;
    case "missile_tower": return 24;
    case "mothership": return 40;
    case "nemesis": return 38;
    case "phantom_ship": return 10;
    case "sub_base": return 30;
    case "dreadnought": return 36;
    case "mine": return 10;
    case "energy_orb": return ORB_RADIUS;
    default: return 8;
  }
}
