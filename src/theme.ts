/** Colours and names for the patisserie look. */

import type { PastryKind } from "./pastries.ts";

export interface Flavor {
  name: string;
  /** Macaron shell colour. */
  shell: string;
  /** Darker edge / shading colour. */
  edge: string;
  /** Filling between the two shells. */
  filling: string;
}

/** What every macaron turns into once it is untangled. */
export const PISTACHIO: Flavor = {
  name: "pistachio",
  shell: "#86d45f",
  edge: "#4f9a35",
  filling: "#fbf3d9",
};

const RASPBERRY: Flavor = { name: "raspberry", shell: "#f48aa8", edge: "#c8506f", filling: "#fff1e6" };
const LAVENDER: Flavor = { name: "lavender", shell: "#bfa6ea", edge: "#8a6cc4", filling: "#fbf4ff" };
const ROSE: Flavor = { name: "rose", shell: "#f5a3c7", edge: "#cc6597", filling: "#fff2f6" };
const BLUEBERRY: Flavor = { name: "blueberry", shell: "#94b2f0", edge: "#5a7bc6", filling: "#f4f6ff" };
const CASSIS: Flavor = { name: "cassis", shell: "#b585d6", edge: "#7d4ea3", filling: "#fbf0ff" };
const STRAWBERRY: Flavor = { name: "strawberry", shell: "#ff8a9a", edge: "#d4505f", filling: "#fff1f0" };

export interface LevelTheme {
  name: string;
  pastry: PastryKind;
  /** Colour of the glaze / icing / shell while tangled. Never green, and never golden (that's the dough). */
  flavor: Flavor;
}

/** One pastry per level, from easy to hard. */
const LEVEL_THEMES: LevelTheme[] = [
  { name: "Macaron", pastry: "macaron", flavor: RASPBERRY },
  { name: "Éclair", pastry: "eclair", flavor: LAVENDER },
  { name: "Croissant", pastry: "croissant", flavor: ROSE },
  { name: "Mille-feuille", pastry: "millefeuille", flavor: BLUEBERRY },
  { name: "Paris-Brest", pastry: "parisbrest", flavor: CASSIS },
  { name: "Saint-Honoré", pastry: "sainthonore", flavor: STRAWBERRY },
  { name: "Croquembouche", pastry: "croquembouche", flavor: RASPBERRY },
];

export function levelTheme(index: number): LevelTheme {
  return LEVEL_THEMES[index % LEVEL_THEMES.length];
}

export function levelName(index: number): string {
  return levelTheme(index).name;
}

export const COLOR = {
  ink: "#5b3a29",
  chocolate: "#6b4130",
  chocolateShine: "rgba(255, 226, 200, 0.35)",
  chocolateActive: "#b0703c",
  raspberry: "#e0446a",
  raspberryShine: "rgba(255, 210, 222, 0.55)",
  jam: "#c8264f",
  solvedLine: "#6fbf4a",
  solvedShine: "rgba(240, 255, 220, 0.6)",
  shadow: "rgba(91, 58, 41, 0.18)",
  face: "#4a2c20",
  blush: "rgba(255, 120, 150, 0.55)",
  flour: "#ffffff",
};

/** Colours for sprinkles and confetti. */
export const SPRINKLES = ["#f48aa8", "#ffd45c", "#86d45f", "#94b2f0", "#bfa6ea", "#ffffff", "#f9b07a"];

/** Little celebration lines for finishing a level. */
export const PRAISE = [
  "Magnifique !",
  "Parfait !",
  "Délicieux !",
  "Ooh là là !",
  "Bravo, chef !",
  "C'est du gâteau !",
  "Très bien !",
];
