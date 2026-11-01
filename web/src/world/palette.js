// Pastel renk paleti. Bütün dünya renkleri buradan gelir.
import { Color } from "three";

const c = (hex) => new Color(hex);

export const SKY = {
  day: { top: c("#7ec4ea"), horizon: c("#d9eef7") },
  sunset: { top: c("#8b8fd6"), horizon: c("#f7b98f") },
  night: { top: c("#141c3a"), horizon: c("#2e3766") },
};

export const WATER = c("#3aa6c4");
export const DEEP_WATER = c("#1d6a93");
export const SEABED = c("#3d8fa6");
export const SAND = c("#e9d5a6");
export const WET_SAND = c("#cfb98c");
export const GRASS = c("#8dbd66");
export const GRASS_DARK = c("#6f9f52");
export const HILL = c("#7b9f58");
export const ROCK = c("#9d9a8b");
export const ROAD = c("#efe4d6");
export const AVENUE = c("#e3d6c6");
export const PLAZA = c("#f6eee6");
export const FIELD = [c("#e9d27a"), c("#c9dc7e"), c("#e6b86f")];

export const WALLS = ["#f7b2bd", "#ffd59e", "#a8e0d1", "#b5d3f3", "#d4c1f0", "#fbe3a6", "#f9c9a8", "#c8e6b4"].map(c);
export const ROOFS = ["#e07a6f", "#d4886a", "#c96f7c", "#7a9cc6", "#8a7fc0", "#5fa79a"].map(c);
export const TREES = ["#6dbb6a", "#5aa95f", "#86c97a", "#4f9d6c", "#9ccf6e"].map(c);
// Gerçekçi giysi, ten ve saç renkleri.
export const CLOTHES = ["#f2f2ee", "#2f4a6d", "#b8423c", "#d9a441", "#6f7d4a", "#8b8f96", "#8fb6d9", "#2b2b30", "#3e8a86", "#d98ca0"].map(c);
export const BOTTOMS = ["#4a6589", "#2c3a52", "#2a2a2e", "#bfa983", "#6e7178", "#5a4636"].map(c);
export const SKIN = ["#f3d2bd", "#e2b393", "#c48f6a", "#9a6847", "#6b4632"].map(c);
export const HAIR = ["#1f1a17", "#3b2a20", "#5e4128", "#8c5a32", "#d2b278", "#b9b6b1"].map(c);

export const WINDOW_DAY = c("#9fb7cc");
export const WINDOW_NIGHT = c("#ffd98a");
export const WINDOW_DARK = c("#3a4664");
