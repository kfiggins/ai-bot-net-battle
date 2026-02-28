import Phaser from "phaser";
import { Entity, PhaseInfo, Upgrades, MAX_LEVEL, MAX_UPGRADE_PER_STAT, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, MILESTONE_LEVELS, TICK_RATE } from "shared";

export class HUD {
  private scene: Phaser.Scene;
  private phaseText: Phaser.GameObjects.Text;
  private objectiveText: Phaser.GameObjects.Text;
  private matchOverText: Phaser.GameObjects.Text;
  private debugText: Phaser.GameObjects.Text;
  private debugEnabled = true;
  private victoryActive = false;
  private victoryPanel: Phaser.GameObjects.Rectangle;
  private victoryTitle: Phaser.GameObjects.Text;
  private victoryStats: Phaser.GameObjects.Text;
  private returnButton: Phaser.GameObjects.Text;
  private healthBars: Map<string, Phaser.GameObjects.Graphics> = new Map();
  // XP bar elements
  private xpBarGfx: Phaser.GameObjects.Graphics;
  private levelText: Phaser.GameObjects.Text;
  private levelUpText: Phaser.GameObjects.Text;
  private lastLevel = 0;
  private levelUpFlashTimer = 0;
  // Upgrade panel elements
  private upgradePanel: Phaser.GameObjects.Rectangle;
  private upgradePanelTitle: Phaser.GameObjects.Text;
  private upgradeButtons: Phaser.GameObjects.Text[] = [];
  private cannonNotifyText: Phaser.GameObjects.Text;
  private cannonNotifyTimer = 0;
  private cannonCountText: Phaser.GameObjects.Text;
  private lastCannons = 1;
  private onUpgradeChoice: ((stat: string) => void) | null = null;
  private missileCooldownText: Phaser.GameObjects.Text;

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

    // XP bar (bottom-center of screen)
    this.xpBarGfx = scene.add.graphics();
    this.xpBarGfx.setDepth(100).setScrollFactor(0);

    this.levelText = scene.add.text(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT - 28, "Lv. 1", {
      fontSize: "14px",
      color: "#00ffcc",
      fontFamily: "monospace",
      fontStyle: "bold",
    }).setOrigin(0.5, 0).setDepth(101).setScrollFactor(0);

    this.levelUpText = scene.add.text(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2 - 60, "LEVEL UP!", {
      fontSize: "32px",
      color: "#00ffcc",
      fontFamily: "monospace",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(200).setScrollFactor(0).setVisible(false);

    // Upgrade panel (bottom-center, above XP bar)
    const panelW = 440;
    const panelH = 60;
    const panelX = VIEWPORT_WIDTH / 2;
    const panelY = VIEWPORT_HEIGHT - 80;
    this.upgradePanel = scene.add.rectangle(panelX, panelY, panelW, panelH, 0x000000, 0.85)
      .setDepth(150).setScrollFactor(0).setVisible(false);

    this.upgradePanelTitle = scene.add.text(panelX, panelY - 22, "CHOOSE UPGRADE", {
      fontSize: "11px",
      color: "#aaffdd",
      fontFamily: "monospace",
    }).setOrigin(0.5).setDepth(151).setScrollFactor(0).setVisible(false);

    const statLabels = ["DMG", "SPD", "HP", "FIRE"];
    const statKeys = ["damage", "speed", "health", "fire_rate"];
    const btnWidth = 90;
    const totalWidth = statLabels.length * btnWidth + (statLabels.length - 1) * 10;
    const startX = panelX - totalWidth / 2 + btnWidth / 2;

    for (let i = 0; i < statLabels.length; i++) {
      const bx = startX + i * (btnWidth + 10);
      const btn = scene.add.text(bx, panelY + 4, `${statLabels[i]} 0/5`, {
        fontSize: "13px",
        color: "#111122",
        fontFamily: "monospace",
        fontStyle: "bold",
        backgroundColor: "#00ffcc",
        padding: { x: 8, y: 6 },
      }).setOrigin(0.5).setDepth(152).setScrollFactor(0).setVisible(false)
        .setInteractive({ useHandCursor: true });

      const stat = statKeys[i];
      btn.on("pointerover", () => {
        if (btn.getData("enabled")) btn.setStyle({ backgroundColor: "#66ffd9" });
      });
      btn.on("pointerout", () => {
        if (btn.getData("enabled")) btn.setStyle({ backgroundColor: "#00ffcc" });
      });
      btn.on("pointerdown", () => {
        if (btn.getData("enabled") && this.onUpgradeChoice) {
          this.onUpgradeChoice(stat);
        }
      });
      btn.setData("enabled", true);
      this.upgradeButtons.push(btn);
    }

    // Cannon upgrade notification
    this.cannonNotifyText = scene.add.text(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2 - 30, "CANNON UPGRADE!", {
      fontSize: "28px",
      color: "#ffaa00",
      fontFamily: "monospace",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(200).setScrollFactor(0).setVisible(false);

    // Cannon count display (near level text)
    this.cannonCountText = scene.add.text(VIEWPORT_WIDTH / 2 + 120, VIEWPORT_HEIGHT - 28, "", {
      fontSize: "13px",
      color: "#ffaa00",
      fontFamily: "monospace",
      fontStyle: "bold",
    }).setOrigin(0.5, 0).setDepth(101).setScrollFactor(0);

    // Missile cooldown display (bottom-left area)
    this.missileCooldownText = scene.add.text(VIEWPORT_WIDTH / 2 - 160, VIEWPORT_HEIGHT - 28, "MISSILE: READY", {
      fontSize: "12px",
      color: "#ff8800",
      fontFamily: "monospace",
      fontStyle: "bold",
    }).setOrigin(0.5, 0).setDepth(101).setScrollFactor(0);
  }

  updatePhase(phase: PhaseInfo | undefined): void {
    if (!phase) {
      this.phaseText.setText("");
      this.objectiveText.setText("");
      this.matchOverText.setVisible(false);
      return;
    }

    if (this.victoryActive) {
      this.matchOverText.setVisible(false);
    }

    const shieldStatus = phase.mothershipShielded ? " [SHIELDED]" : " [VULNERABLE]";
    this.phaseText.setText(`Phase ${phase.current}${shieldStatus}`);

    const objectives = phase.objectives.join("\n");
    const remaining = Object.entries(phase.remaining)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    this.objectiveText.setText(`${objectives}\n${remaining}`);

    if (phase.matchOver && !this.victoryActive) {
      this.matchOverText.setText("VICTORY!");
      this.matchOverText.setVisible(true);
    }
  }

  updateXP(level: number, xp: number, xpToNext: number): void {
    // Level-up flash
    if (level > this.lastLevel && this.lastLevel > 0) {
      this.levelUpText.setVisible(true);
      this.levelUpFlashTimer = 1500; // ms
    }
    this.lastLevel = level;

    if (this.levelUpFlashTimer > 0) {
      this.levelUpFlashTimer -= 16; // approximate frame time
      if (this.levelUpFlashTimer <= 0) {
        this.levelUpText.setVisible(false);
      }
    }

    // Level text
    const maxed = level >= MAX_LEVEL;
    this.levelText.setText(maxed ? `Lv. ${level} MAX` : `Lv. ${level}`);

    // XP bar
    const barWidth = 200;
    const barHeight = 8;
    const barX = (VIEWPORT_WIDTH - barWidth) / 2;
    const barY = VIEWPORT_HEIGHT - 20;
    const ratio = maxed ? 1 : (xpToNext > 0 ? Math.min(1, xp / xpToNext) : 0);

    this.xpBarGfx.clear();
    // Background
    this.xpBarGfx.fillStyle(0x222222, 0.8);
    this.xpBarGfx.fillRect(barX, barY, barWidth, barHeight);
    // Border
    this.xpBarGfx.lineStyle(1, 0x00ffcc, 0.5);
    this.xpBarGfx.strokeRect(barX, barY, barWidth, barHeight);
    // Fill
    if (ratio > 0) {
      this.xpBarGfx.fillStyle(0x00ffcc, 0.8);
      this.xpBarGfx.fillRect(barX + 1, barY + 1, (barWidth - 2) * ratio, barHeight - 2);
    }
  }

  setUpgradeHandler(handler: (stat: string) => void): void {
    this.onUpgradeChoice = handler;
  }

  updateUpgrades(upgrades: Upgrades, cannons: number, pendingUpgrades: number): void {
    if (this.victoryActive) {
      this.upgradePanel.setVisible(false);
      this.upgradePanelTitle.setVisible(false);
      for (const btn of this.upgradeButtons) btn.setVisible(false);
      this.cannonNotifyText.setVisible(false);
      return;
    }

    const show = pendingUpgrades > 0;
    this.upgradePanel.setVisible(show);
    this.upgradePanelTitle.setVisible(show);
    if (show) {
      this.upgradePanelTitle.setText(`CHOOSE UPGRADE (${pendingUpgrades} point${pendingUpgrades > 1 ? "s" : ""})`);
    }

    const statKeys: (keyof Upgrades)[] = ["damage", "speed", "health", "fire_rate"];
    const statLabels = ["DMG", "SPD", "HP", "FIRE"];
    for (let i = 0; i < this.upgradeButtons.length; i++) {
      const btn = this.upgradeButtons[i];
      btn.setVisible(show);
      if (show) {
        const val = upgrades[statKeys[i]];
        const maxed = val >= MAX_UPGRADE_PER_STAT;
        btn.setText(`${statLabels[i]} ${val}/${MAX_UPGRADE_PER_STAT}`);
        btn.setData("enabled", !maxed);
        if (maxed) {
          btn.setStyle({ backgroundColor: "#444444", color: "#888888" });
          btn.disableInteractive();
        } else {
          btn.setStyle({ backgroundColor: "#00ffcc", color: "#111122" });
          btn.setInteractive({ useHandCursor: true });
        }
      }
    }

    // Cannon milestone notification
    if (cannons > this.lastCannons && this.lastCannons >= 1) {
      this.cannonNotifyText.setVisible(true);
      this.cannonNotifyTimer = 2000;
    }
    this.lastCannons = cannons;

    if (this.cannonNotifyTimer > 0) {
      this.cannonNotifyTimer -= 16;
      if (this.cannonNotifyTimer <= 0) {
        this.cannonNotifyText.setVisible(false);
      }
    }

    // Cannon count display
    if (cannons > 1) {
      this.cannonCountText.setText(`x${cannons}`);
    } else {
      this.cannonCountText.setText("");
    }
  }

  updateMissileCooldown(cooldownTicks: number): void {
    if (this.victoryActive) {
      this.missileCooldownText.setVisible(false);
      return;
    }

    this.missileCooldownText.setVisible(true);
    if (cooldownTicks <= 0) {
      this.missileCooldownText.setText("MISSILE: READY");
      this.missileCooldownText.setColor("#ff8800");
    } else {
      const seconds = Math.ceil(cooldownTicks / TICK_RATE);
      this.missileCooldownText.setText(`MISSILE: ${seconds}s`);
      this.missileCooldownText.setColor("#888888");
    }
  }

  showVictory(stats: { durationSec: number; phase: number; remaining: Record<string, number> }, onReturn: () => void): void {
    this.victoryActive = true;

    const remainingText = Object.keys(stats.remaining).length > 0
      ? Object.entries(stats.remaining).map(([k, v]) => `${k}: ${v}`).join(" | ")
      : "none";

    this.victoryStats.setText([
      `match time: ${Math.round(stats.durationSec)}s`,
      `final phase: ${stats.phase}`,
      `remaining: ${remainingText}`,
    ].join("\n"));

    this.matchOverText.setVisible(false);
    this.upgradePanel.setVisible(false);
    this.upgradePanelTitle.setVisible(false);
    for (const btn of this.upgradeButtons) btn.setVisible(false);
    this.cannonNotifyText.setVisible(false);
    this.missileCooldownText.setVisible(false);

    this.victoryPanel.setVisible(true);
    this.victoryTitle.setVisible(true);
    this.victoryStats.setVisible(true);
    this.returnButton.setVisible(true);
    this.returnButton.removeAllListeners("pointerdown");
    this.returnButton.on("pointerdown", onReturn);
  }

  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
    this.debugText.setVisible(enabled);
  }

  updateDebug(entities: Entity[], botResources?: number): void {
    if (!this.debugEnabled) return;
    const counts = {
      player_ship: 0,
      minion_ship: 0,
      tower: 0,
      missile_tower: 0,
      mothership: 0,
      sub_base: 0,
      bullet: 0,
      missile: 0,
      energy_orb: 0,
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
      `missile towers: ${counts.missile_tower}`,
      `sub-bases: ${counts.sub_base}`,
      `boss: ${counts.mothership}`,
      `bullets: ${counts.bullet}`,
      `missiles: ${counts.missile}`,
      `orbs: ${counts.energy_orb}`,
      `bot resources: ${botResources ?? "n/a"}`,
    ].join("\n"));
  }

  updateHealthBars(entities: Entity[]): void {
    const activeIds = new Set<string>();

    for (const entity of entities) {
      if (entity.kind === "bullet") continue;

      const maxHp = getMaxHp(entity);
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
    this.xpBarGfx.destroy();
    this.levelText.destroy();
    this.levelUpText.destroy();
    this.upgradePanel.destroy();
    this.upgradePanelTitle.destroy();
    for (const btn of this.upgradeButtons) btn.destroy();
    this.upgradeButtons = [];
    this.cannonNotifyText.destroy();
    this.cannonCountText.destroy();
    this.missileCooldownText.destroy();
    for (const gfx of this.healthBars.values()) gfx.destroy();
    this.healthBars.clear();
  }
}

function getMaxHp(entity: Entity): number {
  switch (entity.kind) {
    case "player_ship": {
      const healthUpgrades = entity.upgrades?.health ?? 0;
      return 100 + healthUpgrades * 20; // PLAYER_HP + HEALTH_PER_UPGRADE * upgrades
    }
    case "minion_ship": return 30;
    case "phantom_ship": return 20;
    case "tower": return 100;
    case "missile_tower": return 150;
    case "mothership": return 500;
    case "sub_base": return 300;
    case "dreadnought": return 800;
    default: return 0;
  }
}

function getBarOffset(kind: string): number {
  switch (kind) {
    case "player_ship": return 22;
    case "minion_ship": return 18;
    case "phantom_ship": return 16;
    case "tower": return 26;
    case "missile_tower": return 30;
    case "mothership": return 48;
    case "sub_base": return 36;
    case "dreadnought": return 42;
    default: return 16;
  }
}
