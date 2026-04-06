import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./config/gameConfig";
import { isMobileGameplayDevice } from "./core/device";
import "./style.css";
import { GameScene } from "./scenes/GameScene";
import { UIScene } from "./scenes/UIScene";

const isMobile = isMobileGameplayDevice();
const targetWidth = isMobile ? GAME_HEIGHT : GAME_WIDTH;
const targetHeight = isMobile ? GAME_WIDTH : GAME_HEIGHT;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: targetWidth,
  height: targetHeight,
  pixelArt: true,
  antialias: false,
  backgroundColor: "#111827",
  render: {
    roundPixels: true,
    pixelArt: true,
    antialias: false,
  },
  physics: {
    default: "arcade",
    arcade: {
      debug: false,
    },
  },
  scale: {
    mode: isMobile ? Phaser.Scale.RESIZE : Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene, UIScene],
});

if (isMobile) {
  document.body.classList.add("mobile-portrait");
}

void game;
