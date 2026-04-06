import Phaser from "phaser";

export class ExperienceOrb {
  public readonly sprite: Phaser.GameObjects.Arc;
  public readonly value: number;

  public constructor(scene: Phaser.Scene, x: number, y: number, value: number) {
    this.sprite = scene.add.circle(x, y, 8, 0xfacc15, 0.95).setDepth(11);
    this.sprite.setStrokeStyle(2, 0xfef3c7, 0.92);
    scene.physics.add.existing(this.sprite);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setCircle(8);
    body.setAllowGravity(false);
    body.setImmovable(true);
    this.value = value;
  }
}
