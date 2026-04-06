import Phaser from "phaser";

export class ExperienceOrb {
  public readonly sprite: Phaser.GameObjects.Arc;
  public readonly value: number;

  public constructor(scene: Phaser.Scene, x: number, y: number, value: number) {
    this.sprite = scene.add.circle(x, y, 6, 0x22d3ee);
    scene.physics.add.existing(this.sprite);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setCircle(6);
    body.setAllowGravity(false);
    body.setImmovable(true);
    this.value = value;
  }
}
