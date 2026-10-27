import "@fontsource/fredoka/latin-400.css";
import "@fontsource/fredoka/latin-600.css";
import "@fontsource/pacifico/latin-400.css";
import "./style.css";
import { sound } from "./audio.ts";
import { JamFinale } from "./finale.ts";
import { Game, type Status } from "./game.ts";
import { LEVEL_COUNT, buildLevel } from "./levels.ts";
import { PRAISE, levelName, levelTheme } from "./theme.ts";

const STORAGE_KEY = "plateau-progress";

interface Progress {
  /** Highest level index the player may open. */
  unlocked: number;
  /** Fewest moves used to solve each level, by level index. */
  best: Record<number, number>;
}

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Progress;
      return { unlocked: Math.min(p.unlocked ?? 0, LEVEL_COUNT - 1), best: p.best ?? {} };
    }
  } catch {
    // Bad or missing data: start fresh.
  }
  return { unlocked: 0, best: {} };
}

function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Storage may be blocked (private mode etc.). The game still works.
  }
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>("canvas");
const prevBtn = $<HTMLButtonElement>("prev");
const nextBtn = $<HTMLButtonElement>("next");
const resetBtn = $<HTMLButtonElement>("reset");
const muteBtn = $<HTMLButtonElement>("mute");
const musicBtn = $<HTMLButtonElement>("music");
const levelNumber = $("level-number");
const levelNameLabel = $("level-name");
const progressFill = $("progress-fill");
const progressLabel = $("progress-label");
const crossingsChip = $("crossings-chip");
const crossingsLabel = $("crossings");
const movesLabel = $("moves");
const intro = $("intro");
const introNumber = $("intro-number");
const introName = $("intro-name");
const banner = $("banner");
const bannerTitle = $("banner-title");
const bannerSub = $("banner-sub");
const bannerNext = $<HTMLButtonElement>("banner-next");
const finale = new JamFinale($("finale"));
const finaleSub = $("finale-sub");

const progress = loadProgress();
let current = progress.unlocked;
let lastCrossings = -1;
let bannerTimer = 0;

/** Replay a CSS animation on an element. */
function bump(el: HTMLElement): void {
  el.classList.remove("bump");
  void el.offsetWidth; // forces the browser to restart the animation
  el.classList.add("bump");
}

function hideBanner(): void {
  clearTimeout(bannerTimer);
  banner.classList.add("hidden");
  finale.hide();
}

function refreshNav(): void {
  const done = progress.best[current] !== undefined ? " ✓" : "";
  levelNumber.textContent = `Level ${current + 1} / ${LEVEL_COUNT}${done}`;
  levelNameLabel.textContent = levelName(current);
  prevBtn.disabled = current === 0;
  nextBtn.disabled = current >= progress.unlocked;
}

function onStatus(status: Status): void {
  progressFill.style.width = `${(status.good / Math.max(1, status.total)) * 100}%`;
  progressLabel.textContent = `${status.good} / ${status.total}`;
  movesLabel.textContent = String(status.moves);

  if (status.crossings !== lastCrossings) {
    crossingsLabel.textContent = String(status.crossings);
    crossingsChip.classList.toggle("bad", status.crossings > 0);
    crossingsChip.classList.toggle("good", status.crossings === 0);
    if (lastCrossings !== -1) bump(crossingsChip);
    lastCrossings = status.crossings;
  }

  if (!status.solved) hideBanner();
}

function onWin(moves: number): void {
  const prevBest = progress.best[current];
  const newBest = prevBest === undefined || moves < prevBest;
  if (newBest) progress.best[current] = moves;
  if (current + 1 < LEVEL_COUNT) progress.unlocked = Math.max(progress.unlocked, current + 1);
  saveProgress(progress);
  refreshNav();

  const isLast = current + 1 >= LEVEL_COUNT;
  bannerTitle.textContent = isLast ? "Congrats Jam!" : PRAISE[Math.floor(Math.random() * PRAISE.length)];
  let sub = `${levelName(current)} untangled in ${moves} moves`;
  if (prevBest !== undefined) sub += newBest ? " · new best!" : ` · best ${prevBest}`;
  if (isLast) sub = `Every pastry untangled! (${moves} moves)`;
  bannerSub.textContent = sub;
  bannerNext.textContent = isLast ? "Start over ↻" : "Next level →";

  // Let the confetti fly first, then slide the banner in.
  // After the last level the jam finale comes in instead.
  clearTimeout(bannerTimer);
  if (isLast) {
    let note = `${levelName(current)} done in ${moves} moves`;
    if (prevBest !== undefined) note += newBest ? " · new best!" : ` · best ${prevBest}`;
    finaleSub.textContent = note;
    bannerTimer = window.setTimeout(() => finale.show(), 650);
  } else {
    bannerTimer = window.setTimeout(() => banner.classList.remove("hidden"), 650);
  }
}

const game = new Game(canvas, { onStatus, onWin });

function showIntro(): void {
  introNumber.textContent = `Level ${current + 1}`;
  introName.textContent = levelName(current);
  intro.classList.remove("hidden");
  intro.style.animation = "none";
  void intro.offsetWidth;
  intro.style.animation = "";
}

function goTo(index: number): void {
  current = Math.max(0, Math.min(index, LEVEL_COUNT - 1));
  hideBanner();
  lastCrossings = -1;
  refreshNav();
  showIntro();
  game.load(buildLevel(current), levelTheme(current));
}

function updateMuteButton(): void {
  muteBtn.innerHTML = sound.muted ? "&#128263;" : "&#128266;";
  muteBtn.title = sound.muted ? "Sound effects off" : "Sound effects on";
  musicBtn.classList.toggle("off", !sound.musicOn);
  musicBtn.title = sound.musicOn ? "Music on" : "Music off";
}

// Every button gets a little click sound.
document.querySelectorAll("button").forEach((b) =>
  b.addEventListener("click", () => {
    sound.unlock();
    sound.click();
  }),
);

prevBtn.addEventListener("click", () => goTo(current - 1));
nextBtn.addEventListener("click", () => goTo(current + 1));
resetBtn.addEventListener("click", () => {
  hideBanner();
  game.reset();
});
bannerNext.addEventListener("click", () => goTo(current + 1 >= LEVEL_COUNT ? 0 : current + 1));
$("finale-again").addEventListener("click", () => goTo(0));
// Close the finale but keep the "Start over" banner, so the solved table can be admired.
$("finale-close").addEventListener("click", () => {
  finale.hide();
  banner.classList.remove("hidden");
});
muteBtn.addEventListener("click", () => {
  sound.setMuted(!sound.muted);
  updateMuteButton();
});
musicBtn.addEventListener("click", () => {
  sound.setMusic(!sound.musicOn);
  updateMuteButton();
});

// Browsers only allow sound after the first click, tap or key press, so start the music then.
for (const type of ["pointerdown", "keydown"]) {
  window.addEventListener(type, () => sound.unlock(), { once: true, capture: true });
}
intro.addEventListener("animationend", () => intro.classList.add("hidden"));

window.addEventListener("keydown", (e) => {
  if (finale.open) {
    if (e.key === "Escape") $("finale-close").click();
    return;
  }
  if (e.key === "r" || e.key === "R") resetBtn.click();
  if (e.key === "ArrowLeft" && !prevBtn.disabled) prevBtn.click();
  if (e.key === "ArrowRight" && !nextBtn.disabled) nextBtn.click();
});

updateMuteButton();
goTo(current);

// For trying out the finale while developing: run plateauDebug.win() in the browser console.
if (import.meta.env.DEV) {
  Object.assign(window, {
    plateauDebug: {
      win: (moves = 99) => {
        current = LEVEL_COUNT - 1;
        refreshNav();
        onWin(moves);
      },
    },
  });
}
