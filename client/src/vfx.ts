import Phaser from "phaser";

interface Particle {
  sprite: Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

interface SpawnTelegraph {
  sprite: Phaser.GameObjects.Arc;
  life: number;
  maxLife: number;
}

export class VFXManager {
  private scene: Phaser.Scene;
  private particles: Particle[] = [];
  private telegraphs: SpawnTelegraph[] = [];
  private hitFlashes: Map<string, number> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Burst of particles when an entity dies */
  explosion(x: number, y: number, color: number, count = 8): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 60 + Math.random() * 80;
      const sprite = this.scene.add.circle(x, y, 3, color, 1);
      sprite.setDepth(10);
      this.particles.push({
        sprite,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 400 + Math.random() * 200,
      });
    }
  }

  /** Brief white flash on a hit entity */
  hitFlash(entityId: string): void {
    this.hitFlashes.set(entityId, 100); // 100ms flash duration
  }

  /** Pulsing ring telegraph before an entity spawns */
  spawnTelegraph(x: number, y: number, radius: number): void {
    const sprite = this.scene.add.circle(x, y, radius, 0xffffff, 0);
    sprite.setStrokeStyle(2, 0xffffff, 0.8);
    sprite.setDepth(5);
    this.telegraphs.push({
      sprite,
      life: 0,
      maxLife: 500, // 500ms telegraph
    });
  }

  /** Returns whether this entity should be rendered white (hit flash active) */
  isFlashing(entityId: string): boolean {
    return this.hitFlashes.has(entityId);
  }

  update(dt: number): void {
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.sprite.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      const t = p.life / p.maxLife;
      p.sprite.setPosition(
        p.sprite.x + p.vx * (dt / 1000),
        p.sprite.y + p.vy * (dt / 1000)
      );
      p.sprite.setAlpha(1 - t);
      p.sprite.setScale(1 - t * 0.5);
    }

    // Update telegraphs
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const tel = this.telegraphs[i];
      tel.life += dt;
      if (tel.life >= tel.maxLife) {
        tel.sprite.destroy();
        this.telegraphs.splice(i, 1);
        continue;
      }
      const t = tel.life / tel.maxLife;
      tel.sprite.setAlpha(0.8 * (1 - t));
      tel.sprite.setScale(0.5 + t * 0.5);
    }

    // Update hit flashes
    for (const [id, remaining] of this.hitFlashes) {
      const next = remaining - dt;
      if (next <= 0) {
        this.hitFlashes.delete(id);
      } else {
        this.hitFlashes.set(id, next);
      }
    }
  }

  destroy(): void {
    for (const p of this.particles) p.sprite.destroy();
    for (const t of this.telegraphs) t.sprite.destroy();
    this.particles = [];
    this.telegraphs = [];
    this.hitFlashes.clear();
  }
}
