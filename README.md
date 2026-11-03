# Gravity Is a Liar

A 2D platformer where **gravity flips when you blink**. You can play with a webcam, a keyboard, a gamepad or touch controls. It supports one player or up to 4, on the same device or online.

- **Play online:** https://firuzdesign32.github.io/gravity-is-a-liar/
- **Windows installer (.exe):** [Releases → latest](https://github.com/firuzdesign32/gravity-is-a-liar/releases/latest)
- **Phone / tablet / any PC:** open the online link. In Chrome or Edge choose **Install app** to keep the game on your device. It works offline, except for the webcam and online modes.

## Features
- **15 levels**, each harder than the last, ending with a final boss fight (*The Grand Liar*).
- **Webcam blink detection** (MediaPipe Face Landmarker + Eye Aspect Ratio), with a 3-second calibration, a live meter and adjustable sensitivity. The keyboard works at the same time.
- **Plays fully without a camera:** keyboard, gamepad, or on-screen touch buttons on phones.
- **Rebindable controls:** Settings → Controls. Each player gets 2 keys per action, and Pause and Restart can be changed too. Settings are saved in the browser.
- **Multiplayer for 1–4 players:**
  - *Local:* everyone uses one device, with separate keys or gamepads.
  - *Online:* one player hosts and shares a 5-letter room code. It is peer-to-peer over WebRTC through PeerJS, so no server of our own is needed.
  - Checkpoints are shared and the first player into the portal wins the round. Players who fall far behind are pulled to the leader.
- **Lightweight:** about 22 KB of gzipped game code. The camera and online code load only when you use them. Graphics adjust automatically on slow devices.
- **Progress saving:** unlocked levels and best times are kept. There is also a How to Play screen.

## Levels
| # | Name | New idea |
|---|------|----------|
| 1 | First Blink | flipping basics |
| 2 | Ceiling Walker | alternating spikes |
| 3 | Mind the Gap | pits and mid-flight crossings |
| 4 | The Liar Wakes | Liar Mode: random flips after a warning flicker |
| 5 | Blink Storm | about 20 flips in rhythm |
| 6 | Saw Mill | moving saws |
| 7 | Crumbling Faith | blocks that break under you |
| 8 | No-Blink Zone | zones where you can't flip |
| 9 | Laser Grid | pulsing lasers |
| 10 | The Void Chases | an auto-scrolling death wall |
| 11 | Liar's Saws | Liar Mode plus saws |
| 12 | Needle's Eye | narrow tunnels with short flights |
| 13 | Collapse | crumbling blocks plus the void |
| 14 | The Gauntlet | everything combined |
| 15 | The Grand Liar | boss: 6 orbs, 3 phases |

`npm run verify` runs a headless solver over every level. It uses human-like input timing (decisions every 0.1 s) and hazards enlarged by 3 px, and it proves each level can be finished.

## Default controls
| | Left | Right | Flip |
|---|---|---|---|
| P1 | A | D | W / Space |
| P2 | ← | → | ↑ |
| P3 | J | L | I |
| P4 | Num 4 | Num 6 | Num 8 |

- Pause: Esc / P. Restart: R.
- In solo play, the P1 and P2 keys both work.
- Gamepads: stick or D-pad to move, any face button to flip, Start to pause.

## Development
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # outputs dist/
npm run verify     # level solver
npm run tauri dev  # desktop app (needs Rust)
```

- **Desktop build:** pushing a tag `v*` runs `.github/workflows/release.yml` on Windows. It builds the Tauri NSIS installer and attaches it to a GitHub Release.
- **Web build:** every push to `main` deploys the web version to GitHub Pages.
- **Self-hosted broker:** add `?peer=host:port` to the URL to use your own PeerJS server instead of the public PeerJS cloud.

## Code map
```
src/world.js     pure simulation: physics, hazards, boss (runs in browser and Node)
src/levels.js    level builder + 15 levels
src/render.js    canvas renderer, particles, camera drawing
src/main.js      menus, game loop, camera, multiplayer flow
src/input.js     keyboard / gamepad / touch / blink → per-player input
src/blink.js     webcam blink detection (lazy-loaded)
src/net.js       online multiplayer (lazy-loaded PeerJS)
src/audio.js     Web Audio synth sound effects
scripts/verify-levels.mjs  headless level solver
src-tauri/       Windows desktop wrapper
```

### Adding a level
Add a function in `src/levels.js` and use the builder:

- `spikes(x, w, 'floor'|'ceil')`
- `pillar(x, w, h, side)`
- `gap(x, w, 'floor'|'ceil'|'both')`
- `saw(x, y)` and `msaw(x, y, 'x'|'y', range, period)`
- `crumble`, `laser`, `noflip`, `cp(x, side)`, `exit(x, side)`

Then run `npm run verify`.

## বাংলা সংক্ষেপে
- **অনলাইনে খেলুন:** উপরের লিংক থেকে।
- **Windows-এ ইনস্টল করুন:** Releases থেকে `.exe` ফাইল নামিয়ে চালান।
- **নিয়ন্ত্রণ:** ওয়েবক্যাম ছাড়া কিবোর্ড, গেমপ্যাড বা টাচে খেলা যায়। Settings থেকে কী বদলানো যায়।
- **মাল্টিপ্লেয়ার:** একই ডিভাইসে বা রুম কোড দিয়ে অনলাইনে, সর্বোচ্চ ৪ জন।
