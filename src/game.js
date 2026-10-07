/* Prismcoil — original graphics, local Phaser 3, no services or build step. */
"use strict";

(() => {
  document.getElementById("start-button").disabled = true;
  if (!window.Phaser) {
    document.getElementById("loading-message").textContent =
      "Phaser could not load. Check that assets/vendor/phaser.min.js is included.";
    return;
  }
  const WORLD_RADIUS = 2250;
  const FOOD_COUNT = 1150;
  const ENEMY_COUNT = 12;
  const START_LENGTH = 26;
  const TRAIL_STEP = 4;
  const SEGMENT_GAP = 9;
  const FIXED_STEP = 1 / 60;
  const COLORS = [0x6ceac0, 0xffb65e, 0xeb86c6, 0xa69bff, 0x79cfff, 0xff8074];
  const NAMES = [
    "Mochi",
    "Solar",
    "Noodle",
    "Juniper",
    "Peach",
    "Comet",
    "Mellow",
    "Dusk",
    "Fizz",
    "Orbit",
    "Clover",
    "Boba",
  ];
  const $ = (id) => document.getElementById(id);
  const show = (id, visible) => $(id).classList.toggle("hidden", !visible);
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const random = (low, high) => low + Math.random() * (high - low);
  const distanceSquared = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const angleDifference = (a, b) =>
    Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const hex = (color) => `#${color.toString(16).padStart(6, "0")}`;
  const number = (value) => Math.floor(value).toLocaleString();
  const readSaved = (key, fallback) => {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const save = (key, value) => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* Private browsing can deny storage. */
    }
  };
  let best = Math.max(0, Number(readSaved("prismcoil.best", 0)) || 0);
  let chosenColor = COLORS[0];

  // Unlock only from an explicit gesture. Replacement MP3s use these same paths.
  class GameAudio {
    constructor() {
      this.context = null;
      this.buffers = new Map();
      this.muted = readSaved("prismcoil.muted", "false") === "true";
      this.lastReward = 0;
      this.refreshButton();
    }
    unlock() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!this.context) {
        this.context = new AudioContext();
        for (const name of ["reward", "damage", "end"]) {
          fetch(`assets/audio/${name}.mp3`)
            .then((response) => (response.ok ? response.arrayBuffer() : null))
            .then((data) => data && this.context.decodeAudioData(data))
            .then((buffer) => {
              if (buffer) this.buffers.set(name, buffer);
            })
            .catch(() => {
              /* A missing or unsupported custom sound uses the synthesizer. */
            });
        }
      }
      this.context.resume().catch(() => {});
    }
    toggle() {
      this.unlock();
      this.muted = !this.muted;
      save("prismcoil.muted", this.muted);
      this.refreshButton();
    }
    refreshButton() {
      $("sound-toggle").classList.toggle("muted", this.muted);
      $("sound-toggle").setAttribute(
        "aria-label",
        this.muted ? "Unmute sound" : "Mute sound",
      );
      $("sound-toggle").setAttribute("aria-pressed", String(this.muted));
    }
    play(name) {
      const ctx = this.context;
      if (this.muted || !ctx || ctx.state !== "running") return;
      if (name === "reward" && ctx.currentTime - this.lastReward < 0.055)
        return;
      if (name === "reward") this.lastReward = ctx.currentTime;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      if (this.buffers.has(name)) {
        const source = ctx.createBufferSource();
        source.buffer = this.buffers.get(name);
        source.playbackRate.value = name === "reward" ? random(0.94, 1.12) : 1;
        gain.gain.value = name === "reward" ? 0.38 : 0.5;
        source.connect(gain);
        source.start();
        source.onended = () => {
          source.disconnect();
          gain.disconnect();
        };
      } else {
        const oscillator = ctx.createOscillator();
        const duration =
          name === "reward" ? 0.16 : name === "damage" ? 0.26 : 0.6;
        const pitch = name === "reward" ? 740 : name === "damage" ? 140 : 440;
        oscillator.type = name === "damage" ? "sawtooth" : "sine";
        oscillator.frequency.setValueAtTime(pitch, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(
          name === "damage" ? 35 : pitch * 1.5,
          ctx.currentTime + duration,
        );
        gain.gain.setValueAtTime(0.07, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + duration,
        );
        oscillator.connect(gain);
        oscillator.start();
        oscillator.stop(ctx.currentTime + duration);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      }
    }
  }
  const audio = new GameAudio();

  // Small uniform spatial grids avoid comparing every orb/body against every head.
  class SpatialGrid {
    constructor(size) {
      this.size = size;
      this.cells = new Map();
    }
    key(x, y) {
      return `${Math.floor(x / this.size)},${Math.floor(y / this.size)}`;
    }
    add(item) {
      const key = this.key(item.x, item.y);
      if (!this.cells.has(key)) this.cells.set(key, new Set());
      this.cells.get(key).add(item);
    }
    remove(item) {
      const key = this.key(item.x, item.y);
      const cell = this.cells.get(key);
      if (cell) {
        cell.delete(item);
        if (!cell.size) this.cells.delete(key);
      }
    }
    near(x, y, radius) {
      const result = [];
      const s = this.size;
      for (
        let cx = Math.floor((x - radius) / s);
        cx <= Math.floor((x + radius) / s);
        cx++
      ) {
        for (
          let cy = Math.floor((y - radius) / s);
          cy <= Math.floor((y + radius) / s);
          cy++
        ) {
          const cell = this.cells.get(`${cx},${cy}`);
          if (cell) for (const item of cell) result.push(item);
        }
      }
      return result;
    }
  }

  class Arena extends Phaser.Scene {
    constructor() {
      super("Arena");
      this.state = "loading";
      this.snakes = [];
      this.food = new Set();
      this.particles = [];
      this.foodGrid = new SpatialGrid(80);
      this.bodyGrid = new SpatialGrid(70);
      this.controls = {
        x: 0,
        y: 0,
        aiming: false,
        mouseBoost: false,
        spaceBoost: false,
        touchBoost: false,
      };
      this.round = 0;
      this.accumulator = 0;
    }
    create() {
      this.makeTextures();
      this.makeWorld();
      this.faces = this.add.graphics().setDepth(30);
      this.bindControls();
      this.home();
      show("loading-message", false);
      $("start-button").disabled = false;
      $("start-best").textContent = number(best);
      this.scale.on("resize", () => {
        if (this.state === "menu") this.cameras.main.centerOn(0, 0);
        else this.cameras.main.setZoom(this.scale.width < 760 ? 0.8 : 1);
        this.controls.aiming = false;
      });
      // Parent layout changes also occur while a mobile browser is rotating or paused.
      // Observe the actual container so the drawing buffer always matches the UI.
      if (window.ResizeObserver) {
        const observer = new ResizeObserver(([entry]) => {
          const width = Math.round(entry.contentRect.width);
          const height = Math.round(entry.contentRect.height);
          if (
            width > 0 &&
            height > 0 &&
            (width !== this.scale.width || height !== this.scale.height)
          ) {
            this.scale.setParentSize(width, height);
          }
        });
        observer.observe($("game"));
        this.events.once("shutdown", () => observer.disconnect());
      }
    }
    makeTextures() {
      const texture = (name, size, draw) => {
        const canvas = this.textures.createCanvas(name, size, size);
        draw(canvas.context, size);
        canvas.refresh();
      };
      texture("orb", 64, (ctx) => {
        const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
        glow.addColorStop(0, "#ffffff");
        glow.addColorStop(0.1, "#ffffff");
        glow.addColorStop(0.19, "#ffffffc0");
        glow.addColorStop(0.38, "#ffffff38");
        glow.addColorStop(1, "#ffffff00");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, 64, 64);
      });
      texture("body", 64, (ctx) => {
        const glow = ctx.createRadialGradient(32, 32, 11, 32, 32, 31);
        glow.addColorStop(0, "#ffffff50");
        glow.addColorStop(1, "#ffffff00");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, 64, 64);
        const body = ctx.createRadialGradient(28, 25, 1, 32, 32, 19);
        body.addColorStop(0, "#ffffff");
        body.addColorStop(0.65, "#ebefef");
        body.addColorStop(1, "#9caeaf");
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(32, 32, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff55";
        ctx.beginPath();
        ctx.ellipse(28, 26, 7, 3, -0.5, 0, Math.PI * 2);
        ctx.fill();
      });
      texture("mist", 256, (ctx) => {
        const glow = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        glow.addColorStop(0, "#ffffff");
        glow.addColorStop(1, "#ffffff00");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, 256, 256);
      });
      texture("grid", 112, (ctx) => {
        ctx.strokeStyle = "#3c5967";
        ctx.lineWidth = 0.8;
        // Repeating staggered diamond tessellation, with little stars at junctions.
        for (let x = -56; x <= 168; x += 56) {
          for (let y = -56; y <= 168; y += 56) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 28, y + 28);
            ctx.lineTo(x, y + 56);
            ctx.lineTo(x - 28, y + 28);
            ctx.closePath();
            ctx.stroke();
          }
        }
        ctx.fillStyle = "#5b788a";
        ctx.fillRect(27, 27, 2, 2);
        ctx.fillRect(83, 83, 2, 2);
      });
      // Bake tint into the textures: Phaser's Canvas fallback cannot tint sprites.
      for (const name of ["body", "orb", "mist"]) {
        const original = this.textures.get(name).getSourceImage();
        for (const color of COLORS) {
          texture(`${name}-${color}`, original.width, (ctx) => {
            ctx.drawImage(original, 0, 0);
            const pixels = ctx.getImageData(
              0,
              0,
              original.width,
              original.height,
            );
            const red = (color >> 16) & 255;
            const green = (color >> 8) & 255;
            const blue = color & 255;
            for (let i = 0; i < pixels.data.length; i += 4) {
              pixels.data[i] *= red / 255;
              pixels.data[i + 1] *= green / 255;
              pixels.data[i + 2] *= blue / 255;
            }
            ctx.putImageData(pixels, 0, 0);
          });
        }
      }
    }
    makeWorld() {
      this.add
        .tileSprite(0, 0, 5400, 5400, "grid")
        .setAlpha(0.17)
        .setDepth(-20);
      for (const [x, y, color] of [
        [400, 0, COLORS[0]],
        [-900, 600, COLORS[3]],
        [1400, -700, COLORS[1]],
        [0, -1400, COLORS[4]],
      ]) {
        this.add
          .image(x, y, `mist-${color}`)
          .setDisplaySize(1700, 1700)
          .setAlpha(0.065)
          .setDepth(-19);
      }
      const boundary = this.add.graphics().setDepth(-10);
      boundary.lineStyle(35, 0x6ceac0, 0.025).strokeCircle(0, 0, WORLD_RADIUS);
      boundary.lineStyle(3, 0x72c5b0, 0.35).strokeCircle(0, 0, WORLD_RADIUS);
      boundary
        .lineStyle(1, 0x72c5b0, 0.12)
        .strokeCircle(0, 0, WORLD_RADIUS - 35);
      for (let i = 0; i < 16; i++) {
        const angle = (i * Math.PI) / 8;
        this.add
          .text(
            Math.cos(angle) * (WORLD_RADIUS - 95),
            Math.sin(angle) * (WORLD_RADIUS - 95),
            "OUTER RIM",
            {
              fontFamily: "Arial",
              fontSize: 11,
              color: "#5c8f88",
              letterSpacing: 3,
            },
          )
          .setOrigin(0.5)
          .setRotation(angle + Math.PI / 2)
          .setDepth(-9);
      }
    }
    bindControls() {
      window.addEventListener("pointermove", (event) => {
        if (event.target.closest("button")) return;
        const bounds = $("game").getBoundingClientRect();
        this.controls.x = event.clientX - bounds.left;
        this.controls.y = event.clientY - bounds.top;
        this.controls.aiming = true;
      });
      this.input.on("pointerdown", (pointer) => {
        if (this.state !== "playing") return;
        this.controls.x = pointer.x;
        this.controls.y = pointer.y;
        this.controls.aiming = true;
        if (!pointer.wasTouch) this.controls.mouseBoost = true;
      });
      window.addEventListener("pointerup", () => {
        this.controls.mouseBoost = false;
        this.controls.touchBoost = false;
      });
      window.addEventListener("pointercancel", () => this.clearBoost());
      $("boost-button").addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.controls.touchBoost = true;
        $("boost-button").setPointerCapture(event.pointerId);
      });
      $("boost-button").addEventListener("lostpointercapture", () => {
        this.controls.touchBoost = false;
      });
      window.addEventListener("keydown", (event) => {
        if (["Space", "ArrowUp", "ArrowDown"].includes(event.code))
          event.preventDefault();
        if (event.repeat) return;
        if (event.code === "Space") {
          if (this.state === "menu" || this.state === "over") this.start();
          else if (this.state === "playing") this.controls.spaceBoost = true;
        } else if (event.code === "KeyP" || event.code === "Escape")
          this.togglePause();
        else if (event.code === "KeyM") audio.toggle();
        else if (event.code === "Enter" && this.state === "over") this.start();
      });
      window.addEventListener("keyup", (event) => {
        if (event.code === "Space") this.controls.spaceBoost = false;
      });
      window.addEventListener("blur", () => {
        this.clearBoost();
        if (this.state === "playing") this.togglePause();
      });
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && this.state === "playing") this.togglePause();
      });
      $("start-button").addEventListener("click", () => this.start());
      $("restart-button").addEventListener("click", () => this.start());
      $("home-button").addEventListener("click", () => this.home());
      $("resume-button").addEventListener("click", () => this.togglePause());
      $("pause-button").addEventListener("click", () => this.togglePause());
      $("sound-toggle").addEventListener("click", () => audio.toggle());
      for (const chip of document.querySelectorAll(".color-chip")) {
        chip.addEventListener("click", () => {
          chosenColor = Number(chip.dataset.color);
          for (const other of document.querySelectorAll(".color-chip")) {
            other.classList.toggle("selected", other === chip);
            other.setAttribute("aria-pressed", String(other === chip));
          }
          if (this.state === "menu") {
            this.player.color = chosenColor;
            for (const sprite of this.player.sprites)
              sprite.setTexture(`body-${chosenColor}`);
          }
        });
      }
    }
    clearBoost() {
      this.controls.mouseBoost = false;
      this.controls.spaceBoost = false;
      this.controls.touchBoost = false;
    }
    resetWorld(menu = false) {
      this.round++;
      for (const snake of this.snakes) this.destroySnake(snake);
      this.snakes = [];
      for (const orb of this.food) orb.sprite.destroy();
      this.food.clear();
      this.foodGrid.cells.clear();
      this.bodyGrid.cells.clear();
      for (const particle of this.particles) particle.sprite.destroy();
      this.particles = [];
      this.respawns = [];
      this.elapsed = 0;
      this.menuTime = 0;
      this.accumulator = 0;
      this.hudTimer = 0;
      this.toastTime = 0;
      this.clearBoost();
      this.controls.aiming = false;
      this.cameras.main.stopFollow();
      this.cameras.main.resetFX();
      this.cameras.main.setZoom(menu ? 1 : this.scale.width < 760 ? 0.8 : 1);
      this.cameras.main.centerOn(0, 0);
      this.player = this.createSnake(
        0,
        0,
        chosenColor,
        true,
        menu ? 73 : START_LENGTH,
        "You",
      );
      for (let i = 0; i < ENEMY_COUNT; i++) this.spawnEnemy(i);
      if (menu)
        for (let i = 3; i < this.snakes.length; i++) {
          for (const sprite of this.snakes[i].sprites) sprite.setVisible(false);
          this.snakes[i].label.setVisible(false);
        }
      for (let i = 0; i < FOOD_COUNT; i++) this.addFood();
      // Starter sparks teach collection immediately, without waiting for luck.
      for (let i = 0; i < 24; i++)
        this.addFood(
          105 + i * 25,
          Math.sin(i * 0.55) * 28,
          10,
          COLORS[i % COLORS.length],
        );
      if (menu) {
        for (let i = 0; i < 45; i++)
          this.addFood(
            random(-this.scale.width / 2, this.scale.width / 2),
            random(-this.scale.height / 2, this.scale.height / 2),
          );
      }
    }
    home() {
      this.state = "menu";
      this.resetWorld(true);
      document.body.classList.remove("playing");
      for (const id of [
        "score-hud",
        "leaderboard",
        "world-hud",
        "play-hint",
        "boost-control",
        "pause-button",
        "end-screen",
        "pause-screen",
      ])
        show(id, false);
      show("start-screen", true);
      $("start-best").textContent = number(best);
      $("pickup-toast").classList.remove("show");
    }
    start() {
      audio.unlock();
      this.state = "playing";
      this.resetWorld();
      document.body.classList.add("playing");
      for (const id of ["start-screen", "end-screen", "pause-screen"])
        show(id, false);
      for (const id of [
        "score-hud",
        "leaderboard",
        "world-hud",
        "play-hint",
        "boost-control",
        "pause-button",
      ])
        show(id, true);
      this.cameras.main.startFollow(this.player.sprites[0], true, 0.09, 0.09);
      $("pickup-toast").classList.remove("show");
      this.refreshHUD();
    }
    togglePause() {
      if (this.state === "playing") {
        this.state = "paused";
        this.clearBoost();
        show("pause-screen", true);
      } else if (this.state === "paused") {
        audio.unlock();
        this.state = "playing";
        this.accumulator = 0;
        show("pause-screen", false);
      }
    }
    createSnake(x, y, color, isPlayer, length, name) {
      const snake = {
        x,
        y,
        angle: random(-Math.PI, Math.PI),
        color,
        isPlayer,
        name,
        initialLength: length,
        length,
        score: 0,
        eaten: 0,
        alive: true,
        trail: [],
        sprites: [],
        radius: 10,
        energy: 100,
        boosting: false,
        exhausted: false,
        immunity: 1.3,
        think: 0,
        target: null,
        aiIndex: -1,
      };
      this.placeSnake(snake, x, y, isPlayer ? 0 : snake.angle);
      if (!isPlayer) {
        snake.score = (length - 20) * 30;
        snake.label = this.add
          .text(x, y - 28, name, {
            fontFamily: "Arial",
            fontSize: 10,
            color: "#a7bbb9",
            stroke: "#09151c",
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setAlpha(0.7)
          .setDepth(35);
      }
      this.snakes.push(snake);
      this.syncSegments(snake);
      return snake;
    }
    placeSnake(snake, x, y, angle) {
      snake.x = x;
      snake.y = y;
      snake.angle = angle;
      snake.trail = [];
      const count = Math.ceil((snake.length * SEGMENT_GAP) / TRAIL_STEP) + 5;
      for (let i = 0; i < count; i++)
        snake.trail.push({
          x: x - Math.cos(angle) * i * TRAIL_STEP,
          y: y - Math.sin(angle) * i * TRAIL_STEP,
        });
    }
    spawnEnemy(index) {
      let position = null;
      for (let attempt = 0; attempt < 80; attempt++) {
        const angle = random(-Math.PI, Math.PI);
        const radius = random(480, WORLD_RADIUS - 450);
        const candidate = {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        };
        if (
          this.snakes.every(
            (snake) =>
              !snake.alive || distanceSquared(candidate, snake) > 420 ** 2,
          )
        ) {
          position = candidate;
          break;
        }
      }
      if (!position)
        position = { x: random(-1400, 1400), y: random(-1400, 1400) };
      const snake = this.createSnake(
        position.x,
        position.y,
        COLORS[(index + 1) % COLORS.length],
        false,
        Math.floor(random(29, 64)),
        NAMES[index],
      );
      snake.aiIndex = index;
      return snake;
    }
    syncSegments(snake) {
      while (snake.sprites.length < snake.length) {
        snake.sprites.push(
          this.add
            .image(snake.x, snake.y, `body-${snake.color}`)
            .setDepth(snake.isPlayer ? 20 : 10),
        );
      }
      while (snake.sprites.length > snake.length) snake.sprites.pop().destroy();
    }
    destroySnake(snake) {
      for (const sprite of snake.sprites) sprite.destroy();
      if (snake.label) snake.label.destroy();
      snake.sprites = [];
    }
    addFood(x, y, value = 10, color, lifetime = 0) {
      if (x === undefined || y === undefined) {
        const angle = random(0, Math.PI * 2);
        const radius = Math.sqrt(Math.random()) * (WORLD_RADIUS - 60);
        x = Math.cos(angle) * radius;
        y = Math.sin(angle) * radius;
      }
      color ??= COLORS[Math.floor(Math.random() * COLORS.length)];
      const size = value > 10 ? random(38, 47) : random(24, 35);
      const sprite = this.add
        .image(x, y, `orb-${color}`)
        .setDisplaySize(size, size)
        .setAlpha(random(0.7, 1))
        .setDepth(1);
      const orb = {
        x,
        y,
        value,
        color,
        sprite,
        size,
        phase: random(0, 6.28),
        expires: lifetime ? this.elapsed + lifetime : 0,
      };
      this.food.add(orb);
      this.foodGrid.add(orb);
      return orb;
    }
    removeFood(orb) {
      this.food.delete(orb);
      this.foodGrid.remove(orb);
      orb.sprite.destroy();
    }
    think(snake, dt) {
      snake.think -= dt;
      if (snake.think <= 0 || !snake.target || !this.food.has(snake.target)) {
        snake.think = random(0.3, 0.65);
        const nearby = this.foodGrid.near(snake.x, snake.y, 340);
        let target = null;
        let closest = Infinity;
        for (const orb of nearby) {
          const d = distanceSquared(snake, orb);
          if (d < closest) {
            closest = d;
            target = orb;
          }
        }
        snake.target = target || {
          x: snake.x + Math.cos(snake.angle + random(-0.7, 0.7)) * 250,
          y: snake.y + Math.sin(snake.angle + random(-0.7, 0.7)) * 250,
        };
      }
      let desired = Math.atan2(
        snake.target.y - snake.y,
        snake.target.x - snake.x,
      );
      if (Math.hypot(snake.x, snake.y) > WORLD_RADIUS - 240)
        desired = Math.atan2(-snake.y, -snake.x);
      else {
        const probe = {
          x: snake.x + Math.cos(snake.angle) * 85,
          y: snake.y + Math.sin(snake.angle) * 85,
        };
        let danger = null;
        let nearest = 90 ** 2;
        for (const body of this.bodyGrid.near(probe.x, probe.y, 95)) {
          if (body.snake === snake || !body.snake.alive) continue;
          const d = distanceSquared(probe, body);
          if (d < nearest) {
            danger = body;
            nearest = d;
          }
        }
        if (danger)
          desired = Math.atan2(probe.y - danger.y, probe.x - danger.x);
      }
      return desired;
    }
    moveSnake(snake, dt) {
      snake.immunity = Math.max(0, snake.immunity - dt);
      let desired;
      if (snake.isPlayer) {
        desired = snake.angle;
        if (this.controls.aiming) {
          const target = this.cameras.main.getWorldPoint(
            this.controls.x,
            this.controls.y,
          );
          if (distanceSquared(snake, target) > 24 ** 2)
            desired = Math.atan2(target.y - snake.y, target.x - snake.x);
        }
        const held =
          this.controls.mouseBoost ||
          this.controls.spaceBoost ||
          this.controls.touchBoost;
        if (!held) snake.exhausted = false;
        snake.boosting = held && !snake.exhausted && snake.energy > 0;
        if (snake.boosting) {
          snake.energy = Math.max(0, snake.energy - 27 * dt);
          if (snake.energy === 0) {
            snake.exhausted = true;
            snake.boosting = false;
          }
        } else snake.energy = Math.min(100, snake.energy + 18 * dt);
      } else {
        desired = this.think(snake, dt);
        snake.boosting = false;
      }
      snake.angle += clamp(
        angleDifference(desired, snake.angle),
        -3.5 * dt,
        3.5 * dt,
      );
      const speed = snake.boosting
        ? 305
        : snake.isPlayer
          ? 172
          : 128 + (snake.aiIndex % 4) * 11;
      snake.x += Math.cos(snake.angle) * speed * dt;
      snake.y += Math.sin(snake.angle) * speed * dt;
      const last = snake.trail[0];
      const dx = snake.x - last.x;
      const dy = snake.y - last.y;
      const distance = Math.hypot(dx, dy);
      const count = Math.floor(distance / TRAIL_STEP);
      for (let i = 1; i <= count; i++) {
        const ratio = (i * TRAIL_STEP) / distance;
        snake.trail.unshift({ x: last.x + dx * ratio, y: last.y + dy * ratio });
      }
      snake.trail.length = Math.min(
        snake.trail.length,
        Math.ceil((snake.length * SEGMENT_GAP) / TRAIL_STEP) + 5,
      );
      if (snake.boosting && Math.random() < 0.35)
        this.burst(
          snake.x - Math.cos(snake.angle) * 20,
          snake.y - Math.sin(snake.angle) * 20,
          snake.color,
          1,
          40,
        );
    }
    rebuildBodies() {
      this.bodyGrid.cells.clear();
      for (const snake of this.snakes) {
        if (!snake.alive) continue;
        this.bodyGrid.add({ x: snake.x, y: snake.y, snake });
        for (let i = 3; i < snake.trail.length - 4; i += 3) {
          const point = snake.trail[i];
          this.bodyGrid.add({ x: point.x, y: point.y, snake });
        }
      }
    }
    collect(snake) {
      for (const orb of this.foodGrid.near(snake.x, snake.y, 24)) {
        if (
          distanceSquared(snake, orb) >
          (snake.radius + (orb.value > 10 ? 9 : 6)) ** 2
        )
          continue;
        snake.score += orb.value;
        snake.eaten++;
        // One body segment per three ordinary sparks; score never falls during boost.
        snake.length = Math.min(
          200,
          snake.isPlayer
            ? START_LENGTH + Math.floor(snake.score / 30)
            : snake.initialLength +
                Math.floor(
                  (snake.score - (snake.initialLength - 20) * 30) / 30,
                ),
        );
        this.syncSegments(snake);
        if (snake.isPlayer) {
          audio.play("reward");
          this.burst(orb.x, orb.y, orb.color, 7, 95);
          $("pickup-toast").textContent = `+${orb.value}`;
          $("pickup-toast").classList.add("show");
          this.toastTime = 0.6;
        }
        this.removeFood(orb);
      }
    }
    step(dt) {
      this.elapsed += dt;
      const live = this.snakes.filter(
        (snake) => snake.alive && !(this.state === "menu" && snake.isPlayer),
      );
      for (const snake of live) this.moveSnake(snake, dt);
      this.rebuildBodies();
      // Evaluate all collisions before removing anyone, so simultaneous head clashes are fair.
      const victims = new Map();
      for (const snake of live) {
        if (snake.immunity > 0) continue;
        if (Math.hypot(snake.x, snake.y) > WORLD_RADIUS - snake.radius) {
          victims.set(snake, "rim");
          continue;
        }
        for (const body of this.bodyGrid.near(snake.x, snake.y, 21)) {
          if (body.snake === snake || body.snake.immunity > 0) continue;
          if (
            distanceSquared(snake, body) <
            (snake.radius + body.snake.radius - 1) ** 2
          ) {
            victims.set(snake, "coil");
            break;
          }
        }
      }
      for (const [snake, reason] of victims) this.eliminate(snake, reason);
      for (const snake of live) if (snake.alive) this.collect(snake);
      for (const orb of this.food)
        if (orb.expires && orb.expires <= this.elapsed) this.removeFood(orb);
      for (let i = 0; i < 4 && this.food.size < FOOD_COUNT; i++) this.addFood();
      for (let i = this.respawns.length - 1; i >= 0; i--) {
        if (this.elapsed >= this.respawns[i].at) {
          this.spawnEnemy(this.respawns[i].index);
          this.respawns.splice(i, 1);
        }
      }
      this.snakes = this.snakes.filter(
        (snake) => snake.alive || snake.isPlayer,
      );
    }
    eliminate(snake, reason) {
      if (!snake.alive) return;
      snake.alive = false;
      for (let i = 0; i < snake.trail.length; i += 5) {
        const point = snake.trail[i];
        if (Math.hypot(point.x, point.y) < WORLD_RADIUS - 15)
          this.addFood(
            point.x + random(-9, 9),
            point.y + random(-9, 9),
            25,
            snake.color,
            50,
          );
      }
      this.burst(snake.x, snake.y, snake.color, snake.isPlayer ? 38 : 20, 180);
      this.destroySnake(snake);
      if (snake.isPlayer) {
        this.state = "over";
        this.clearBoost();
        this.cameras.main.stopFollow();
        this.cameras.main.shake(220, 0.006);
        audio.play("damage");
        const record = snake.score > best;
        best = Math.max(best, snake.score);
        save("prismcoil.best", best);
        $("death-reason").textContent =
          reason === "rim"
            ? "The outer rim caught you. Stay inside the glow."
            : "You crossed another coil. Let’s find a new flow.";
        $("final-score").textContent = number(snake.score);
        $("final-best").textContent = number(best);
        $("final-food").textContent = number(snake.eaten);
        $("final-time").textContent =
          `${Math.floor(this.elapsed / 60)}:${Math.floor(this.elapsed % 60)
            .toString()
            .padStart(2, "0")}`;
        show("record-banner", record);
        show("pause-button", false);
        const round = this.round;
        this.time.delayedCall(240, () => {
          if (this.state !== "over" || this.round !== round) return;
          show("end-screen", true);
          audio.play("end");
          $("restart-button").focus({ preventScroll: true });
        });
      } else this.respawns.push({ index: snake.aiIndex, at: this.elapsed + 3 });
    }
    burst(x, y, color, count, speed) {
      for (let i = 0; i < count && this.particles.length < 200; i++) {
        const angle = random(0, Math.PI * 2);
        const velocity = random(speed * 0.3, speed);
        const sprite = this.add
          .image(x, y, `orb-${color}`)
          .setDisplaySize(random(10, 24), random(10, 24))
          .setDepth(40);
        this.particles.push({
          sprite,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          life: random(0.3, 0.65),
          age: 0,
        });
      }
    }
    animateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.age += dt;
        if (p.age >= p.life) {
          p.sprite.destroy();
          this.particles.splice(i, 1);
          continue;
        }
        p.sprite.x += p.vx * dt;
        p.sprite.y += p.vy * dt;
        p.sprite.setAlpha(1 - p.age / p.life);
      }
    }
    renderSnake(snake) {
      const count = snake.sprites.length;
      for (let i = count - 1; i >= 0; i--) {
        const point =
          i === 0
            ? snake
            : snake.trail[
                Math.min(
                  snake.trail.length - 1,
                  Math.round((i * SEGMENT_GAP) / TRAIL_STEP),
                )
              ];
        const taper = clamp((count - i) / 7, 0.25, 1);
        const size = (snake.boosting ? 42 : 39) * taper;
        snake.sprites[i]
          .setPosition(point.x, point.y)
          .setDisplaySize(size, size);
        snake.sprites[i].setDepth(
          (snake.isPlayer ? 20 : 10) + (count - i) * 0.001,
        );
        snake.sprites[i].setAlpha(
          snake.immunity > 0 && this.state === "playing"
            ? 0.72 + Math.sin(this.elapsed * 15) * 0.2
            : 1,
        );
      }
      const cos = Math.cos(snake.angle);
      const sin = Math.sin(snake.angle);
      for (const side of [-1, 1]) {
        const x = snake.x + cos * 6 - sin * side * 5.4;
        const y = snake.y + sin * 6 + cos * side * 5.4;
        this.faces.fillStyle(0xf7f4df, 1).fillCircle(x, y, 4.1);
        this.faces
          .fillStyle(0x163338, 1)
          .fillCircle(x + cos * 1.5, y + sin * 1.5, 2.1);
      }
      if (snake.label) snake.label.setPosition(snake.x, snake.y - 31);
    }
    animateMenu(dt) {
      this.menuTime += dt * 0.43;
      const width = this.scale.width;
      const height = this.scale.height;
      const mobile = width < 760;
      const curve = (t) => ({
        x:
          width * (mobile ? 0.38 : 0.22) +
          Math.sin(t) * (mobile ? 70 : width * 0.16) +
          Math.sin(t * 2) * 32,
        y:
          height * (mobile ? -0.03 : -0.06) +
          Math.cos(t * 1.3) * height * 0.16 +
          Math.sin(t * 2.2) * 35,
      });
      const t = this.menuTime + 1.7;
      const p = curve(t);
      const previous = curve(t - 0.015);
      this.player.x = p.x;
      this.player.y = p.y;
      this.player.angle = Math.atan2(p.y - previous.y, p.x - previous.x);
      this.player.trail = [];
      // Menu-only art uses an analytic curve rather than the live simulation trail.
      for (let i = 0; i < 200; i++)
        this.player.trail.push(curve(t - i * 0.014));
      for (let index = 1; index <= 2; index++) {
        const snake = this.snakes[index];
        const rivalCurve = (u) => ({
          x: width * 0.43 + Math.sin(u) * 140,
          y:
            (index === 1 ? -height * 0.35 : height * 0.34) +
            Math.cos(u * 1.2) * 70,
        });
        const head = rivalCurve(t + index * 2);
        const prev = rivalCurve(t + index * 2 - 0.015);
        snake.x = head.x;
        snake.y = head.y;
        snake.angle = Math.atan2(head.y - prev.y, head.x - prev.x);
        snake.trail = [];
        for (let i = 0; i < 180; i++)
          snake.trail.push(rivalCurve(t + index * 2 - i * 0.028));
      }
    }
    refreshHUD() {
      const player = this.player;
      $("score").textContent = number(player.score);
      $("hud-best").textContent = number(Math.max(best, player.score));
      const leaders = this.snakes
        .filter((snake) => snake.alive)
        .sort((a, b) => b.score - a.score);
      const top = leaders.slice(0, 5);
      if (player.alive && !top.includes(player)) top[4] = player;
      $("leaderboard-list").innerHTML = top
        .map(
          (snake) =>
            `<li class="${snake.isPlayer ? "you" : ""}"><span class="rank">${leaders.indexOf(snake) + 1}</span><span class="rival-dot" style="background:${hex(snake.color)}"></span><span class="rival-name">${snake.isPlayer ? "You" : snake.name}</span><span class="rival-score">${number(snake.score)}</span></li>`,
        )
        .join("");
      $("rival-count").textContent = leaders.filter(
        (snake) => !snake.isPlayer,
      ).length;
      $("boost-fill").style.width = `${player.energy}%`;
      $("boost-button").classList.toggle("active", player.boosting);
      $("boost-label").textContent = player.exhausted
        ? "RELEASE TO RECHARGE"
        : player.boosting
          ? "IN THE FAST LANE"
          : "HOLD TO SURGE";
      $("world-status").textContent =
        Math.hypot(player.x, player.y) > WORLD_RADIUS - 350
          ? "Outer rim ahead. Turn inward."
          : "Gather sparks. Keep moving.";
      this.drawMinimap();
    }
    drawMinimap() {
      const ctx = $("minimap").getContext("2d");
      const center = 70;
      const radius = 59;
      ctx.clearRect(0, 0, 140, 140);
      ctx.fillStyle = "#0b202bd9";
      ctx.strokeStyle = "#83b5ab3b";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#83b5ab16";
      ctx.beginPath();
      ctx.moveTo(11, 70);
      ctx.lineTo(129, 70);
      ctx.moveTo(70, 11);
      ctx.lineTo(70, 129);
      ctx.stroke();
      for (const snake of this.snakes) {
        if (!snake.alive) continue;
        ctx.fillStyle = snake.isPlayer ? "#f1f0df" : hex(snake.color);
        ctx.beginPath();
        ctx.arc(
          center + (snake.x / WORLD_RADIUS) * radius,
          center + (snake.y / WORLD_RADIUS) * radius,
          snake.isPlayer ? 3.5 : 2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      if (this.player.alive) {
        ctx.strokeStyle = "#6ceac05a";
        ctx.beginPath();
        ctx.arc(
          center + (this.player.x / WORLD_RADIUS) * radius,
          center + (this.player.y / WORLD_RADIUS) * radius,
          6,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }
    update(time, delta) {
      if (this.state === "loading" || this.state === "paused") return;
      const dt = Math.min(delta / 1000, 0.1);
      if (this.state === "playing") {
        this.accumulator += dt;
        while (this.accumulator >= FIXED_STEP && this.state !== "over") {
          this.step(FIXED_STEP);
          this.accumulator -= FIXED_STEP;
        }
      }
      if (this.state === "menu") this.animateMenu(dt);
      this.faces.clear();
      for (let i = 0; i < this.snakes.length; i++) {
        const snake = this.snakes[i];
        if (snake.alive && !(this.state === "menu" && i > 2))
          this.renderSnake(snake);
      }
      this.animateParticles(dt);
      // Only animate food that is on screen; the large map stays inexpensive.
      const view = this.cameras.main.worldView;
      for (const orb of this.food) {
        if (
          orb.x > view.left - 35 &&
          orb.x < view.right + 35 &&
          orb.y > view.top - 35 &&
          orb.y < view.bottom + 35
        ) {
          orb.sprite.setAlpha(0.77 + Math.sin(time * 0.002 + orb.phase) * 0.2);
        }
      }
      this.toastTime -= dt;
      if (this.toastTime <= 0) $("pickup-toast").classList.remove("show");
      if (this.state === "playing") {
        this.hudTimer -= dt;
        if (this.hudTimer <= 0) {
          this.refreshHUD();
          this.hudTimer = 0.1;
        }
      }
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#09151c",
    antialias: true,
    audio: { noAudio: true },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    input: { activePointers: 3 },
    render: { powerPreference: "high-performance", roundPixels: false },
    fps: { target: 60, forceSetTimeOut: false },
    scene: [Arena],
    banner: false,
  });
  // A useful console handle for local development, not required by gameplay.
  window.prismcoil = { game };
})();
