const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const VIEW = { w: 1280, h: 720 };
const WORLD = { w: 2600, h: 1700 };
const TAU = Math.PI * 2;

const palette = {
  void: "#061018",
  ground: "#0a1820",
  road: "#1c2630",
  roadEdge: "#334552",
  lane: "#f4bc55",
  cyan: "#48d7e8",
  teal: "#29b79b",
  amber: "#ffb84d",
  red: "#ff5c66",
  magenta: "#e460b6",
  white: "#edf7ff",
  muted: "#8fa6b7",
};

const keys = new Set();
const joypad = {
  active: false,
  pointerId: null,
  x: 0,
  y: 0,
  radius: 55,
};
const camera = { x: 0, y: 0 };
let lastTime = performance.now();
let shake = 0;
let missionPhase = 0;
let delivered = 0;
let terminalIndex = 0;
let messageTimer = 4;
let missionComplete = false;

const roads = [
  rect(260, 250, 2080, 180),
  rect(260, 1270, 2080, 180),
  rect(260, 250, 180, 1200),
  rect(2160, 250, 180, 1200),
  rect(650, 650, 1300, 190),
  rect(650, 860, 1300, 170),
  rect(1130, 250, 210, 1020),
  rect(260, 780, 570, 150),
  rect(1770, 760, 570, 150),
];

const buildings = [
  block(90, 80, 280, 130, "#17313b", "GARAGE"),
  block(455, 75, 270, 125, "#272339", "CLINIC"),
  block(840, 70, 220, 120, "#172c36", "MARKET"),
  block(1480, 70, 320, 130, "#2d2130", "ARCADE"),
  block(2020, 75, 300, 130, "#1a342f", "HANGAR"),
  block(520, 475, 400, 150, "#1c2a35", "NEON ROW"),
  block(1465, 465, 420, 170, "#322234", "STACKS"),
  block(520, 1060, 395, 160, "#1d3038", "CARGO"),
  block(1470, 1065, 420, 155, "#24312c", "RELAY"),
  block(90, 1510, 360, 140, "#2a2635", "SCRAP"),
  block(680, 1510, 300, 135, "#17313d", "MOTEL"),
  block(1300, 1500, 310, 150, "#2f2632", "VENDOR"),
  block(1940, 1510, 355, 135, "#193439", "DOCK"),
  block(1035, 525, 90, 130, "#302a25", "PUMP"),
  block(1350, 1040, 90, 150, "#302a25", "PUMP"),
];

const obstacles = [
  ...buildings,
  rect(1020, 890, 90, 120),
  rect(1450, 680, 90, 110),
  rect(760, 880, 80, 100),
  rect(1860, 930, 75, 120),
  rect(410, 560, 55, 250),
  rect(2105, 920, 55, 260),
];

const garage = rect(140, 135, 190, 130);
const extraction = rect(2200, 1320, 110, 90);
const terminals = [
  { x: 780, y: 1110, label: "CARGO RELAY" },
  { x: 1660, y: 535, label: "ROOF SERVER" },
];

const crates = [
  crate(785, 705),
  crate(1750, 810),
  crate(1090, 1185),
  crate(1850, 1325),
];

const drones = [
  drone(1980, 310, 0),
  drone(2220, 1420, 1),
  drone(330, 1345, 2),
];

buildings.forEach((building, index) => {
  building.windows = [];
  for (let x = building.x + 22; x < building.x + building.w - 18; x += 44) {
    const warm = (index + Math.floor(x / 44)) % 3 === 0;
    building.windows.push({ x, warm });
  }
});

const player = {
  x: 190,
  y: 220,
  angle: -0.1,
  speed: 0,
  radius: 18,
  health: 100,
  cargo: 0,
  invulnerable: 0,
};

function rect(x, y, w, h) {
  return { x, y, w, h };
}

function block(x, y, w, h, color, label) {
  return { x, y, w, h, color, label };
}

function crate(x, y) {
  return { x, y, taken: false, delivered: false, pulse: Math.random() * 10 };
}

function drone(x, y, patrol) {
  return { x, y, vx: 0, vy: 0, radius: 17, alert: 0, patrol };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b, c, d) {
  return Math.hypot(a - c, b - d);
}

function control(name) {
  return keys.has(name);
}

function resolveCircleRect(entity, r) {
  const nearestX = clamp(entity.x, r.x, r.x + r.w);
  const nearestY = clamp(entity.y, r.y, r.y + r.h);
  const dx = entity.x - nearestX;
  const dy = entity.y - nearestY;
  const d = Math.hypot(dx, dy);
  if (d > 0 && d < entity.radius) {
    const push = entity.radius - d;
    entity.x += (dx / d) * push;
    entity.y += (dy / d) * push;
    entity.speed *= -0.22;
    shake = Math.max(shake, 4);
    return true;
  }
  return false;
}

function update(dt) {
  const keyboardThrottle = (control("up") ? 1 : 0) - (control("down") ? 0.7 : 0);
  const keyboardTurn = (control("right") ? 1 : 0) - (control("left") ? 1 : 0);
  const throttleAxis = joypad.active ? -joypad.y : keyboardThrottle;
  const turnInput = joypad.active ? joypad.x : keyboardTurn;
  const thrust = throttleAxis >= 0 ? throttleAxis * 440 : throttleAxis * 260;
  const turnRate = 2.55 * clamp(Math.abs(player.speed) / 170, 0.28, 1);

  player.angle += turnInput * turnRate * dt * Math.sign(player.speed || 1);
  player.speed += thrust * dt;
  player.speed *= Math.pow(0.965, dt * 60);
  player.speed = clamp(player.speed, -210, 360);

  player.x += Math.cos(player.angle) * player.speed * dt;
  player.y += Math.sin(player.angle) * player.speed * dt;
  player.x = clamp(player.x, 50, WORLD.w - 50);
  player.y = clamp(player.y, 50, WORLD.h - 50);
  player.invulnerable = Math.max(0, player.invulnerable - dt);

  for (const obstacle of obstacles) {
    resolveCircleRect(player, obstacle);
  }

  for (const item of crates) {
    item.pulse += dt * 5;
    if (!item.taken && distance(player.x, player.y, item.x, item.y) < 44) {
      item.taken = true;
      player.cargo += 1;
      messageTimer = 2.8;
      shake = Math.max(shake, 2);
    }
  }

  if (player.cargo > 0 && circleInRect(player, garage)) {
    delivered += player.cargo;
    player.cargo = 0;
    messageTimer = 3;
    if (delivered >= 3 && missionPhase === 0) {
      missionPhase = 1;
      messageTimer = 5;
    }
  }

  if (missionPhase === 1) {
    const terminal = terminals[terminalIndex];
    if (terminal && distance(player.x, player.y, terminal.x, terminal.y) < 48) {
      terminalIndex += 1;
      messageTimer = 3.5;
      if (terminalIndex >= terminals.length) {
        missionPhase = 2;
        messageTimer = 4;
      }
    }
  }

  if (missionPhase === 2 && circleInRect(player, extraction)) {
    missionComplete = true;
    missionPhase = 3;
    messageTimer = 99;
  }

  updateDrones(dt);

  camera.x += (player.x - VIEW.w / 2 - camera.x) * Math.min(1, dt * 7);
  camera.y += (player.y - VIEW.h / 2 - camera.y) * Math.min(1, dt * 7);
  camera.x = clamp(camera.x, 0, WORLD.w - VIEW.w);
  camera.y = clamp(camera.y, 0, WORLD.h - VIEW.h);
  shake = Math.max(0, shake - dt * 12);
  messageTimer = Math.max(0, messageTimer - dt);
}

function updateDrones(dt) {
  const active = player.cargo > 0 || missionPhase >= 1;
  drones.forEach((enemy, index) => {
    const patrolTarget = patrolPoint(enemy.patrol, performance.now() / 1000);
    const targetX = active ? player.x : patrolTarget.x;
    const targetY = active ? player.y : patrolTarget.y;
    const dx = targetX - enemy.x;
    const dy = targetY - enemy.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const speed = active ? 155 + index * 13 : 78;
    enemy.vx += ((dx / d) * speed - enemy.vx) * Math.min(1, dt * 2.6);
    enemy.vy += ((dy / d) * speed - enemy.vy) * Math.min(1, dt * 2.6);
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    enemy.alert = active ? Math.min(1, enemy.alert + dt * 2) : Math.max(0, enemy.alert - dt);

    if (distance(player.x, player.y, enemy.x, enemy.y) < player.radius + enemy.radius) {
      if (player.invulnerable <= 0) {
        player.health = Math.max(0, player.health - 14);
        player.invulnerable = 0.8;
        player.speed *= -0.35;
        shake = 12;
      }
    }
  });
}

function patrolPoint(index, time) {
  const points = [
    { x: 1990 + Math.cos(time * 0.8) * 180, y: 330 + Math.sin(time * 0.8) * 80 },
    { x: 2170 + Math.cos(time * 0.65) * 100, y: 1325 + Math.sin(time * 0.65) * 115 },
    { x: 425 + Math.cos(time * 0.7) * 120, y: 1230 + Math.sin(time * 0.7) * 150 },
  ];
  return points[index % points.length];
}

function circleInRect(entity, r) {
  return entity.x > r.x && entity.x < r.x + r.w && entity.y > r.y && entity.y < r.y + r.h;
}

function draw() {
  ctx.clearRect(0, 0, VIEW.w, VIEW.h);
  ctx.save();
  const shakeX = (Math.random() - 0.5) * shake;
  const shakeY = (Math.random() - 0.5) * shake;
  ctx.translate(-camera.x + shakeX, -camera.y + shakeY);
  drawWorld();
  drawMissionZones();
  drawCrates();
  drawDrones();
  drawPlayer();
  ctx.restore();
  drawHud();
  if (player.health <= 0) drawEndOverlay("Vehicle disabled", "Refresh to try again.");
  if (missionComplete) drawEndOverlay("Contract complete", "Neon Junction is open for the next district.");
}

function drawWorld() {
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  drawGrid();
  roads.forEach(drawRoad);
  drawRoadMarkers();

  buildings.forEach(drawBuilding);
  drawProps();
}

function drawGrid() {
  ctx.strokeStyle = "rgba(98, 130, 144, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD.w; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD.h);
    ctx.stroke();
  }
  for (let y = 0; y <= WORLD.h; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD.w, y);
    ctx.stroke();
  }
}

function drawRoad(r) {
  ctx.fillStyle = palette.road;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = palette.roadEdge;
  ctx.lineWidth = 5;
  ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
}

function drawRoadMarkers() {
  ctx.save();
  ctx.strokeStyle = "rgba(244, 188, 85, 0.7)";
  ctx.lineWidth = 4;
  ctx.setLineDash([24, 28]);
  roads.slice(0, 2).forEach((r) => {
    ctx.beginPath();
    ctx.moveTo(r.x + 50, r.y + r.h / 2);
    ctx.lineTo(r.x + r.w - 50, r.y + r.h / 2);
    ctx.stroke();
  });
  roads.slice(2, 4).forEach((r) => {
    ctx.beginPath();
    ctx.moveTo(r.x + r.w / 2, r.y + 45);
    ctx.lineTo(r.x + r.w / 2, r.y + r.h - 45);
    ctx.stroke();
  });
  ctx.restore();
}

function drawBuilding(b) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(b.x + 10, b.y + 12, b.w, b.h);
  ctx.fillStyle = b.color;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = "rgba(159, 232, 255, 0.25)";
  ctx.lineWidth = 3;
  ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);

  b.windows.forEach((window) => {
    ctx.fillStyle = window.warm ? "rgba(255, 184, 77, 0.62)" : "rgba(72, 215, 232, 0.72)";
    ctx.fillRect(window.x, b.y + 20, 20, 9);
  });

  ctx.fillStyle = "rgba(237, 247, 255, 0.7)";
  ctx.font = "700 13px Inter, system-ui";
  ctx.fillText(b.label, b.x + 16, b.y + b.h - 18);
}

function drawProps() {
  const props = [
    { x: 1020, y: 890, w: 90, h: 120, c: palette.teal },
    { x: 1450, y: 680, w: 90, h: 110, c: palette.amber },
    { x: 760, y: 880, w: 80, h: 100, c: palette.magenta },
    { x: 1860, y: 930, w: 75, h: 120, c: palette.cyan },
  ];
  props.forEach((p) => {
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(p.x + 7, p.y + 9, p.w, p.h);
    ctx.fillStyle = "rgba(18, 33, 43, 0.95)";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = p.c;
    ctx.lineWidth = 3;
    ctx.strokeRect(p.x + 4, p.y + 4, p.w - 8, p.h - 8);
  });
}

function drawMissionZones() {
  drawZone(garage, palette.teal, "GARAGE");
  drawZone(extraction, palette.amber, "EXIT");
  terminals.forEach((terminal, index) => {
    const active = missionPhase === 1 && index === terminalIndex;
    drawBeacon(terminal.x, terminal.y, active ? palette.amber : "rgba(143,166,183,0.55)", terminal.label);
  });
}

function drawZone(r, color, label) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 10]);
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.setLineDash([]);
  ctx.fillStyle = `${color}22`;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = palette.white;
  ctx.font = "800 15px Inter, system-ui";
  ctx.fillText(label, r.x + 14, r.y + 26);
  ctx.restore();
}

function drawBeacon(x, y, color, label) {
  const pulse = 1 + Math.sin(performance.now() / 180) * 0.12;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 28 * pulse, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(-12, -12, 24, 24);
  ctx.fillStyle = palette.white;
  ctx.font = "800 13px Inter, system-ui";
  ctx.fillText(label, 18, -18);
  ctx.restore();
}

function drawCrates() {
  crates.forEach((item) => {
    if (item.taken) return;
    const pulse = Math.sin(item.pulse) * 3;
    ctx.save();
    ctx.translate(item.x, item.y + pulse);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fillRect(-18, -14, 36, 28);
    ctx.fillStyle = palette.amber;
    ctx.fillRect(-15, -15, 30, 30);
    ctx.strokeStyle = palette.white;
    ctx.lineWidth = 2;
    ctx.strokeRect(-15, -15, 30, 30);
    ctx.restore();
  });
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
  ctx.fillRect(-24, -15, 52, 34);
  ctx.fillStyle = player.invulnerable > 0 ? "#ffdf76" : palette.cyan;
  roundedRect(-25, -14, 50, 28, 6);
  ctx.fill();
  ctx.fillStyle = "#0d1f2a";
  roundedRect(-6, -10, 20, 20, 5);
  ctx.fill();
  ctx.fillStyle = palette.amber;
  ctx.fillRect(17, -5, 12, 10);
  ctx.restore();
}

function drawDrones() {
  drones.forEach((enemy) => {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.arc(4, 6, 20, 0, TAU);
    ctx.fill();
    ctx.fillStyle = enemy.alert > 0.2 ? palette.red : "#496271";
    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(-15, -15);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-15, 15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = enemy.alert > 0.2 ? palette.amber : palette.cyan;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  });
}

function drawHud() {
  drawTopBar();
  drawMissionPanel();
  drawMiniMap();
  drawControlsHint();
}

function drawTopBar() {
  ctx.fillStyle = "rgba(4, 12, 18, 0.76)";
  ctx.fillRect(18, 16, 620, 52);
  ctx.strokeStyle = "rgba(72, 215, 232, 0.28)";
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 16, 620, 52);

  meter(36, 32, 172, 12, player.health / 100, palette.red, "HULL");
  meter(244, 32, 152, 12, player.cargo / 3, palette.amber, "CARGO");
  const wanted = player.cargo > 0 || missionPhase >= 1 ? 1 : 0;
  meter(430, 32, 170, 12, wanted, palette.magenta, "WANTED");
}

function meter(x, y, w, h, value, color, label) {
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(value, 0, 1), h);
  ctx.fillStyle = palette.white;
  ctx.font = "800 11px Inter, system-ui";
  ctx.fillText(label, x, y + 29);
}

function drawMissionPanel() {
  const mission = getMissionText();
  ctx.fillStyle = "rgba(4, 12, 18, 0.8)";
  ctx.fillRect(VIEW.w - 420, 18, 392, 104);
  ctx.strokeStyle = "rgba(255, 184, 77, 0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(VIEW.w - 420, 18, 392, 104);
  ctx.fillStyle = palette.amber;
  ctx.font = "900 15px Inter, system-ui";
  ctx.fillText(mission.title, VIEW.w - 398, 47);
  ctx.fillStyle = palette.white;
  ctx.font = "700 20px Inter, system-ui";
  wrapText(mission.body, VIEW.w - 398, 76, 345, 25);

  if (messageTimer > 0) {
    ctx.fillStyle = "rgba(72, 215, 232, 0.92)";
    ctx.font = "900 17px Inter, system-ui";
    ctx.fillText(getToastText(), VIEW.w - 398, 151);
  }
}

function getMissionText() {
  if (player.health <= 0) return { title: "CONTRACT FAILED", body: "Your vehicle is disabled." };
  if (missionComplete) return { title: "CONTRACT COMPLETE", body: "Prototype loop finished. Next: bigger district." };
  if (missionPhase === 0) {
    return { title: "MISSION 1: SCRAP RUN", body: `Collect plasma crates and deliver 3 to the garage. Delivered: ${delivered}/3.` };
  }
  if (missionPhase === 1) {
    return { title: "MISSION 2: RELAY SWEEP", body: `Hack terminals in order. Current: ${terminals[terminalIndex]?.label ?? "done"}.` };
  }
  return { title: "MISSION 2: RELAY SWEEP", body: "Reach the east exit before the drones box you in." };
}

function getToastText() {
  if (missionComplete) return "District unlocked.";
  if (missionPhase === 1 && terminalIndex === 0 && delivered >= 3) return "Garage paid. Relay contract unlocked.";
  if (missionPhase === 2) return "Terminals hacked. Reach the exit.";
  if (player.cargo > 0) return "Cargo acquired. Return to garage.";
  if (delivered > 0) return "Delivery accepted.";
  return "WASD / arrows to drive.";
}

function drawMiniMap() {
  const x = 24;
  const y = VIEW.h - 188;
  const w = 230;
  const h = 150;
  ctx.fillStyle = "rgba(4, 12, 18, 0.82)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(143, 166, 183, 0.38)";
  ctx.strokeRect(x, y, w, h);

  const sx = w / WORLD.w;
  const sy = h / WORLD.h;
  roads.forEach((r) => {
    ctx.fillStyle = "rgba(72, 215, 232, 0.16)";
    ctx.fillRect(x + r.x * sx, y + r.y * sy, r.w * sx, r.h * sy);
  });
  crates.forEach((c) => {
    if (!c.taken) {
      ctx.fillStyle = palette.amber;
      ctx.fillRect(x + c.x * sx - 2, y + c.y * sy - 2, 4, 4);
    }
  });
  drones.forEach((d) => {
    ctx.fillStyle = palette.red;
    ctx.fillRect(x + d.x * sx - 2, y + d.y * sy - 2, 4, 4);
  });
  ctx.fillStyle = palette.cyan;
  ctx.beginPath();
  ctx.arc(x + player.x * sx, y + player.y * sy, 4, 0, TAU);
  ctx.fill();
}

function drawControlsHint() {
  ctx.fillStyle = "rgba(237, 247, 255, 0.72)";
  ctx.font = "800 13px Inter, system-ui";
  ctx.fillText("Drive: WASD / arrows or touch joypad", 286, VIEW.h - 34);
}

function drawEndOverlay(title, subtitle) {
  ctx.fillStyle = "rgba(4, 12, 18, 0.78)";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  ctx.fillStyle = palette.white;
  ctx.textAlign = "center";
  ctx.font = "900 54px Inter, system-ui";
  ctx.fillText(title, VIEW.w / 2, VIEW.h / 2 - 8);
  ctx.font = "700 20px Inter, system-ui";
  ctx.fillStyle = palette.amber;
  ctx.fillText(subtitle, VIEW.w / 2, VIEW.h / 2 + 36);
  ctx.textAlign = "left";
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function wrapText(text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, y);
}

function loop(now) {
  const dt = Math.min(0.04, (now - lastTime) / 1000);
  lastTime = now;
  if (player.health > 0 && !missionComplete) update(dt);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  const mapped = mapKey(event.key);
  if (mapped) {
    event.preventDefault();
    keys.add(mapped);
  }
});

window.addEventListener("keyup", (event) => {
  const mapped = mapKey(event.key);
  if (mapped) keys.delete(mapped);
});

const joypadElement = document.querySelector("#touch-joypad");
const joypadKnob = document.querySelector("#joypad-knob");

if (joypadElement && joypadKnob) {
  const updateJoypad = (event) => {
    const bounds = joypadElement.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const limit = Math.min(bounds.width, bounds.height) * 0.36;
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > limit ? limit / distance : 1;
    const knobX = rawX * scale;
    const knobY = rawY * scale;

    joypad.x = clamp(knobX / limit, -1, 1);
    joypad.y = clamp(knobY / limit, -1, 1);
    joypadKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
  };

  const resetJoypad = () => {
    joypad.active = false;
    joypad.pointerId = null;
    joypad.x = 0;
    joypad.y = 0;
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

function mapKey(key) {
  const value = key.toLowerCase();
  if (value === "w" || value === "arrowup") return "up";
  if (value === "s" || value === "arrowdown") return "down";
  if (value === "a" || value === "arrowleft") return "left";
  if (value === "d" || value === "arrowright") return "right";
  return null;
}

requestAnimationFrame(loop);
