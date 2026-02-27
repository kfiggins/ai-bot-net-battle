import Phaser from "phaser";

interface Star {
  sx: number; // 3D X offset from center
  sy: number; // 3D Y offset from center
  z: number; // depth (MAX_Z = far, MIN_Z = near)
  color: number;
  prevScreenX: number;
  prevScreenY: number;
}

interface Planet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  coreColor: number;
  ringColor: number;
  pulseSpeed: number;
  pulsePhase: number;
}

const STAR_COLORS = [
  { color: 0xffffff, weight: 40 },
  { color: 0xaaccff, weight: 20 },
  { color: 0xffeeaa, weight: 15 },
  { color: 0x8888ff, weight: 10 },
  { color: 0xffcc88, weight: 10 },
  { color: 0xff8866, weight: 5 },
];
const TOTAL_WEIGHT = STAR_COLORS.reduce((s, c) => s + c.weight, 0);

const PLANET_PALETTES = [
  { core: 0xcc4422, ring: 0xff6633 },
  { core: 0x3366aa, ring: 0x66aadd },
  { core: 0xddaa44, ring: 0xffcc66 },
  { core: 0x6633aa, ring: 0x9966cc },
  { core: 0x228844, ring: 0x44cc77 },
];

const STAR_COUNT = 200;
const MAX_Z = 1000;
const MIN_Z = 1;
const SPEED = 0.3; // z units per ms
const FOCAL_LENGTH = 300;

function pickStarColor(): number {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const sc of STAR_COLORS) {
    roll -= sc.weight;
    if (roll <= 0) return sc.color;
  }
  return STAR_COLORS[0].color;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class Starfield {
  private gfx: Phaser.GameObjects.Graphics;
  private stars: Star[];
  private planets: Planet[];
  private elapsed = 0;
  private width: number;
  private height: number;
  private cx: number;
  private cy: number;

  constructor(scene: Phaser.Scene, width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cx = width / 2;
    this.cy = height / 2;
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(-10);

    // Generate stars spread in 3D space
    this.stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      this.stars.push(this.spawnStar(true));
    }

    // Generate planets (3–5)
    this.planets = [];
    const planetCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < planetCount; i++) {
      const palette = PLANET_PALETTES[i % PLANET_PALETTES.length];
      const angle = Math.random() * Math.PI * 2;
      const drift = rand(8, 20); // pixels per second
      this.planets.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.cos(angle) * drift,
        vy: Math.sin(angle) * drift,
        radius: rand(4, 8),
        coreColor: palette.core,
        ringColor: palette.ring,
        pulseSpeed: rand(0.8, 2.3),
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  private spawnStar(randomDepth: boolean): Star {
    const spread = this.width;
    const sx = rand(-spread, spread);
    const sy = rand(-spread, spread);
    const z = randomDepth ? rand(MIN_Z, MAX_Z) : MAX_Z;
    const screenX = this.cx + (sx / z) * FOCAL_LENGTH;
    const screenY = this.cy + (sy / z) * FOCAL_LENGTH;
    return {
      sx,
      sy,
      z,
      color: pickStarColor(),
      prevScreenX: screenX,
      prevScreenY: screenY,
    };
  }

  update(dt: number): void {
    this.elapsed += dt;
    const t = this.elapsed * 0.001;

    this.gfx.clear();

    // Update and draw stars
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];

      // Store previous screen position
      s.prevScreenX = this.cx + (s.sx / s.z) * FOCAL_LENGTH;
      s.prevScreenY = this.cy + (s.sy / s.z) * FOCAL_LENGTH;

      // Move star toward camera
      s.z -= SPEED * dt;

      // Respawn if past camera
      if (s.z < MIN_Z) {
        this.stars[i] = this.spawnStar(false);
        continue;
      }

      // Project to screen
      const screenX = this.cx + (s.sx / s.z) * FOCAL_LENGTH;
      const screenY = this.cy + (s.sy / s.z) * FOCAL_LENGTH;

      // Off-screen? Respawn
      if (
        screenX < -50 ||
        screenX > this.width + 50 ||
        screenY < -50 ||
        screenY > this.height + 50
      ) {
        this.stars[i] = this.spawnStar(false);
        continue;
      }

      // Size and brightness based on depth
      const depthRatio = 1 - s.z / MAX_Z; // 0 = far, 1 = near
      const radius = 0.5 + depthRatio * 2.5;
      const alpha = Math.max(0.05, Math.min(1, 0.1 + depthRatio * 0.9));

      // Draw streak line (motion trail) for close/fast stars
      const dx = screenX - s.prevScreenX;
      const dy = screenY - s.prevScreenY;
      const streakLen = Math.hypot(dx, dy);

      if (streakLen > 2) {
        this.gfx.lineStyle(Math.max(0.5, radius * 0.6), s.color, alpha * 0.6);
        this.gfx.beginPath();
        this.gfx.moveTo(s.prevScreenX, s.prevScreenY);
        this.gfx.lineTo(screenX, screenY);
        this.gfx.strokePath();
      }

      // Draw star dot
      this.gfx.fillStyle(s.color, alpha);
      this.gfx.fillCircle(screenX, screenY, radius);
    }

    // Update and draw planets
    const dtSec = dt * 0.001;
    for (const p of this.planets) {
      // Drift across screen
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;

      // Wrap around edges
      if (p.x < -p.radius * 2) p.x = this.width + p.radius;
      if (p.x > this.width + p.radius * 2) p.x = -p.radius;
      if (p.y < -p.radius * 2) p.y = this.height + p.radius;
      if (p.y > this.height + p.radius * 2) p.y = -p.radius;

      const glowAlpha =
        0.1 + 0.1 * Math.sin(t * p.pulseSpeed + p.pulsePhase);

      // Outer glow ring
      this.gfx.fillStyle(p.ringColor, glowAlpha);
      this.gfx.fillCircle(p.x, p.y, p.radius + 2);

      // Body
      this.gfx.fillStyle(p.coreColor, 0.8);
      this.gfx.fillCircle(p.x, p.y, p.radius);

      // Highlight dot
      this.gfx.fillStyle(0xffffff, 0.25);
      this.gfx.fillCircle(
        p.x - p.radius * 0.25,
        p.y - p.radius * 0.25,
        p.radius * 0.4,
      );
    }
  }

  destroy(): void {
    this.gfx.destroy();
    this.stars = [];
    this.planets = [];
  }
}
