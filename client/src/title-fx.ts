import Phaser from "phaser";

const TITLE = "AI BOT NET BATTLE";
const FONT_SIZE = 48;
const GLITCH_CHARS = "!@#$%&*01";
const LETTER_STAGGER_MS = 90;
const REVEAL_START_MS = 200;
const GLITCH_DURATION_MS = 60;
const REVEAL_TOTAL_MS = REVEAL_START_MS + TITLE.length * LETTER_STAGGER_MS + 400;

/** How long to wait between random idle glitches (ms) */
const IDLE_GLITCH_MIN_MS = 2500;
const IDLE_GLITCH_MAX_MS = 5000;

/** Indices of non-space characters eligible for idle glitch */
const GLITCHABLE_INDICES = [...TITLE]
  .map((ch, i) => (ch !== " " ? i : -1))
  .filter((i) => i >= 0);

export class AnimatedTitle {
  private scene: Phaser.Scene;
  private letters: Phaser.GameObjects.Text[] = [];
  private basePositions: { x: number; y: number }[] = [];
  private gfx: Phaser.GameObjects.Graphics;
  private elapsed = 0;
  private revealComplete = false;
  private titleWidth = 0;
  private titleLeft = 0;
  private cx: number;
  private cy: number;

  static create(scene: Phaser.Scene, cx: number, cy: number): AnimatedTitle {
    return new AnimatedTitle(scene, cx, cy);
  }

  private constructor(scene: Phaser.Scene, cx: number, cy: number) {
    this.scene = scene;
    this.cx = cx;
    this.cy = cy;

    // Measure monospace character width
    const measure = scene.add.text(0, 0, "M", {
      fontSize: `${FONT_SIZE}px`,
      fontFamily: "monospace",
      fontStyle: "bold",
    });
    const charWidth = measure.width;
    measure.destroy();

    this.titleWidth = charWidth * TITLE.length;
    this.titleLeft = cx - this.titleWidth / 2;

    // Graphics for the expanding cursor line
    this.gfx = scene.add.graphics().setDepth(4);

    // Create individual letter text objects (all hidden initially)
    for (let i = 0; i < TITLE.length; i++) {
      const x = this.titleLeft + i * charWidth + charWidth / 2;
      const y = cy;
      this.basePositions.push({ x, y });

      const letter = scene.add
        .text(x, y, TITLE[i], {
          fontSize: `${FONT_SIZE}px`,
          color: "#00ff88",
          fontFamily: "monospace",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(5);

      this.letters.push(letter);
    }

    // Schedule letter-by-letter reveal
    this.scheduleReveal();
  }

  private scheduleReveal(): void {
    for (let i = 0; i < TITLE.length; i++) {
      if (TITLE[i] === " ") {
        this.scene.time.addEvent({
          delay: REVEAL_START_MS + i * LETTER_STAGGER_MS,
          callback: () => {
            this.letters[i].setAlpha(1);
          },
        });
        continue;
      }

      // Glitch phase: show random character in cyan
      this.scene.time.addEvent({
        delay: REVEAL_START_MS + i * LETTER_STAGGER_MS,
        callback: () => {
          const glitchChar =
            GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
          this.letters[i]
            .setText(glitchChar)
            .setAlpha(1)
            .setScale(1.3)
            .setColor("#00ddff");
        },
      });

      // Resolve phase: correct character in green
      this.scene.time.addEvent({
        delay: REVEAL_START_MS + i * LETTER_STAGGER_MS + GLITCH_DURATION_MS,
        callback: () => {
          this.letters[i]
            .setText(TITLE[i])
            .setScale(1.0)
            .setColor("#00ff88");
        },
      });
    }

    // Mark reveal complete and schedule first idle glitch
    this.scene.time.addEvent({
      delay: REVEAL_TOTAL_MS,
      callback: () => {
        this.revealComplete = true;
        this.scheduleIdleGlitch();
      },
    });
  }

  /** Schedule a single random letter to glitch, then schedule the next one */
  private scheduleIdleGlitch(): void {
    const delay =
      IDLE_GLITCH_MIN_MS +
      Math.random() * (IDLE_GLITCH_MAX_MS - IDLE_GLITCH_MIN_MS);

    this.scene.time.addEvent({
      delay,
      callback: () => {
        this.glitchRandomLetter();
        this.scheduleIdleGlitch();
      },
    });
  }

  /** Glitch a single random letter: blink out → glitch char → resolve back */
  private glitchRandomLetter(): void {
    const idx =
      GLITCHABLE_INDICES[
        Math.floor(Math.random() * GLITCHABLE_INDICES.length)
      ];
    const letter = this.letters[idx];

    // Blink out
    letter.setAlpha(0);

    // After a brief blank, show glitch character
    this.scene.time.addEvent({
      delay: 80,
      callback: () => {
        const glitchChar =
          GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
        letter.setText(glitchChar).setAlpha(1).setScale(1.3).setColor("#00ddff");
      },
    });

    // Resolve back to correct character
    this.scene.time.addEvent({
      delay: 80 + GLITCH_DURATION_MS,
      callback: () => {
        letter.setText(TITLE[idx]).setScale(1.0).setColor("#00ff88");
      },
    });
  }

  update(delta: number): void {
    this.elapsed += delta;
    this.gfx.clear();

    if (!this.revealComplete) {
      this.drawRevealCursor();
    }
  }

  /** Expanding horizontal line during the entry reveal */
  private drawRevealCursor(): void {
    if (this.elapsed > REVEAL_START_MS) {
      // After initial expand, draw a faint static line at full width
      this.gfx.lineStyle(2, 0x00ff88, 0.2);
      this.gfx.lineBetween(
        this.titleLeft - 20,
        this.cy + 30,
        this.titleLeft + this.titleWidth + 20,
        this.cy + 30,
      );
      return;
    }

    // Expanding phase: line grows from center outward
    const progress = this.elapsed / REVEAL_START_MS;
    const halfSpan = (this.titleWidth / 2 + 20) * progress;
    const alpha = 0.3 + 0.7 * (1 - progress);

    this.gfx.lineStyle(2, 0x00ff88, alpha);
    this.gfx.lineBetween(
      this.cx - halfSpan,
      this.cy + 30,
      this.cx + halfSpan,
      this.cy + 30,
    );
  }

  destroy(): void {
    for (const letter of this.letters) letter.destroy();
    this.gfx.destroy();
  }
}
