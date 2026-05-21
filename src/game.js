const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const trackButtons = [...document.querySelectorAll("[data-track]")];
const restartButton = document.querySelector("#restart-race");
const joypadElement = document.querySelector("#touch-joypad");
const joypadKnob = document.querySelector("#joypad-knob");

const VIEW = { w: 1280, h: 720 };
const TAU = Math.PI * 2;
const ROAD_EDGE = "rgba(243, 242, 232, 0.94)";
const ROAD_LINE = "rgba(255, 213, 98, 0.82)";
const ASPHALT = "#34383c";
const DIRT = "#6b563c";

const assetPaths = {
  grass: "assets/tiles/grass.png",
  soil: "assets/tiles/soil.png",
  finish: "assets/decor/finish.png",
  lights: "assets/decor/racing-lights.png",
  tree: "assets/decor/tree.png",
  rock: "assets/decor/rock.png",
  oil: "assets/items/oil.png",
  boost: "assets/items/boost.png",
  repair: "assets/items/repair.png",
  player: "assets/cars/player.png",
  aiBlue: "assets/cars/ai-blue.png",
  aiGreen: "assets/cars/ai-green.png",
};

const images = {};
const keys = new Set();
const joypad = { active: false, pointerId: null, x: 0, y: 0, magnitude: 0 };
let assetsReady = false;
let activeTrackIndex = 0;
let track;
let player;
let rivals = [];
let particles = [];
let camera = { x: 0, y: 0 };
let lastTime = performance.now();
let raceTime = 0;
let raceState = "countdown";
let countdown = 3.2;
let result = null;

const tracks = [
  {
    name: "Dockside Loop",
    laps: 3,
    width: 188,
    bg: "grass",
    world: { w: 2400, h: 1600 },
    points: [
      [520, 1220],
      [395, 945],
      [470, 585],
      [770, 350],
      [1240, 300],
      [1780, 365],
      [2075, 650],
      [2040, 1035],
      [1715, 1305],
      [1160, 1365],
      [735, 1320],
    ],
    decorations: [
      deco("tree", 210, 260, 86),
      deco("tree", 1970, 230, 78),
      deco("tree", 2180, 1310, 86),
      deco("rock", 330, 1325, 70),
      deco("rock", 2220, 730, 64),
      deco("lights", 565, 1170, 110),
    ],
    items: [
      item("boost", 775, 520, 0),
      item("oil", 1760, 520, 0.5),
      item("boost", 1880, 1095, 0),
      item("repair", 985, 1285, 0),
      item("oil", 660, 910, -0.3),
    ],
  },
  {
    name: "Switchback Park",
    laps: 3,
    width: 168,
    bg: "grass",
    world: { w: 2500, h: 1800 },
    points: [
      [610, 1450],
      [380, 1200],
      [420, 870],
      [715, 740],
      [1040, 835],
      [1320, 635],
      [1015, 375],
      [1285, 205],
      [1790, 245],
      [2130, 560],
      [1980, 890],
      [1630, 960],
      [1885, 1220],
      [1580, 1510],
      [1040, 1515],
    ],
    decorations: [
      deco("tree", 190, 480, 92),
      deco("tree", 540, 245, 76),
      deco("tree", 2200, 260, 88),
      deco("rock", 1540, 410, 72),
      deco("rock", 2170, 1120, 72),
      deco("lights", 645, 1395, 110),
    ],
    items: [
      item("boost", 740, 910, -0.2),
      item("oil", 1115, 730, 0.4),
      item("boost", 1435, 320, 0.7),
      item("oil", 1955, 760, -0.4),
      item("repair", 1725, 1330, 0.1),
    ],
  },
  {
    name: "Canyon Sprint",
    laps: 2,
    width: 180,
    bg: "soil",
    world: { w: 2700, h: 1700 },
    points: [
      [460, 1320],
      [355, 880],
      [630, 510],
      [1110, 440],
      [1410, 690],
      [1765, 510],
      [2240, 610],
      [2385, 990],
      [2120, 1305],
      [1545, 1400],
      [1060, 1230],
      [765, 1410],
    ],
    decorations: [
      deco("rock", 275, 490, 86),
      deco("rock", 520, 1225, 68),
      deco("rock", 1340, 1035, 74),
      deco("rock", 2320, 390, 82),
      deco("tree", 2250, 1375, 72),
      deco("lights", 500, 1270, 112),
    ],
    items: [
      item("boost", 620, 680, 0),
      item("oil", 1205, 530, 0.2),
      item("boost", 1865, 630, -0.2),
      item("oil", 2210, 1120, 0.5),
      item("repair", 1240, 1315, 0),
    ],
  },
];

function deco(type, x, y, size) {
  return { type, x, y, size };
}

function item(type, x, y, angle) {
  return { type, x, y, angle, active: true, respawn: 0 };
}

function loadImages() {
  const entries = Object.entries(assetPaths);
  return Promise.all(
    entries.map(([key, src]) => {
      const img = new Image();
      images[key] = img;
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        img.src = src;
      });
    }),
  ).then(() => {
    assetsReady = true;
  });
}

function buildTrack(index) {
  const base = tracks[index];
  const points = base.points.map(([x, y]) => ({ x, y }));
  const segments = points.map((point, i) => ({
    a: point,
    b: points[(i + 1) % points.length],
  }));
  const start = points[0];
  const next = points[1];

  track = {
    ...base,
    points,
    segments,
    items: base.items.map((it) => ({ ...it, active: true, respawn: 0 })),
    grassPattern: null,
    soilPattern: null,
  };

  player = makeCar({
    name: "YOU",
    image: images.player,
    x: start.x - 24,
    y: start.y + 46,
    angle: Math.atan2(next.y - start.y, next.x - start.x),
    color: "#ff5a3c",
    maxSpeed: 520,
    accel: 430,
    brake: 620,
    grip: 1,
    isPlayer: true,
  });

  const spawnOffsets = [38, 92, 145];
  const rivalDefs = [
    ["VEX", images.aiBlue, "#4fb1ff", 462, 0.96],
    ["RIFT", images.aiGreen, "#65e889", 445, 1.02],
    ["MOTH", images.aiBlue, "#b98dff", 430, 1.08],
  ];
  rivals = rivalDefs.map(([name, image, color, maxSpeed, lane], i) =>
    makeCar({
      name,
      image,
      x: start.x - spawnOffsets[i],
      y: start.y + 46 + i * 34,
      angle: player.angle,
      color,
      maxSpeed,
      accel: 360 + i * 18,
      brake: 520,
      grip: 0.9,
      aiLane: lane,
    }),
  );

  particles = [];
  raceTime = 0;
  countdown = 3.2;
  raceState = "countdown";
  result = null;
  camera.x = clamp(player.x - VIEW.w / 2, 0, track.world.w - VIEW.w);
  camera.y = clamp(player.y - VIEW.h / 2, 0, track.world.h - VIEW.h);
}

function makeCar(config) {
  return {
    ...config,
    speed: 0,
    turnVelocity: 0,
    radius: 38,
    lap: 1,
    checkpoint: 1,
    checkpointCount: 0,
    finished: false,
    finishTime: null,
    offroad: 0,
    spin: 0,
    boost: 0,
    damage: 0,
    rankScore: 0,
  };
}

function resetRace(index = activeTrackIndex) {
  activeTrackIndex = index;
  trackButtons.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.track) === index);
  });
  buildTrack(index);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function pointToSegmentDistance(px, py, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = px - a.x;
  const apy = py - a.y;
  const lengthSq = abx * abx + aby * aby || 1;
  const t = clamp((apx * abx + apy * aby) / lengthSq, 0, 1);
  const nx = a.x + abx * t;
  const ny = a.y + aby * t;
  return { dist: distance(px, py, nx, ny), x: nx, y: ny, t };
}

function trackInfo(x, y) {
  let best = { dist: Infinity, index: 0, x, y, t: 0 };
  track.segments.forEach((segment, index) => {
    const info = pointToSegmentDistance(x, y, segment.a, segment.b);
    if (info.dist < best.dist) best = { ...info, index };
  });
  return best;
}

function update(dt) {
  if (raceState === "countdown") {
    countdown -= dt;
    if (countdown <= 0) raceState = "racing";
  } else if (raceState === "racing") {
    raceTime += dt;
  }

  const raceActive = raceState === "racing";
  updatePlayer(dt, raceActive);
  rivals.forEach((car, index) => updateAi(car, index, dt, raceActive));
  resolveCarContacts([player, ...rivals]);
  updateItems(dt);
  updateProgress(player);
  rivals.forEach(updateProgress);
  updateCamera(dt);
  updateParticles(dt);
  updateResult();
}

function updatePlayer(dt, raceActive) {
  const throttleKey = (keys.has("up") ? 1 : 0) - (keys.has("down") ? 0.65 : 0);
  const steerKey = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0);
  const usingJoypad = joypad.active && joypad.magnitude > 0.08;
  let throttle = raceActive ? throttleKey : 0;
  let steer = steerKey;

  if (usingJoypad && raceActive) {
    const desired = Math.atan2(joypad.y, joypad.x);
    steer = clamp(angleDelta(player.angle, desired) / 0.82, -1, 1);
    throttle = clamp(0.42 + joypad.magnitude * 0.68, 0, 1);
  }

  driveCar(player, throttle, steer, dt);
}

function updateAi(car, index, dt, raceActive) {
  if (!raceActive || car.finished) {
    driveCar(car, 0, 0, dt);
    return;
  }

  const current = track.points[car.checkpoint % track.points.length];
  const next = track.points[(car.checkpoint + 1) % track.points.length];
  const dx = next.x - current.x;
  const dy = next.y - current.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const target = {
    x: current.x + nx * (index - 1) * 28 * car.aiLane,
    y: current.y + ny * (index - 1) * 28 * car.aiLane,
  };
  const desired = Math.atan2(target.y - car.y, target.x - car.x);
  const steer = clamp(angleDelta(car.angle, desired) / 0.7, -1, 1);
  const slowForCorner = Math.abs(steer) > 0.62 ? 0.68 : 1;
  const throttle = slowForCorner * (car.offroad ? 0.74 : 1);

  driveCar(car, throttle, steer, dt);
}

function driveCar(car, throttle, steer, dt) {
  const info = trackInfo(car.x, car.y);
  const offroad = info.dist > track.width * 0.5;
  const margin = clamp((info.dist - track.width * 0.37) / (track.width * 0.23), 0, 1);
  const surfaceGrip = offroad ? 0.42 : lerp(1, 0.72, margin);
  const surfaceMax = offroad ? 0.55 : lerp(1, 0.8, margin);
  const boostFactor = car.boost > 0 ? 1.35 : 1;
  const maxSpeed = car.maxSpeed * surfaceMax * boostFactor;
  const accel = throttle >= 0 ? car.accel : car.brake;
  const drag = offroad ? 0.93 : 0.985;

  car.offroad = offroad ? 1 : 0;
  car.boost = Math.max(0, car.boost - dt);
  car.spin = Math.max(0, car.spin - dt);
  car.speed += throttle * accel * dt;
  car.speed *= Math.pow(drag, dt * 60);
  car.speed = clamp(car.speed, -145, maxSpeed);

  const speedRatio = clamp(Math.abs(car.speed) / car.maxSpeed, 0.16, 1);
  const turnRate = (2.35 + speedRatio * 2.15) * surfaceGrip * car.grip;
  const spinNoise = car.spin > 0 ? Math.sin(performance.now() * 0.018) * 1.25 : 0;

  car.angle += (steer + spinNoise) * turnRate * dt * Math.sign(car.speed || 1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 54, track.world.w - 54);
  car.y = clamp(car.y, 54, track.world.h - 54);

  if (Math.abs(car.speed) > 220 && Math.random() < dt * 12) {
    particles.push({
      x: car.x - Math.cos(car.angle) * 34,
      y: car.y - Math.sin(car.angle) * 34,
      vx: -Math.cos(car.angle) * 18 + (Math.random() - 0.5) * 24,
      vy: -Math.sin(car.angle) * 18 + (Math.random() - 0.5) * 24,
      life: 0.45,
      color: offroad ? "rgba(141, 104, 67, 0.7)" : "rgba(20, 22, 24, 0.42)",
    });
  }
}

function resolveCarContacts(cars) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const min = a.radius + b.radius;
      if (d >= min) continue;
      const push = (min - d) * 0.54;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const exchange = (a.speed - b.speed) * 0.18;
      a.speed -= exchange;
      b.speed += exchange;
      a.damage = Math.min(1, a.damage + 0.03);
      b.damage = Math.min(1, b.damage + 0.03);
    }
  }
}

function updateItems(dt) {
  track.items.forEach((it) => {
    if (!it.active) {
      it.respawn -= dt;
      if (it.respawn <= 0) it.active = true;
      return;
    }
    [player, ...rivals].forEach((car) => {
      if (!it.active || car.finished || distance(car.x, car.y, it.x, it.y) > 54) return;
      if (it.type === "boost") car.boost = 1.65;
      if (it.type === "oil") car.spin = 1.15;
      if (it.type === "repair") car.damage = Math.max(0, car.damage - 0.35);
      it.active = false;
      it.respawn = 8;
    });
  });
}

function updateProgress(car) {
  if (car.finished) return;
  const target = track.points[car.checkpoint % track.points.length];
  if (distance(car.x, car.y, target.x, target.y) < track.width * 0.52) {
    car.checkpoint = (car.checkpoint + 1) % track.points.length;
    car.checkpointCount += 1;
    if (car.checkpoint === 1 && car.checkpointCount > track.points.length - 2) {
      car.lap += 1;
      if (car.lap > track.laps) {
        car.finished = true;
        car.finishTime = raceTime;
        if (car.isPlayer) raceState = "finished";
      }
    }
  }
  const info = trackInfo(car.x, car.y);
  car.rankScore = (car.lap - 1) * track.points.length + car.checkpointCount + info.t;
}

function updateCamera(dt) {
  camera.x = lerp(camera.x, clamp(player.x - VIEW.w / 2, 0, track.world.w - VIEW.w), Math.min(1, dt * 5));
  camera.y = lerp(camera.y, clamp(player.y - VIEW.h / 2, 0, track.world.h - VIEW.h), Math.min(1, dt * 5));
}

function updateParticles(dt) {
  particles.forEach((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  });
  particles = particles.filter((p) => p.life > 0);
}

function updateResult() {
  const allCars = [player, ...rivals];
  const order = [...allCars].sort((a, b) => b.rankScore - a.rankScore);
  order.forEach((car, index) => {
    car.position = index + 1;
  });
  if (raceState === "finished" && !result) {
    result = {
      place: player.position,
      time: raceTime,
      finished: rivals.filter((rival) => rival.finished).length + 1,
    };
  }
}

function draw() {
  ctx.clearRect(0, 0, VIEW.w, VIEW.h);
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  drawWorld();
  drawTrack();
  drawDecorations();
  drawItems();
  drawParticles();
  drawCars();
  ctx.restore();
  drawHud();
  if (!assetsReady) drawOverlay("Loading assets", "Preparing the night race.");
  if (raceState === "countdown") drawCountdown();
  if (raceState === "finished") drawOverlay("Race finished", `P${result?.place ?? player.position}  |  ${formatTime(raceTime)}  |  Press R to restart`);
}

function drawWorld() {
  const patternImg = images[track.bg] || images.grass;
  const pattern = patternImg?.complete ? ctx.createPattern(patternImg, "repeat") : null;
  ctx.fillStyle = pattern || "#315237";
  ctx.fillRect(0, 0, track.world.w, track.world.h);

  ctx.fillStyle = track.bg === "soil" ? "rgba(91, 68, 39, 0.28)" : "rgba(18, 62, 38, 0.23)";
  for (let x = -160; x < track.world.w; x += 240) {
    for (let y = -160; y < track.world.h; y += 220) {
      if ((x + y) % 3 === 0) ctx.fillRect(x + 30, y + 70, 92, 46);
    }
  }
}

function drawTrack() {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  drawTrackLine(track.width + 28, "rgba(29, 30, 32, 0.58)");
  drawTrackLine(track.width + 12, ROAD_EDGE);
  drawTrackLine(track.width, ASPHALT);
  drawTrackLine(6, ROAD_LINE, [42, 34]);

  const start = track.points[0];
  const next = track.points[1];
  const angle = Math.atan2(next.y - start.y, next.x - start.x);
  drawImageRotated(images.finish, start.x, start.y, 150, 48, angle + Math.PI / 2);
  ctx.restore();
}

function drawTrackLine(width, color, dash = null) {
  ctx.beginPath();
  track.points.forEach((p, index) => {
    if (index === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.setLineDash(dash || []);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawDecorations() {
  track.decorations.forEach((d) => {
    const image = images[d.type];
    if (!image?.complete) return;
    drawImageRotated(image, d.x, d.y, d.size, d.size, 0);
  });
}

function drawItems() {
  track.items.forEach((it) => {
    if (!it.active) return;
    const image = images[it.type];
    if (!image?.complete) return;
    const pulse = Math.sin(performance.now() / 180 + it.x) * 4;
    const size = it.type === "oil" ? 66 : 58;
    drawImageRotated(image, it.x, it.y + pulse, size, size, it.angle);
  });
}

function drawParticles() {
  particles.forEach((p) => {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = clamp(p.life / 0.45, 0, 1);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10 * (1 - p.life), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function drawCars() {
  [...rivals, player].forEach((car) => {
    const w = car.isPlayer ? 50 : 48;
    const h = car.isPlayer ? 102 : 98;
    drawCarShadow(car, w, h);
    drawImageRotated(car.image, car.x, car.y, w, h, car.angle + Math.PI / 2);
    if (car.boost > 0) drawBoostFlame(car);
    drawNamePlate(car);
  });
}

function drawCarShadow(car, w, h) {
  ctx.save();
  ctx.translate(car.x + 7, car.y + 10);
  ctx.rotate(car.angle + Math.PI / 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.55, h * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawBoostFlame(car) {
  ctx.save();
  ctx.translate(car.x - Math.cos(car.angle) * 48, car.y - Math.sin(car.angle) * 48);
  ctx.rotate(car.angle);
  ctx.fillStyle = "rgba(91, 219, 255, 0.7)";
  ctx.beginPath();
  ctx.moveTo(-18, -9);
  ctx.lineTo(-52, 0);
  ctx.lineTo(-18, 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawNamePlate(car) {
  ctx.fillStyle = car.color;
  ctx.font = "800 13px Inter, system-ui";
  ctx.textAlign = "center";
  ctx.fillText(car.name, car.x, car.y - 64);
  ctx.textAlign = "left";
}

function drawImageRotated(image, x, y, w, h, angle) {
  if (!image?.complete || image.naturalWidth === 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = "#ef476f";
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(image, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawHud() {
  const speed = Math.max(0, Math.round(player.speed * 0.32));
  const lap = Math.min(player.lap, track.laps);
  const place = player.position || 1;

  ctx.fillStyle = "rgba(10, 12, 16, 0.76)";
  ctx.fillRect(18, 16, 390, 62);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.strokeRect(18, 16, 390, 62);

  ctx.fillStyle = "#fff7df";
  ctx.font = "900 20px Inter, system-ui";
  ctx.fillText(track.name, 36, 42);
  ctx.font = "800 14px Inter, system-ui";
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fillText(`Lap ${lap}/${track.laps}`, 36, 66);
  ctx.fillText(`P${place}/4`, 134, 66);
  ctx.fillText(`${formatTime(raceTime)}`, 222, 66);
  ctx.fillText(`${speed} km/h`, 318, 66);

  drawMiniMap();
  drawLeaderboard();
  drawControls();
}

function drawLeaderboard() {
  const order = [player, ...rivals].sort((a, b) => b.rankScore - a.rankScore);
  const x = VIEW.w - 288;
  ctx.fillStyle = "rgba(10, 12, 16, 0.76)";
  ctx.fillRect(x, 16, 270, 128);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.strokeRect(x, 16, 270, 128);
  ctx.fillStyle = "#ffda70";
  ctx.font = "900 14px Inter, system-ui";
  ctx.fillText("RACE ORDER", x + 18, 42);
  order.forEach((car, index) => {
    ctx.fillStyle = car.isPlayer ? "#ffffff" : "rgba(255,255,255,0.72)";
    ctx.font = "800 14px Inter, system-ui";
    ctx.fillText(`${index + 1}. ${car.name}`, x + 18, 68 + index * 20);
    ctx.fillStyle = car.color;
    ctx.fillRect(x + 212, 58 + index * 20, 28, 7);
  });
}

function drawMiniMap() {
  const x = 22;
  const y = VIEW.h - 174;
  const w = 214;
  const h = 136;
  const sx = w / track.world.w;
  const sy = h / track.world.h;

  ctx.fillStyle = "rgba(10, 12, 16, 0.78)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.strokeRect(x, y, w, h);
  ctx.beginPath();
  track.points.forEach((p, index) => {
    const px = x + p.x * sx;
    const py = y + p.y * sy;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.stroke();

  [player, ...rivals].forEach((car) => {
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.arc(x + car.x * sx, y + car.y * sy, car.isPlayer ? 4 : 3, 0, TAU);
    ctx.fill();
  });
}

function drawControls() {
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "800 13px Inter, system-ui";
  ctx.fillText("Keyboard: WASD / arrows   Touch: drag the joypad   1-3: tracks   R: restart", 272, VIEW.h - 34);
}

function drawCountdown() {
  const number = Math.ceil(countdown);
  const label = number > 0 ? String(number) : "GO";
  ctx.fillStyle = "rgba(4, 6, 9, 0.38)";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 104px Inter, system-ui";
  ctx.fillText(label, VIEW.w / 2, VIEW.h / 2 + 36);
  ctx.textAlign = "left";
}

function drawOverlay(title, subtitle) {
  ctx.fillStyle = "rgba(4, 6, 9, 0.72)";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 56px Inter, system-ui";
  ctx.fillText(title, VIEW.w / 2, VIEW.h / 2 - 8);
  ctx.fillStyle = "#ffda70";
  ctx.font = "800 19px Inter, system-ui";
  ctx.fillText(subtitle, VIEW.w / 2, VIEW.h / 2 + 35);
  ctx.textAlign = "left";
}

function formatTime(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60).toString().padStart(2, "0");
  const ms = Math.floor((seconds % 1) * 100).toString().padStart(2, "0");
  return `${min}:${sec}.${ms}`;
}

function loop(now) {
  const dt = Math.min(0.04, (now - lastTime) / 1000);
  lastTime = now;
  if (track) update(dt);
  if (track) draw();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  const mapped = mapKey(event.key);
  if (mapped) {
    event.preventDefault();
    keys.add(mapped);
  }
  if (event.key === "r" || event.key === "R") resetRace();
  if (["1", "2", "3"].includes(event.key)) resetRace(Number(event.key) - 1);
});

window.addEventListener("keyup", (event) => {
  const mapped = mapKey(event.key);
  if (mapped) keys.delete(mapped);
});

trackButtons.forEach((button) => {
  button.addEventListener("click", () => resetRace(Number(button.dataset.track)));
});

restartButton?.addEventListener("click", () => resetRace());

function mapKey(key) {
  const value = key.toLowerCase();
  if (value === "w" || value === "arrowup") return "up";
  if (value === "s" || value === "arrowdown") return "down";
  if (value === "a" || value === "arrowleft") return "left";
  if (value === "d" || value === "arrowright") return "right";
  return null;
}

if (joypadElement && joypadKnob) {
  const updateJoypad = (event) => {
    const bounds = joypadElement.getBoundingClientRect();
    const cx = bounds.left + bounds.width / 2;
    const cy = bounds.top + bounds.height / 2;
    const rawX = event.clientX - cx;
    const rawY = event.clientY - cy;
    const limit = Math.min(bounds.width, bounds.height) * 0.36;
    const dist = Math.hypot(rawX, rawY);
    const scale = dist > limit ? limit / dist : 1;
    const knobX = rawX * scale;
    const knobY = rawY * scale;

    joypad.x = clamp(knobX / limit, -1, 1);
    joypad.y = clamp(knobY / limit, -1, 1);
    joypad.magnitude = clamp(dist / limit, 0, 1);
    joypadKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
  };

  const resetJoypad = () => {
    joypad.active = false;
    joypad.pointerId = null;
    joypad.x = 0;
    joypad.y = 0;
    joypad.magnitude = 0;
    joypadKnob.style.transform = "translate(-50%, -50%)";
  };

  joypadElement.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    joypad.active = true;
    joypad.pointerId = event.pointerId;
    joypadElement.setPointerCapture(event.pointerId);
    updateJoypad(event);
  });
  joypadElement.addEventListener("pointermove", (event) => {
    if (joypad.pointerId !== event.pointerId) return;
    event.preventDefault();
    updateJoypad(event);
  });
  joypadElement.addEventListener("pointerup", (event) => {
    if (joypad.pointerId === event.pointerId) resetJoypad();
  });
  joypadElement.addEventListener("pointercancel", (event) => {
    if (joypad.pointerId === event.pointerId) resetJoypad();
  });
}

loadImages().then(() => resetRace(0));
requestAnimationFrame(loop);
