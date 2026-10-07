# Prismcoil

**Chase the glow.** An original, colorful snake survival game made with Phaser 3. Gather glowing sparks, grow your coil, and outlast twelve AI rivals in a large circular arena. All graphics are generated in code. No Slither.io assets, branding, or visual design are used.

## Play locally

No dependency installation or build is required. From this directory:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

Open the server in your browser. Use an HTTP server rather than opening `index.html` as a file so audio loading works consistently.

## Controls and rules

| Action          | Desktop                                               | Touch                                            |
| --------------- | ----------------------------------------------------- | ------------------------------------------------ |
| Start / restart | Click the button or press Space (Enter also restarts) | Tap the button                                   |
| Steer           | Move the mouse toward your destination                | Touch and drag toward your destination           |
| Boost           | Hold the left mouse button or Space                   | Hold the Boost button; steer with another finger |
| Pause / resume  | P, Escape, or the pause button                        | Pause / resume button                            |
| Sound           | M or the speaker button                               | Speaker button                                   |

- The snake moves continuously and turns smoothly. Your own body is safe to cross.
- Ordinary sparks award **10 points**. Remains from eliminated snakes award **25 points**. Every 30 points adds a body segment, up to 200 segments; points can continue rising after this visual limit.
- Boost lasts about 3.7 seconds on a full charge. Release to recharge. It never reduces your score or length.
- Hit a rival's body head-first, or leave the arena rim, and your round ends immediately. Head-to-head collisions eliminate both snakes.
- New snakes have a brief, visible spawn shield. AI rivals collect food, avoid hazards, leave edible remains when eliminated, and respawn after three seconds.
- Restart resets your score, food, rivals, energy, timer, and length. Your personal best and sound preference are saved locally when browser storage is available.
- Switching tabs or losing focus pauses the round. No account, backend, or database is needed.

## Custom audio

Three small original synthesized placeholder effects are included. Replace them with your AI-generated MP3s at exactly these paths:

```text
assets/audio/reward.mp3  # Collecting food
assets/audio/damage.mp3  # Collision / elimination
assets/audio/end.mp3     # Game Over appears
```

Audio is initialized and resumed only after a click, tap, or keyboard interaction. A Web Audio tone fallback covers decoding failures. Use short effects (especially reward.mp3), with modest loudness. Sound can be muted; simultaneous rewards are rate-limited.

## Project structure

```text
index.html               Accessible interface and entry point
style.css                Responsive desktop/mobile interface
src/game.js              Arena, AI, input, spatial grids, rendering, audio
assets/audio/*.mp3       Replaceable sound effects
assets/vendor/           Phaser 3.90.0 and its MIT license
README.md
```

The only runtime dependency is **Phaser 3.90.0**, bundled locally from its official npm package. Its license is at `assets/vendor/PHASER-LICENSE.txt`. There are no CDN requests, external images, fonts, analytics, or build tools. A modern browser with Canvas or WebGL and Web Audio is recommended; sound remains optional.

## GitHub Pages

Commit these files to your repository. In **Settings → Pages**, choose **Deploy from a branch**, your branch, and **/ (root)**. All asset paths are relative, so repository subpaths work. No build step is necessary.

## Itch.io

Zip `index.html`, `style.css`, `src/`, and `assets/` with `index.html` at the ZIP root. Upload as an **HTML** game and select **This file will be played in the browser**. Enable fullscreen and mobile support; use a resizable viewport (suggested desktop embed: 1280 × 800). The game resizes automatically and uses touch controls.

## Development and validation

The `Arena` scene contains a fixed 60 Hz simulation; rendering runs at the browser's refresh rate. Spatial grids accelerate food lookup, AI avoidance, and body collisions. Canvas textures generate all artwork. The UI updates independently of the world camera. Inspect the running scene with `window.prismcoil.game.scene.getScene('Arena')` in developer tools.

After making changes, verify collection increases score and length, boost consumes and restores energy, body collisions end a round, enemy remains are edible, restart restores the initial state, and touch steering works. Check the browser console and both desktop/mobile layouts. Deployment is static: the same checks work under a repository subpath and without Internet access after the files are downloaded.
