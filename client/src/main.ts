import Phaser from "phaser";
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from "shared";
import { NameEntryScene } from "./name-entry.js";
import { LobbyScene } from "./lobby.js";
import { GameScene } from "./game.js";

new Phaser.Game({
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    max: {
      width: VIEWPORT_WIDTH * 1.2,
      height: VIEWPORT_HEIGHT * 1.2,
    },
  },
  scene: [NameEntryScene, LobbyScene, GameScene],
  parent: document.body,
});
