import Phaser from "phaser";
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from "shared";
import { NameEntryScene } from "./name-entry.js";
import { LobbyScene } from "./lobby.js";
import { GameScene } from "./game.js";

new Phaser.Game({
  type: Phaser.AUTO,
  width: VIEWPORT_WIDTH,
  height: VIEWPORT_HEIGHT,
  scene: [NameEntryScene, LobbyScene, GameScene],
  parent: document.body,
});
