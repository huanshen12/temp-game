import Phaser from "phaser";

export type PassiveDropKind =
  | "ammo_refund"
  | "heal_on_kill"
  | "phase_clock"
  | "emergency_shield"
  | "swift_steps"
  | "reload_module"
  | "scavenger_core"
  | "giant_rounds"
  | "hunter_mark"
  | "threat_sensor";

export class PassiveDrop {
  public readonly kind: PassiveDropKind;
  public readonly title: string;
  public readonly description: string;
  public readonly sprite: Phaser.GameObjects.Arc;

  public constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    kind: PassiveDropKind,
    title: string,
    description: string,
  ) {
    this.kind = kind;
    this.title = title;
    this.description = description;
    const colorByKind: Record<PassiveDropKind, number> = {
      ammo_refund: 0x60a5fa,
      heal_on_kill: 0x34d399,
      phase_clock: 0xc084fc,
      emergency_shield: 0xfbbf24,
      swift_steps: 0x22d3ee,
      reload_module: 0x93c5fd,
      scavenger_core: 0x4ade80,
      giant_rounds: 0xfb7185,
      hunter_mark: 0xf97316,
      threat_sensor: 0x67e8f9,
    };
    const color = colorByKind[kind];
    this.sprite = scene.add.circle(x, y, 11, color, 0.95);
    scene.physics.add.existing(this.sprite);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
  }
}
