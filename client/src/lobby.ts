import Phaser from "phaser";
import { AgentControlMode, LobbyPlayer, VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from "shared";
import { NetClient } from "./net.js";
import { Starfield } from "./starfield.js";

const PLAYER_COLORS = [0x88ff00, 0x00ddcc, 0xff8800, 0xff44aa, 0xffee00, 0xffffff, 0x003399, 0x222222];
const CLIENT_VERSION = "v0.0.1+jitterfix2";

function colorToHex(color: number): string {
  return "#" + color.toString(16).padStart(6, "0");
}

export class LobbyScene extends Phaser.Scene {
  private starfield!: Starfield;
  private net!: NetClient;
  private playerListTexts: Phaser.GameObjects.Text[] = [];
  private playerDots: Phaser.GameObjects.Arc[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private startButton!: Phaser.GameObjects.Text;
  private modeToggle!: Phaser.GameObjects.Text;
  private modeLabel!: Phaser.GameObjects.Text;
  private devLogToggle!: Phaser.GameObjects.Text;
  private devLogLabel!: Phaser.GameObjects.Text;
  private mode: AgentControlMode = "builtin_fake_ai";
  private players: LobbyPlayer[] = [];
  private displayName = "Player";

  constructor() {
    super({ key: "LobbyScene" });
  }

  init(data: { displayName?: string }): void {
    if (data?.displayName) {
      this.displayName = data.displayName;
      this.registry.set("displayName", data.displayName);
    } else {
      // Returning from game — recover stored name
      this.displayName = this.registry.get("displayName") ?? "Player";
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#111122");
    this.starfield = new Starfield(this, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

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
      this.net.sendStartGame(this.mode);
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

    this.modeLabel = this.add
      .text(VIEWPORT_WIDTH - 24, VIEWPORT_HEIGHT - 72, "Agent Mode", {
        fontSize: "13px",
        color: "#7d7db7",
        fontFamily: "monospace",
      })
      .setOrigin(1, 0.5);

    this.modeToggle = this.add
      .text(VIEWPORT_WIDTH - 24, VIEWPORT_HEIGHT - 46, "OFF", {
        fontSize: "18px",
        color: "#111122",
        fontFamily: "monospace",
        fontStyle: "bold",
        backgroundColor: "#66cc88",
        padding: { x: 14, y: 6 },
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });

    this.modeToggle.on("pointerdown", () => {
      this.mode = this.mode === "builtin_fake_ai" ? "external_agent" : "builtin_fake_ai";
      this.refreshModeUI();
    });

    this.devLogLabel = this.add
      .text(VIEWPORT_WIDTH - 24, VIEWPORT_HEIGHT - 118, "Dev Log", {
        fontSize: "13px",
        color: "#7d7db7",
        fontFamily: "monospace",
      })
      .setOrigin(1, 0.5);

    this.devLogToggle = this.add
      .text(VIEWPORT_WIDTH - 24, VIEWPORT_HEIGHT - 92, "ON", {
        fontSize: "18px",
        color: "#111122",
        fontFamily: "monospace",
        fontStyle: "bold",
        backgroundColor: "#ffae42",
        padding: { x: 14, y: 6 },
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });

    this.devLogToggle.on("pointerdown", () => {
      if (!this.net) return;
      this.net.debugLogEnabled = !this.net.debugLogEnabled;
      localStorage.setItem("debugLogEnabled", this.net.debugLogEnabled ? "1" : "0");
      this.refreshDevLogUI();
    });

    // Set up networking — reuse existing NetClient if returning from game
    const existing = this.registry.get("net") as NetClient | undefined;
    if (existing) {
      this.net = existing;
    } else {
      this.net = new NetClient();
      this.registry.set("net", this.net);
    }
    this.mode = this.net.currentMode;
    const storedDebug = localStorage.getItem("debugLogEnabled");
    if (storedDebug !== null) {
      this.net.debugLogEnabled = storedDebug === "1";
    }
    this.refreshModeUI();
    this.refreshDevLogUI();

    this.net.setWelcomeHandler((lobby) => {
      this.mode = lobby.mode;
      this.refreshModeUI();
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
      this.mode = msg.mode;
      this.refreshModeUI();
      this.players = msg.players;
      this.renderPlayerList();
    });

    this.net.setMatchStartHandler(() => {
      this.scene.start("GameScene");
    });

    // Only connect if we don't already have a connection
    if (!this.net.roomId) {
      this.net.connect(roomId, this.displayName);
    } else {
      // Already connected (returning from game) — show lobby immediately
      this.statusText.setText("Waiting for players...");
      this.startButton.setVisible(true);
    }
  }

  update(_time: number, delta: number): void {
    this.starfield.update(delta);
  }

  private refreshModeUI(): void {
    if (!this.modeToggle || !this.modeLabel) return;

    const isAgent = this.mode === "external_agent";
    this.modeToggle.setText(isAgent ? "ON" : "OFF");
    this.modeToggle.setStyle({
      backgroundColor: isAgent ? "#ffae42" : "#66cc88",
      color: "#111122",
    });
    this.modeLabel.setText(`Agent Mode (${isAgent ? "Live" : "Kids"})`);
  }

  private refreshDevLogUI(): void {
    if (!this.devLogToggle || !this.devLogLabel || !this.net) return;
    const on = this.net.debugLogEnabled;
    this.devLogToggle.setText(on ? "ON" : "OFF");
    this.devLogToggle.setStyle({
      backgroundColor: on ? "#ffae42" : "#66cc88",
      color: "#111122",
    });
    this.devLogLabel.setText(`Dev Log (${on ? "Shown" : "Hidden"})`);
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
