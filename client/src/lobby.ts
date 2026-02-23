import Phaser from "phaser";
import { LobbyPlayer, VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from "shared";
import { NetClient } from "./net.js";

const PLAYER_COLORS = [0x00ff88, 0x44aaff, 0xffaa00, 0xff44ff];
const CLIENT_VERSION = "v0.0.1+winfix1";

function colorToHex(color: number): string {
  return "#" + color.toString(16).padStart(6, "0");
}

export class LobbyScene extends Phaser.Scene {
  private net!: NetClient;
  private playerListTexts: Phaser.GameObjects.Text[] = [];
  private playerDots: Phaser.GameObjects.Arc[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private startButton!: Phaser.GameObjects.Text;
  private players: LobbyPlayer[] = [];

  constructor() {
    super({ key: "LobbyScene" });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#111122");

    // Title
    this.add
      .text(VIEWPORT_WIDTH / 2, 120, "AI BOT NET BATTLE", {
        fontSize: "48px",
        color: "#00ff88",
        fontFamily: "monospace",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Subtitle
    this.statusText = this.add
      .text(VIEWPORT_WIDTH / 2, 180, "Connecting...", {
        fontSize: "18px",
        color: "#888888",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    // "Players" header
    this.add
      .text(VIEWPORT_WIDTH / 2, 260, "PLAYERS", {
        fontSize: "16px",
        color: "#666666",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    // Divider line under "PLAYERS"
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0x333344);
    gfx.lineBetween(VIEWPORT_WIDTH / 2 - 120, 280, VIEWPORT_WIDTH / 2 + 120, 280);

    // Start button
    this.startButton = this.add
      .text(VIEWPORT_WIDTH / 2, 520, "START GAME", {
        fontSize: "28px",
        color: "#111122",
        fontFamily: "monospace",
        fontStyle: "bold",
        backgroundColor: "#00ff88",
        padding: { x: 24, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);

    this.startButton.on("pointerover", () => {
      this.startButton.setStyle({ backgroundColor: "#44ffaa" });
    });
    this.startButton.on("pointerout", () => {
      this.startButton.setStyle({ backgroundColor: "#00ff88" });
    });
    this.startButton.on("pointerdown", () => {
      this.net.sendStartGame();
      this.startButton.setText("STARTING...");
      this.startButton.disableInteractive();
    });

    // Room info (bottom)
    const roomId = window.location.hash.slice(1) || "default";
    this.add
      .text(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT - 50, `Room: ${roomId}`, {
        fontSize: "14px",
        color: "#444466",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    this.add
      .text(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT - 28, `Client ${CLIENT_VERSION}`, {
        fontSize: "13px",
        color: "#6c6ca2",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    // Set up networking — reuse existing NetClient if returning from game
    const existing = this.registry.get("net") as NetClient | undefined;
    if (existing) {
      this.net = existing;
    } else {
      this.net = new NetClient();
      this.registry.set("net", this.net);
    }

    this.net.setWelcomeHandler((lobby) => {
      if (lobby.state === "in_progress") {
        // Game already started — skip lobby
        this.scene.start("GameScene");
        return;
      }
      this.statusText.setText("Waiting for players...");
      this.startButton.setVisible(true);
      // Re-render player list now that we know our playerIndex
      if (this.players.length > 0) {
        this.renderPlayerList();
      }
    });

    this.net.setLobbyUpdateHandler((msg) => {
      this.players = msg.players;
      this.renderPlayerList();
    });

    this.net.setMatchStartHandler(() => {
      this.scene.start("GameScene");
    });

    // Only connect if we don't already have a connection
    if (!this.net.roomId) {
      this.net.connect(roomId);
    } else {
      // Already connected (returning from game) — show lobby immediately
      this.statusText.setText("Waiting for players...");
      this.startButton.setVisible(true);
    }
  }

  private renderPlayerList(): void {
    // Clear old list
    for (const t of this.playerListTexts) t.destroy();
    for (const d of this.playerDots) d.destroy();
    this.playerListTexts = [];
    this.playerDots = [];

    const startY = 300;
    const spacing = 40;

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const y = startY + i * spacing;
      const color = PLAYER_COLORS[(p.playerIndex - 1) % PLAYER_COLORS.length];

      // Color dot
      const dot = this.add.circle(VIEWPORT_WIDTH / 2 - 80, y, 8, color);
      this.playerDots.push(dot);

      // Player name + "(you)" indicator
      const isSelf = p.playerIndex === this.net.selfPlayerIndex;
      const label = isSelf ? `${p.name}  (you)` : p.name;
      const text = this.add.text(VIEWPORT_WIDTH / 2 - 60, y, label, {
        fontSize: "22px",
        color: colorToHex(color),
        fontFamily: "monospace",
      }).setOrigin(0, 0.5);
      this.playerListTexts.push(text);
    }

    this.statusText.setText(
      this.players.length === 0
        ? "Waiting for players..."
        : `${this.players.length} player${this.players.length > 1 ? "s" : ""} connected`
    );
  }
}
