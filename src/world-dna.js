export function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let n = value;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function worldDNA(seed, theme) {
  const random = seeded(seed);
  const words = [
    "Velvet",
    "Luminous",
    "Astral",
    "Hidden",
    "Silver",
    "Endless",
    "Lucid",
    "Hushed",
  ];
  const places = [
    "Sanctuary",
    "Echo",
    "Garden",
    "Hollow",
    "Dream",
    "Horizon",
    "Grove",
    "Tide",
  ];
  return {
    id: `SW1-${theme}-${(seed >>> 0).toString(16).toUpperCase().padStart(8, "0")}`,
    name: `${words[Math.floor(random() * words.length)]} ${places[Math.floor(random() * places.length)]}`,
    density: 0.8 + random() * 0.4,
    terrain: 0.8 + random() * 0.45,
    phase: random() * 6.28,
    rare: random() > 0.78,
  };
}

export function parseDNA(text, themes) {
  const match = /^SW1-([A-Z]+)-([0-9A-F]{8})$/i.exec(text.trim());
  const themeIndex = match
    ? themes.findIndex((theme) => theme.code === match[1].toUpperCase())
    : -1;
  if (themeIndex < 0)
    throw new Error("Use a complete World DNA, such as SW1-MOSS-7F920A31.");
  return { themeIndex, seed: parseInt(match[2], 16) >>> 0 };
}
