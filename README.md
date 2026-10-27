# Plateau · Pâtisserie

A small untangle puzzle in the style of the old Planarity / "untangle" games,
dressed up as a French patisserie.

Each level is a different pastry: macaron, éclair, croissant, mille-feuille,
Paris-Brest, Saint-Honoré and croquembouche. Drag the pastries until no
chocolate lines cross. A pastry's glaze turns **pistachio green** (and it
smiles) once none of its lines cross anything. When every pastry is green,
the level is done.

A little French café waltz plays in the background. The ♫ button turns it
off, and the speaker button turns off the sound effects.

## Run

```sh
npm install
npm run dev      # play at the URL Vite prints
npm run build    # type-check and build to dist/
```

Keys: `R` resets the level, `←` / `→` change level.

## Hosting

Every push to `main` builds the game and publishes it to GitHub Pages
(see `.github/workflows/deploy.yml`). In the repo settings, Pages must be set
to use "GitHub Actions" as its source. The build uses relative paths
(`base: "./"` in `vite.config.ts`), so it also works from any other static
host or subfolder.

## How it works

- `src/levels.ts` builds each level the same way Planarity does: draw some
  random lines, put a dot wherever two lines cross, and join dots that sit
  next to each other on a line. This means every level can be solved. A fixed
  seed makes each level the same every time. The macarons start on a shuffled circle.
- `src/game.ts` holds the game state, the rules, dragging (mouse and touch) and
  the animation loop. Something counts as a problem when two lines cross, a
  macaron sits on a line it doesn't belong to, or two macarons overlap.
- `src/pastries.ts` draws the seven pastries and their faces.
- `src/draw.ts` has shared drawing helpers: colour mixing, piped lines, shadows.
- `src/fx.ts` has the springs (for bouncy movement) and particles
  (sprinkles, rings, flour puffs, confetti).
- `src/audio.ts` makes all the sound effects with WebAudio, so there are no
  sound files. It also does a short vibration on Android.
- `src/music.ts` is the background music: an original valse musette (accordion
  with three slightly detuned reeds, oom-pah-pah bass and chords), played live
  with WebAudio. Edit the `MELODY` and `CHORDS` lists to change the tune.
- `src/theme.ts` has the colours, flavours, the pastry for each level and the praise lines.
- `src/main.ts` connects the header, level intro and win banner. Progress
  and the mute setting are saved in localStorage.

To change the number or size of levels, edit `LINES_PER_LEVEL` in
`src/levels.ts` (N lines gives N*(N-1)/2 pastries) and add an entry to `LEVEL_THEMES` in `src/theme.ts`.
