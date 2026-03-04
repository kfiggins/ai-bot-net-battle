import Phaser from "phaser";
import { Entity, WORLD_WIDTH, WORLD_HEIGHT, VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from "shared";

// Mini-map constants
const MAP_X = 10;
const MAP_Y = 10;
const MAP_SIZE = 160;
const VIEW_RANGE = 2000; // world units visible in each dimension

// Entity kinds to display on the mini-map
const SHOWN_KINDS = new Set([
  "player_ship",
  "tower",
  "missile_tower",
  "sub_base",
  "mothership",
  "nemesis",
  "dreadnought",
]);

export class MiniMap {
  private gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(110);
    this.gfx.setScrollFactor(0);
  }

  update(
    entities: readonly Pick<Entity, "id" | "kind" | "pos" | "team">[],
    playerPos: { x: number; y: number },
    selfId: string | undefined,
  ): void {
    this.gfx.clear();

    // Calculate view bounds centered on player, clamped to world
    let viewLeft = playerPos.x - VIEW_RANGE / 2;
    let viewTop = playerPos.y - VIEW_RANGE / 2;
    viewLeft = Math.max(0, Math.min(WORLD_WIDTH - VIEW_RANGE, viewLeft));
    viewTop = Math.max(0, Math.min(WORLD_HEIGHT - VIEW_RANGE, viewTop));

    // Background
    this.gfx.fillStyle(0x111111, 0.75);
    this.gfx.fillRect(MAP_X, MAP_Y, MAP_SIZE, MAP_SIZE);
    this.gfx.lineStyle(1, 0x00ffcc, 0.6);
    this.gfx.strokeRect(MAP_X, MAP_Y, MAP_SIZE, MAP_SIZE);

    // Viewport rectangle
    const vpLeft = (this.gfx.scene.cameras.main.scrollX - viewLeft) / VIEW_RANGE * MAP_SIZE;
    const vpTop = (this.gfx.scene.cameras.main.scrollY - viewTop) / VIEW_RANGE * MAP_SIZE;
    const vpW = VIEWPORT_WIDTH / VIEW_RANGE * MAP_SIZE;
    const vpH = VIEWPORT_HEIGHT / VIEW_RANGE * MAP_SIZE;
    this.gfx.lineStyle(1, 0xffffff, 0.3);
    this.gfx.strokeRect(
      MAP_X + Math.max(0, vpLeft),
      MAP_Y + Math.max(0, vpTop),
      Math.min(vpW, MAP_SIZE - Math.max(0, vpLeft)),
      Math.min(vpH, MAP_SIZE - Math.max(0, vpTop)),
    );

    // Draw entities
    for (const e of entities) {
      if (!SHOWN_KINDS.has(e.kind)) continue;

      const mx = MAP_X + (e.pos.x - viewLeft) / VIEW_RANGE * MAP_SIZE;
      const my = MAP_Y + (e.pos.y - viewTop) / VIEW_RANGE * MAP_SIZE;

      // Skip if outside mini-map bounds
      if (mx < MAP_X || mx > MAP_X + MAP_SIZE || my < MAP_Y || my > MAP_Y + MAP_SIZE) continue;

      if (e.kind === "player_ship") {
        if (e.id === selfId) {
          // Self — white dot
          this.gfx.fillStyle(0xffffff, 1);
          this.gfx.fillCircle(mx, my, 3);
        } else if (e.team === 1) {
          // Friendly player — cyan
          this.gfx.fillStyle(0x00ffcc, 1);
          this.gfx.fillCircle(mx, my, 2.5);
        }
      } else if (e.kind === "tower" || e.kind === "missile_tower") {
        // Towers — orange squares
        this.gfx.fillStyle(0xff8800, 1);
        this.gfx.fillRect(mx - 2, my - 2, 4, 4);
      } else if (e.kind === "sub_base") {
        // Substations — yellow
        this.gfx.fillStyle(0xffcc00, 1);
        this.gfx.fillCircle(mx, my, 4);
      } else if (e.kind === "mothership") {
        // Mothership — red, large
        this.gfx.fillStyle(0xff0000, 1);
        this.gfx.fillCircle(mx, my, 5);
      } else if (e.kind === "nemesis") {
        // Nemesis — magenta
        this.gfx.fillStyle(0xff00ff, 1);
        this.gfx.fillCircle(mx, my, 4);
      } else if (e.kind === "dreadnought") {
        // Dreadnought — dark red
        this.gfx.fillStyle(0xcc0000, 1);
        this.gfx.fillCircle(mx, my, 3);
      }
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
