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
        maxLife: 800 + Math.random() * 200,
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
      maxLife: 1000, // 500ms telegraph
    });
  }

  /** Thruster boost particles — emit each frame while entity is thrusting.
   *  dirX/dirY is the direction particles travel (opposite to thrust direction).
   *  offset shifts the spawn point along dir so particles appear behind the entity. */
  boostParticle(x: number, y: number, dirX: number, dirY: number, color: number, offset = 0): void {
    const spawnX = x + dirX * offset;
    const spawnY = y + dirY * offset;
    for (let i = 0; i < 2; i++) {
      const spread = (Math.random() - 0.5) * 0.5;
      const baseAngle = Math.atan2(dirY, dirX) + spread;
      const speed = 40 + Math.random() * 60;
      const radius = 1 + Math.random() * 2;
      const sprite = this.scene.add.circle(
        spawnX + (Math.random() - 0.5) * 6,
        spawnY + (Math.random() - 0.5) * 6,
        radius, color, 0.8
      );
      sprite.setDepth(8);
      this.particles.push({
        sprite,
        vx: Math.cos(baseAngle) * speed,
        vy: Math.sin(baseAngle) * speed,
        life: 0,
        maxLife: 220 + Math.random() * 100,
      });
    }
  }

  /** Continuous particle trail behind a missile — call every rendered frame */
  missileTrail(x: number, y: number): void {
    for (let i = 0; i < 2; i++) {
      const color = i === 0 ? 0xff6600 : 0xffdd00;
      const radius = 1 + Math.random() * 2;
      const sprite = this.scene.add.circle(
        x + (Math.random() - 0.5) * 6,
        y + (Math.random() - 0.5) * 6,
        radius, color, 0.9
      );
      sprite.setDepth(7);
      this.particles.push({ sprite, vx: 0, vy: 0, life: 0, maxLife: 500 + Math.random() * 80 });
    }
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
