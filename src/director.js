const profiles = {
  DREAMING: [0.13, 0.18, 0.18, 1, 0.22, 0.2],
  INTRO: [0.22, 0.2, 0.25, 0.92, 0.28, 0.24],
  BUILD: [0.62, 0.72, 0.62, 0.68, 0.76, 0.68],
  DROP: [1, 1, 1, 0.46, 1, 1],
  CLIMAX: [1, 0.85, 0.9, 0.5, 1, 0.8],
  BREAK: [0.16, 0.12, 0.2, 1.28, 0.18, 0.1],
  FLOW: [0.52, 0.48, 0.5, 0.72, 0.55, 0.42],
  OUTRO: [0.2, 0.15, 0.2, 1.1, 0.2, 0.18],
};
const keys = ["intensity", "motion", "bloom", "fog", "heart", "camera"];
export class Director {
  constructor() {
    this.state = Object.fromEntries(
      keys.map((key, i) => [key, profiles.DREAMING[i]]),
    );
    this.section = "DREAMING";
    this.release = 0;
    this.anticipation = 0;
    this.lastDrop = -100;
    this.clock = 0;
  }
  update(dt, section, context = {}) {
    this.clock += dt;
    const changed = section !== this.section;
    const drop =
      changed &&
      (section === "DROP" || section === "CLIMAX") &&
      this.clock - this.lastDrop > 7 &&
      !context.seeking;
    if (drop) {
      this.release = 1;
      this.lastDrop = this.clock;
    }
    this.section = section;
    const target = profiles[section] || profiles.FLOW;
    keys.forEach((key, i) => {
      this.state[key] +=
        (target[i] - this.state[key]) *
        (1 - Math.exp(-dt / (drop ? 0.22 : 1.3)));
    });
    const tension =
      (context.next === "DROP" || context.next === "CLIMAX") &&
      context.remaining < 5
        ? 1 - context.remaining / 5
        : section === "BUILD"
          ? 0.35
          : 0;
    this.anticipation +=
      (tension - this.anticipation) * (1 - Math.exp(-dt / 0.7));
    this.release *= Math.exp(-dt / 2.3);
    return {
      ...this.state,
      anticipation: this.anticipation,
      release: this.release,
      drop,
    };
  }
}
