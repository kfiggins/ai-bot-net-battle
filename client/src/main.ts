import Phaser from "phaser";
import { WORLD_WIDTH, WORLD_HEIGHT } from "shared";
import { LobbyScene } from "./lobby.js";
import { GameScene } from "./game.js";

new Phaser.Game({
  type: Phaser.AUTO,
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  scene: [LobbyScene, GameScene],
  parent: document.body,
});
