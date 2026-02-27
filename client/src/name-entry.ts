import Phaser from "phaser";
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from "shared";
import { Starfield } from "./starfield.js";

const CLIENT_VERSION = "v0.0.2";
const MAX_NAME_LENGTH = 20;

export class NameEntryScene extends Phaser.Scene {
  private starfield!: Starfield;
  private nameInput = "";
  private inputText!: Phaser.GameObjects.Text;
  private cursorText!: Phaser.GameObjects.Text;
  private errorText!: Phaser.GameObjects.Text;
  private joinButton!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "NameEntryScene" });
  }

  create(): void {
    const cx = VIEWPORT_WIDTH / 2;
    this.cameras.main.setBackgroundColor("#111122");
    this.starfield = new Starfield(this, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    // Title
    this.add
      .text(cx, 130, "AI BOT NET BATTLE", {
        fontSize: "48px",
        color: "#00ff88",
        fontFamily: "monospace",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Prompt
    this.add
      .text(cx, 220, "ENTER YOUR CALLSIGN", {
        fontSize: "18px",
        color: "#888888",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    // Input box
    this.add.rectangle(cx, 290, 320, 52, 0x222233).setOrigin(0.5);
    this.add.rectangle(cx, 290, 316, 48, 0x1a1a2e).setOrigin(0.5);

    this.inputText = this.add
      .text(cx - 145, 290, "", {
        fontSize: "24px",
        color: "#ffffff",
        fontFamily: "monospace",
      })
      .setOrigin(0, 0.5);

    // Blinking cursor
    this.cursorText = this.add
      .text(cx - 145, 290, "|", {
        fontSize: "24px",
        color: "#00ff88",
        fontFamily: "monospace",
      })
      .setOrigin(0, 0.5);

    this.time.addEvent({
      delay: 530,
      loop: true,
      callback: () => {
        this.cursorText.setVisible(!this.cursorText.visible);
      },
    });

    // Error / hint text
    this.errorText = this.add
      .text(cx, 328, "", {
        fontSize: "14px",
        color: "#ff4444",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    // JOIN button
    this.joinButton = this.add
      .text(cx, 410, "JOIN GAME", {
        fontSize: "28px",
        color: "#111122",
        fontFamily: "monospace",
        fontStyle: "bold",
        backgroundColor: "#00ff88",
        padding: { x: 24, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.joinButton.on("pointerover", () => {
      this.joinButton.setStyle({ backgroundColor: "#44ffaa" });
    });
    this.joinButton.on("pointerout", () => {
      this.joinButton.setStyle({ backgroundColor: "#00ff88" });
    });
    this.joinButton.on("pointerdown", () => this.submitName());

    // Room info
    const roomId = window.location.hash.slice(1) || "default";
    this.add
      .text(cx, VIEWPORT_HEIGHT - 50, `Room: ${roomId}`, {
        fontSize: "14px",
        color: "#444466",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    this.add
      .text(cx, VIEWPORT_HEIGHT - 28, `Client ${CLIENT_VERSION}`, {
        fontSize: "13px",
        color: "#6c6ca2",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);
    
    // Pre-fill name from a previous session
    const savedName = this.registry.get("displayName") as string | undefined;
    if (savedName) {
      this.nameInput = savedName;
      this.updateDisplay();
    }

    // Capture keyboard input
    this.input.keyboard!.on("keydown", this.handleKeyDown, this);
    this.game.canvas.focus();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Backspace") {
      this.nameInput = this.nameInput.slice(0, -1);
      this.errorText.setText("");
    } else if (event.key === "Enter") {
      this.submitName();
    } else if (event.key.length === 1 && this.nameInput.length < MAX_NAME_LENGTH) {
      this.nameInput += event.key;
      this.errorText.setText("");
    }
    this.updateDisplay();
  }

  private updateDisplay(): void {
    this.inputText.setText(this.nameInput);
    this.cursorText.setX(this.inputText.x + this.inputText.width + 2);
  }

  update(_time: number, delta: number): void {
    this.starfield.update(delta);
  }

  private submitName(): void {
    const name = this.nameInput.trim();
    if (name.length === 0) {
      this.errorText.setText("Please enter a callsign");
      return;
    }
    this.registry.set("displayName", name);
    this.scene.start("LobbyScene", { displayName: name });
  }
}
