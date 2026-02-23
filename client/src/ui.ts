import Phaser from "phaser";
import { Entity, PhaseInfo } from "shared";

export class HUD {
  private scene: Phaser.Scene;
  private phaseText: Phaser.GameObjects.Text;
  private objectiveText: Phaser.GameObjects.Text;
  private matchOverText: Phaser.GameObjects.Text;
  private debugText: Phaser.GameObjects.Text;
  private victoryPanel: Phaser.GameObjects.Rectangle;
  private victoryTitle: Phaser.GameObjects.Text;
  private victoryStats: Phaser.GameObjects.Text;
  private returnButton: Phaser.GameObjects.Text;
  private healthBars: Map<string, Phaser.GameObjects.Graphics> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.phaseText = scene.add.text(10, 10, "", {
      fontSize: "18px",
      color: "#ffffff",
      fontFamily: "monospace",
      backgroundColor: "#00000088",
      padding: { x: 8, y: 4 },
    });
    this.phaseText.setDepth(100);
    this.phaseText.setScrollFactor(0);

    this.objectiveText = scene.add.text(10, 40, "", {
      fontSize: "14px",
      color: "#cccccc",
      fontFamily: "monospace",
      backgroundColor: "#00000088",
      padding: { x: 8, y: 4 },
    });
    this.objectiveText.setDepth(100);
    this.objectiveText.setScrollFactor(0);

    this.matchOverText = scene.add.text(
      scene.cameras.main.width / 2,
      scene.cameras.main.height / 2,
      "",
      {
        fontSize: "48px",
        color: "#00ff00",
        fontFamily: "monospace",
        backgroundColor: "#000000cc",
        padding: { x: 20, y: 10 },
      }
    );
    this.matchOverText.setDepth(200);
    this.matchOverText.setScrollFactor(0);
    this.matchOverText.setOrigin(0.5);
    this.matchOverText.setVisible(false);

    this.debugText = scene.add.text(scene.cameras.main.width - 10, 10, "", {
      fontSize: "12px",
      color: "#9ad1ff",
      fontFamily: "monospace",
      backgroundColor: "#00000088",
      padding: { x: 8, y: 4 },
      align: "right",
    });
    this.debugText.setDepth(120);
    this.debugText.setScrollFactor(0);
    this.debugText.setOrigin(1, 0);

    const cx = scene.cameras.main.width / 2;
    const cy = scene.cameras.main.height / 2;
    this.victoryPanel = scene.add.rectangle(cx, cy, 520, 280, 0x000000, 0.82);
    this.victoryPanel.setDepth(260).setScrollFactor(0).setVisible(false);

    this.victoryTitle = scene.add.text(cx, cy - 92, "VICTORY", {
      fontSize: "44px",
      color: "#00ff88",
      fontFamily: "monospace",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(270).setScrollFactor(0).setVisible(false);

    this.victoryStats = scene.add.text(cx, cy - 26, "", {
      fontSize: "18px",
      color: "#d8ffe9",
      fontFamily: "monospace",
      align: "center",
    }).setOrigin(0.5).setDepth(270).setScrollFactor(0).setVisible(false);

    this.returnButton = scene.add.text(cx, cy + 88, "RETURN TO LOBBY", {
      fontSize: "22px",
      color: "#111122",
      fontFamily: "monospace",
      fontStyle: "bold",
      backgroundColor: "#00ff88",
      padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setDepth(280).setScrollFactor(0).setVisible(false)
      .setInteractive({ useHandCursor: true });

    this.returnButton.on("pointerover", () => this.returnButton.setStyle({ backgroundColor: "#44ffaa" }));
    this.returnButton.on("pointerout", () => this.returnButton.setStyle({ backgroundColor: "#00ff88" }));
  }

  updatePhase(phase: PhaseInfo | undefined): void {
    if (!phase) {
      this.phaseText.setText("");
      this.objectiveText.setText("");
      this.matchOverText.setVisible(false);
      return;
    }

    const shieldStatus = phase.mothershipShielded ? " [SHIELDED]" : " [VULNERABLE]";
    this.phaseText.setText(`Phase ${phase.current}${shieldStatus}`);

    const objectives = phase.objectives.join("\n");
    const remaining = Object.entries(phase.remaining)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    this.objectiveText.setText(`${objectives}\n${remaining}`);

    if (phase.matchOver) {
      this.matchOverText.setText("VICTORY!");
      this.matchOverText.setVisible(true);
    }
  }

  showVictory(stats: { durationSec: number; phase: number; remaining: Record<string, number> }, onReturn: () => void): void {
    const remainingText = Object.keys(stats.remaining).length > 0
      ? Object.entries(stats.remaining).map(([k, v]) => `${k}: ${v}`).join(" | ")
      : "none";

    this.victoryStats.setText([
      `match time: ${Math.round(stats.durationSec)}s`,
      `final phase: ${stats.phase}`,
      `remaining: ${remainingText}`,
    ].join("\n"));

    this.victoryPanel.setVisible(true);
    this.victoryTitle.setVisible(true);
    this.victoryStats.setVisible(true);
    this.returnButton.setVisible(true);
    this.returnButton.removeAllListeners("pointerdown");
    this.returnButton.on("pointerdown", onReturn);
  }

  updateDebug(entities: Entity[]): void {
    const counts = {
      player_ship: 0,
      minion_ship: 0,
      tower: 0,
      mothership: 0,
      bullet: 0,
    };

    for (const e of entities) {
      if (e.kind in counts) {
        (counts as Record<string, number>)[e.kind]++;
      }
    }

    this.debugText.setText([
      "DEBUG",
      `players: ${counts.player_ship}`,
      `minions: ${counts.minion_ship}`,
      `towers: ${counts.tower}`,
      `boss: ${counts.mothership}`,
      `bullets: ${counts.bullet}`,
    ].join("\n"));
  }

  updateHealthBars(entities: Entity[]): void {
    const activeIds = new Set<string>();

    for (const entity of entities) {
      if (entity.kind === "bullet") continue;

      const maxHp = getMaxHp(entity.kind);
      if (maxHp <= 0) continue;
      if (entity.hp >= maxHp) continue; // Don't show full health bars

      activeIds.add(entity.id);

      let gfx = this.healthBars.get(entity.id);
      if (!gfx) {
        gfx = this.scene.add.graphics();
        gfx.setDepth(50);
        this.healthBars.set(entity.id, gfx);
      }

      const barWidth = 30;
      const barHeight = 4;
      const x = entity.pos.x - barWidth / 2;
      const y = entity.pos.y - getBarOffset(entity.kind);
      const ratio = Math.max(0, entity.hp / maxHp);

      gfx.clear();
      // Background
      gfx.fillStyle(0x333333, 0.8);
      gfx.fillRect(x, y, barWidth, barHeight);
      // Health fill
      const fillColor = ratio > 0.5 ? 0x00ff00 : ratio > 0.25 ? 0xffff00 : 0xff0000;
      gfx.fillStyle(fillColor, 0.9);
      gfx.fillRect(x, y, barWidth * ratio, barHeight);
    }

    // Remove health bars for entities no longer present
    for (const [id, gfx] of this.healthBars) {
      if (!activeIds.has(id)) {
        gfx.destroy();
        this.healthBars.delete(id);
      }
    }
  }

  destroy(): void {
    this.phaseText.destroy();
    this.objectiveText.destroy();
    this.matchOverText.destroy();
    this.debugText.destroy();
    this.victoryPanel.destroy();
    this.victoryTitle.destroy();
    this.victoryStats.destroy();
    this.returnButton.destroy();
    for (const gfx of this.healthBars.values()) gfx.destroy();
    this.healthBars.clear();
  }
}

function getMaxHp(kind: string): number {
  switch (kind) {
    case "player_ship": return 100;
    case "minion_ship": return 30;
    case "tower": return 100;
    case "mothership": return 500;
    default: return 0;
  }
}

function getBarOffset(kind: string): number {
  switch (kind) {
    case "player_ship": return 22;
    case "minion_ship": return 18;
    case "tower": return 26;
    case "mothership": return 48;
    default: return 16;
  }
}
