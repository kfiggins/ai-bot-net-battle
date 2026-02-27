import Phaser from "phaser";

interface Star {
  x: number;
  y: number;
  radius: number;
  color: number;
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  twinkleDepth: number;
}

interface Planet {
  x: number;
  y: number;
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

const STAR_TIERS = [
  { count: 60, minR: 0.5, maxR: 1.0, minAlpha: 0.3, maxAlpha: 0.6 },
  { count: 35, minR: 1.0, maxR: 1.5, minAlpha: 0.4, maxAlpha: 0.7 },
  { count: 20, minR: 1.5, maxR: 2.0, minAlpha: 0.6, maxAlpha: 0.9 },
  { count: 5, minR: 2.0, maxR: 2.5, minAlpha: 0.7, maxAlpha: 1.0 },
];

const PLANET_PALETTES = [
  { core: 0xcc4422, ring: 0xff6633 },
  { core: 0x3366aa, ring: 0x66aadd },
  { core: 0xddaa44, ring: 0xffcc66 },
  { core: 0x6633aa, ring: 0x9966cc },
  { core: 0x228844, ring: 0x44cc77 },
];

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

  constructor(scene: Phaser.Scene, width: number, height: number) {
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(-10);

    // Generate stars
    this.stars = [];
    for (const tier of STAR_TIERS) {
      for (let i = 0; i < tier.count; i++) {
        this.stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius: rand(tier.minR, tier.maxR),
          color: pickStarColor(),
          baseAlpha: rand(tier.minAlpha, tier.maxAlpha),
          twinkleSpeed: rand(0.5, 3.5),
          twinklePhase: Math.random() * Math.PI * 2,
          twinkleDepth: rand(0.2, 0.4),
        });
      }
    }

    // Generate planets (3–5)
    this.planets = [];
    const planetCount = 3 + Math.floor(Math.random() * 3);
    const margin = 100;
    const minDist = 150;

    for (let i = 0; i < planetCount; i++) {
      let x: number, y: number;
      let attempts = 0;
      do {
        x = rand(margin, width - margin);
        y = rand(margin, height - margin);
        attempts++;
      } while (
        attempts < 50 &&
        this.planets.some((p) => Math.hypot(p.x - x, p.y - y) < minDist)
      );

      const palette = PLANET_PALETTES[i % PLANET_PALETTES.length];
      this.planets.push({
        x,
        y,
        radius: rand(4, 8),
        coreColor: palette.core,
        ringColor: palette.ring,
        pulseSpeed: rand(0.8, 2.3),
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  update(dt: number): void {
    this.elapsed += dt;
    const t = this.elapsed * 0.001; // seconds

    this.gfx.clear();

    // Draw stars
    for (const s of this.stars) {
      const alpha = Math.max(
        0.05,
        Math.min(
          1,
          s.baseAlpha +
            s.twinkleDepth * Math.sin(t * s.twinkleSpeed + s.twinklePhase),
        ),
      );
      this.gfx.fillStyle(s.color, alpha);
      this.gfx.fillCircle(s.x, s.y, s.radius);
    }

    // Draw planets
    for (const p of this.planets) {
      const glowAlpha =
        0.1 + 0.1 * Math.sin(t * p.pulseSpeed + p.pulsePhase);

      // Outer glow ring
      this.gfx.fillStyle(p.ringColor, glowAlpha);
      this.gfx.fillCircle(p.x, p.y, p.radius + 2);

      // Body
      this.gfx.fillStyle(p.coreColor, 0.8);
      this.gfx.fillCircle(p.x, p.y, p.radius);

      // Highlight dot (top-left for light source feel)
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
