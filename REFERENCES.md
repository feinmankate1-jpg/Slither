# References and credits

## Audio

**Background music credit: audio generated with [ElevenLabs](https://elevenlabs.io/), supplied by the project owner as `background.mp3`.** The file is included at `assets/audio/background.mp3`.

| File | Source and use |
| --- | --- |
| `assets/audio/background.mp3` | User-supplied ElevenLabs background music; loops at 25% volume during a round. |
| `assets/audio/reward.mp3` | Original synthesized placeholder effect included with the first playable version; plays when food is collected. |
| `assets/audio/damage.mp3` | Original synthesized placeholder effect included with the first playable version; plays on player collision/elimination. |
| `assets/audio/end.mp3` | Original synthesized placeholder effect included with the first playable version; plays when Game Over appears. |

The supplied background track is the audio identified as ElevenLabs-generated in the available conversation. The current placeholder sound effects are not attributed to ElevenLabs. They can be replaced with custom MP3s at the same paths.

## Framework and implementation

- [Phaser](https://phaser.io/) and [Phaser documentation](https://docs.phaser.io/): the browser game framework and its documentation. This project bundles Phaser **3.90.0** locally.
- [Phaser source repository](https://github.com/phaserjs/phaser): framework source and license information. The bundled MIT license is preserved in [assets/vendor/PHASER-LICENSE.txt](assets/vendor/PHASER-LICENSE.txt).
- [OpenAI Codex](https://openai.com/index/introducing-codex/): AI assistance used to implement the game, troubleshoot the preview, publish to GitHub Pages, add background music, and prepare documentation. The available user requests are recorded in [PROMPT_LOG.md](PROMPT_LOG.md).

## Gameplay inspiration

- [Slither.io](https://slither.io/): inspiration for the general snake survival mechanics requested by the project owner, including collecting food, growing, boosting, and avoiding other snakes' bodies. Prismcoil uses its own name, interface, colors, and code-generated graphics; no Slither.io assets or branding are included.
