const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let W = 1280;
let H = 720;

function resize() {
  const ratio = window.innerWidth / window.innerHeight;
  H = 720;
  W = Math.max(960, Math.round(H * ratio));
  canvas.width = W;
  canvas.height = H;
}
window.addEventListener("resize", resize);
resize();

const textures = {};

function removeGrayBackground(img) {
  const off = document.createElement("canvas");
  off.width = img.width;
  off.height = img.height;
  const octx = off.getContext("2d");
  octx.drawImage(img, 0, 0);
  const imgData = octx.getImageData(0, 0, off.width, off.height);
  const d = imgData.data;
  const bgR = d[0], bgG = d[1], bgB = d[2];
  for (let i = 0; i < d.length; i += 4) {
    const diff = Math.abs(d[i] - bgR) + Math.abs(d[i + 1] - bgG) + Math.abs(d[i + 2] - bgB);
    if (diff < 32) d[i + 3] = 0;
  }
  octx.putImageData(imgData, 0, 0);
  return off;
}

function loadTexture(name, stripBg = false) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => { textures[name] = stripBg ? removeGrayBackground(img) : img; };
  img.onerror = () => {
    const fallback = new Image();
    fallback.crossOrigin = "anonymous";
    fallback.onload = () => { textures[name] = stripBg ? removeGrayBackground(fallback) : fallback; };
    fallback.src = `assets/${name}.png`;
  };
  img.src = `assets/${name}.jpg`;
}

loadTexture("icon", false);
loadTexture("hero", true);
loadTexture("enemies", true);
loadTexture("tiles", false);
loadTexture("items", true);

const SPRITES = {
  heroIdle:   { sheet: "hero", x: 18, y: 12, w: 105, h: 145 },
  heroBrick:  { sheet: "hero", x: 18, y: 280, w: 108, h: 138 },
  heroGun:    { sheet: "hero", x: 405, y: 430, w: 135, h: 138 },
  heroRoll:   { sheet: "hero", x: 18, y: 595, w: 125, h: 122 },
  heroBlood:  { sheet: "hero", x: 18, y: 740, w: 105, h: 145 },
  guardStand: { sheet: "enemies", x: 35, y: 25, w: 165, h: 200 },
  guardDown:  { sheet: "enemies", x: 260, y: 310, w: 230, h: 150 },
  itemBrick:  { sheet: "enemies", x: 40, y: 800, w: 125, h: 125 },
  itemGlock:  { sheet: "enemies", x: 645, y: 810, w: 130, h: 115 },
  itemDeagle: { sheet: "enemies", x: 825, y: 800, w: 165, h: 130 },
  floorTile:  { sheet: "tiles", x: 512, y: 256, w: 256, h: 256 },
  bloodDecal: { sheet: "items", x: 830, y: 805, w: 165, h: 155 }
};

function drawSprite(spriteKey, dx, dy, dw, dh, flipX = false) {
  const sp = SPRITES[spriteKey];
  const srcImg = sp ? textures[sp.sheet] : null;
  if (!srcImg) return false;
  ctx.save();
  ctx.translate(dx, dy);
  if (flipX) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(srcImg, sp.x, sp.y, sp.w, sp.h, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  return true;
}
let gameState = "menu";
const leftStick = { active: false, id: null, sx: 0, sy: 0, dx: 0, dy: 0 };
const rightStick = { active: false, id: null, sx: 0, sy: 0, dx: 0, dy: 0 };
const keys = {};

window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (gameState === "menu" && (e.code === "Space" || e.code === "Enter")) { gameState = "play"; return; }
  if (skillCheck.active && e.code === "Space") resolveSkillCheck();
  if (e.code === "Space" && !skillCheck.active) doRoll();
  if (e.code === "KeyE") doKick();
  if (e.code === "KeyQ") doThrow();
  if (e.code === "KeyF") startChoke();
  if (e.code === "KeyR") initLevel();
});
window.addEventListener("keyup", (e) => (keys[e.code] = false));

function getButtons() {
  return {
    roll: { x: W - 95, y: H - 220, r: 38, label: "ROLL", color: "#2b6cb0" },
    kick: { x: W - 190, y: H - 135, r: 38, label: "KICK", color: "#c53030" },
    throwBtn: { x: W - 95, y: H - 105, r: 38, label: "THROW", color: "#b7791f" },
    choke: { x: W - 190, y: H - 235, r: 34, label: "CHOKE", color: "#4a5568" }
  };
}

let player, walls, enemies, bullets, bricks, drops, bloodDecals;
let msg = "ЗАЧИСТИ ЭТАЖ: КИНЬ КИРПИЧ (THROW) -> 3 ПИНКА (KICK) -> ЗАБЕРИ СТВОЛ";
let msgTimer = 6;
let levelCleared = false;

const skillCheck = {
  active: false, mode: "revive", angle: 0,
  targetStart: 0, targetSize: 0.65, speed: 4.2, targetEnemy: null
};

function showMsg(text, time = 3.5) { msg = text; msgTimer = time; }

function initLevel() {
  levelCleared = false;
  skillCheck.active = false;
  player = {
    x: 150, y: 360, r: 18, angle: 0, speed: 240,
    hp: 100, maxHp: 100, hunger: 85, thirst: 80,
    weapon: "brick", ammo: 0,
    rollTimer: 0, rollCd: 0, rollVx: 0, rollVy: 0, shootCd: 0,
    bones: { head: 0, torso: 0, lArm: 0, rArm: 0, lLeg: 0, rLeg: 0 }
  };

  walls = [
    { x: 30, y: 30, w: 1220, h: 24 },
    { x: 30, y: 666, w: 1220, h: 24 },
    { x: 30, y: 30, w: 24, h: 660 },
    { x: 1226, y: 30, w: 24, h: 660 },
    { x: 330, y: 30, w: 24, h: 240 },
    { x: 330, y: 390, w: 24, h: 300 },
    { x: 700, y: 160, w: 24, h: 380 },
    { x: 700, y: 160, w: 280, h: 24 },
    { x: 700, y: 516, w: 280, h: 24 }
  ];

  enemies = [
    { x: 520, y: 190, r: 18, angle: Math.PI, state: "patrol", stunTimer: 0, kicks: 0, headHits: 0, spotted: false, shootCd: 0.7, gun: "pistol", ammo: 12 },
    { x: 550, y: 530, r: 18, angle: -Math.PI / 2, state: "patrol", stunTimer: 0, kicks: 0, headHits: 0, spotted: false, shootCd: 0.7, gun: "glock18", ammo: 18 },
    { x: 960, y: 340, r: 18, angle: Math.PI, state: "patrol", stunTimer: 0, kicks: 0, headHits: 0, spotted: false, shootCd: 0.6, gun: "deagle", ammo: 7 }
  ];

  bullets = [];
  bricks = [];
  bloodDecals = [];
  drops = [{ x: 220, y: 160, type: "brick", ammo: 0 }];
}
initLevel();

function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

function circleRect(cx, cy, cr, r) {
  const closestX = Math.max(r.x, Math.min(cx, r.x + r.w));
  const closestY = Math.max(r.y, Math.min(cy, r.y + r.h));
  return dist(cx, cy, closestX, closestY) < cr;
}

function hasLOS(x1, y1, x2, y2) {
  const steps = 28;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    for (const w of walls) {
      if (px >= w.x && px <= w.x + w.w && py >= w.y && py <= w.y + w.h) return false;
    }
  }
  return true;
}

function moveEnt(ent, vx, vy, dt) {
  const nx = ent.x + vx * dt;
  if (!walls.some((w) => circleRect(nx, ent.y, ent.r, w))) ent.x = nx;
  const ny = ent.y + vy * dt;
  if (!walls.some((w) => circleRect(ent.x, ny, ent.r, w))) ent.y = ny;
}

function addBlood(x, y, size = 22) {
  bloodDecals.push({ x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 14, r: size });
}

function doRoll() {
  if (skillCheck.active || player.rollCd > 0 || player.rollTimer > 0) return;
  const legHits = Math.max(player.bones.lLeg, player.bones.rLeg);
  if (legHits >= 7) { showMsg("НОГИ В ХЛАМ — ПЕРЕКАТ НЕВОЗМОЖЕН!"); return; }
  player.rollTimer = 0.24;
  player.rollCd = 0.75;
  player.rollVx = Math.cos(player.angle);
  player.rollVy = Math.sin(player.angle);
}

function doThrow() {
  if (skillCheck.active || player.weapon !== "brick") return;
  player.weapon = "none";
  bricks.push({ x: player.x, y: player.y, angle: player.angle, life: 0.65 });
}

function doKick() {
  if (skillCheck.active) return;
  for (const e of enemies) {
    if (e.state === "stunned" && dist(player.x, player.y, e.x, e.y) < 58) {
      e.kicks++;
      addBlood(e.x, e.y, 18);
      if (e.kicks >= 3) {
        e.state = "dead";
        addBlood(e.x, e.y, 32);
        showMsg("ДОБИТ (3/3 ПИНКА)");
      } else {
        showMsg(`ПИНОК В ГОЛОВУ: ${e.kicks}/3`);
      }
      return;
    }
  }
}

function startChoke() {
  if (skillCheck.active) return;
  for (const e of enemies) {
    if (e.state === "patrol" && dist(player.x, player.y, e.x, e.y) < 52) {
      skillCheck.active = true;
      skillCheck.mode = "choke";
      skillCheck.angle = 0;
      skillCheck.targetStart = 2.2 + Math.random() * 2.5;
      skillCheck.targetSize = 0.75;
      skillCheck.speed = 4.5;
      skillCheck.targetEnemy = e;
      showMsg("УДУШЕНИЕ! НАЖМИ НА ЭКРАН В БЕЛОЙ ЗОНЕ!");
      return;
    }
  }
}
function triggerReviveSkillCheck() {
  skillCheck.active = true;
  skillCheck.mode = "revive";
  skillCheck.angle = 0;
  skillCheck.targetStart = 2.0 + Math.random() * 2.5;
  skillCheck.targetSize = 0.68;
  skillCheck.speed = 4.0;
  showMsg("БЕЗ СОЗНАНИЯ! ПОПАДИ В СКИЛЛЧЕК, ЧТОБЫ ВСТАТЬ!");
}

function resolveSkillCheck() {
  if (!skillCheck.active) return;
  const a = skillCheck.angle % (Math.PI * 2);
  const start = skillCheck.targetStart;
  const end = start + skillCheck.targetSize;
  const hit = a >= start && a <= end;

  if (skillCheck.mode === "revive") {
    skillCheck.active = false;
    if (hit) {
      player.hp = 20;
      addBlood(player.x, player.y, 28);
      showMsg("ОЧНУЛСЯ НА ЗУБАХ! (20 HP)");
    } else {
      showMsg("ПРОМАХ — ТЕБЯ ДОБИЛИ. РЕСТАРТ...");
      setTimeout(initLevel, 900);
    }
  } else if (skillCheck.mode === "choke") {
    skillCheck.active = false;
    const e = skillCheck.targetEnemy;
    if (hit && e) {
      e.state = "dead";
      if (e.gun) { drops.push({ x: e.x, y: e.y, type: e.gun, ammo: e.ammo }); e.gun = null; }
      showMsg("БЕСШУМНО ЗАДУШЕН!");
    } else if (e) {
      e.spotted = true;
      e.angle = Math.atan2(player.y - e.y, player.x - e.x);
      damagePlayer(12);
      showMsg("ОН ВЫРВАЛСЯ И УДАРИЛ ТЕБЯ!");
    }
  }
}

function fireWeapon(x, y, angle, fromPlayer, gunType) {
  const spread = fromPlayer ? 0.04 : 0.24;
  const finalAngle = angle + (Math.random() - 0.5) * spread;
  bullets.push({
    x: x + Math.cos(finalAngle) * 24,
    y: y + Math.sin(finalAngle) * 24,
    angle: finalAngle, fromPlayer, gunType
  });
}

function damagePlayer(dmg) {
  if (skillCheck.active) return;
  player.hp = Math.max(0, player.hp - dmg);
  addBlood(player.x, player.y, 20);
  const parts = ["torso", "lArm", "rArm", "lLeg", "rLeg", "head"];
  const part = parts[Math.floor(Math.random() * parts.length)];
  player.bones[part] += 1;
  if (player.hp <= 0) triggerReviveSkillCheck();
}

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  if (gameState === "menu") { gameState = "play"; return; }
  if (skillCheck.active) { resolveSkillCheck(); return; }
  if (levelCleared) { initLevel(); return; }

  const rect = canvas.getBoundingClientRect();
  const btns = getButtons();

  for (const t of e.changedTouches) {
    const x = ((t.clientX - rect.left) / rect.width) * W;
    const y = ((t.clientY - rect.top) / rect.height) * H;

    if (dist(x, y, btns.roll.x, btns.roll.y) <= btns.roll.r + 14) { doRoll(); continue; }
    if (dist(x, y, btns.kick.x, btns.kick.y) <= btns.kick.r + 14) { doKick(); continue; }
    if (dist(x, y, btns.throwBtn.x, btns.throwBtn.y) <= btns.throwBtn.r + 14) { doThrow(); continue; }
    if (dist(x, y, btns.choke.x, btns.choke.y) <= btns.choke.r + 14) { startChoke(); continue; }

    if (x < W * 0.45 && !leftStick.active) {
      leftStick.active = true; leftStick.id = t.identifier;
      leftStick.sx = x; leftStick.sy = y; leftStick.dx = 0; leftStick.dy = 0;
    } else if (x >= W * 0.45 && !rightStick.active) {
      rightStick.active = true; rightStick.id = t.identifier;
      rightStick.sx = x; rightStick.sy = y; rightStick.dx = 0; rightStick.dy = 0;
    }
  }
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  for (const t of e.changedTouches) {
    const x = ((t.clientX - rect.left) / rect.width) * W;
    const y = ((t.clientY - rect.top) / rect.height) * H;
    if (leftStick.active && t.identifier === leftStick.id) {
      leftStick.dx = Math.max(-1, Math.min(1, (x - leftStick.sx) / 55));
      leftStick.dy = Math.max(-1, Math.min(1, (y - leftStick.sy) / 55));
    } else if (rightStick.active && t.identifier === rightStick.id) {
      rightStick.dx = Math.max(-1, Math.min(1, (x - rightStick.sx) / 55));
      rightStick.dy = Math.max(-1, Math.min(1, (y - rightStick.sy) / 55));
    }
  }
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === leftStick.id) { leftStick.active = false; leftStick.dx = 0; leftStick.dy = 0; }
    if (t.identifier === rightStick.id) { rightStick.active = false; rightStick.dx = 0; rightStick.dy = 0; }
  }
});

canvas.addEventListener("mousedown", () => {
  if (gameState === "menu") gameState = "play";
  else if (skillCheck.active) resolveSkillCheck();
  else if (levelCleared) initLevel();
});
function update(dt) {
  if (gameState === "menu") return;
  if (msgTimer > 0) msgTimer -= dt;

  if (skillCheck.active) {
    skillCheck.angle += skillCheck.speed * dt;
    if (skillCheck.angle > Math.PI * 2 + 0.3) { skillCheck.angle = 999; resolveSkillCheck(); }
    return;
  }

  if (player.shootCd > 0) player.shootCd -= dt;
  if (player.rollCd > 0) player.rollCd -= dt;

  for (const k in player.bones) {
    if (player.bones[k] > 0 && player.bones[k] <= 4) {
      player.bones[k] = Math.max(0, player.bones[k] - dt * 0.25);
    }
  }

  const legHits = Math.max(player.bones.lLeg, player.bones.rLeg);
  let speed = player.speed;
  if (legHits >= 7) speed = 55;
  else if (legHits >= 5) speed = 115;

  if (player.rollTimer > 0) {
    player.rollTimer -= dt;
    moveEnt(player, player.rollVx * 540, player.rollVy * 540, dt);
  } else {
    let mx = leftStick.dx, my = leftStick.dy;
    if (keys["KeyW"]) my = -1;
    if (keys["KeyS"]) my = 1;
    if (keys["KeyA"]) mx = -1;
    if (keys["KeyD"]) mx = 1;
    const len = Math.hypot(mx, my);
    if (len > 0.1) {
      mx /= len; my /= len;
      moveEnt(player, mx * speed, my * speed, dt);
      if (!rightStick.active) player.angle = Math.atan2(my, mx);
    }
  }

  if (rightStick.active) {
    const rlen = Math.hypot(rightStick.dx, rightStick.dy);
    if (rlen > 0.2) {
      player.angle = Math.atan2(rightStick.dy, rightStick.dx);
      const isGun = ["pistol", "glock18", "deagle"].includes(player.weapon);
      if (rlen > 0.65 && isGun && player.shootCd <= 0 && player.ammo > 0) {
        fireWeapon(player.x, player.y, player.angle, true, player.weapon);
        player.ammo--;
        player.shootCd = player.weapon === "glock18" ? 0.08 : player.weapon === "deagle" ? 0.42 : 0.26;
        if (player.ammo <= 0) { player.weapon = "none"; showMsg("МАГАЗИН ПУСТ!"); }
      }
    }
  }

  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (dist(player.x, player.y, d.x, d.y) < 34) {
      if (d.type === "brick" && player.weapon === "none") {
        player.weapon = "brick"; drops.splice(i, 1); showMsg("ПОДОБРАН КИРПИЧ");
      } else if (["pistol", "glock18", "deagle"].includes(d.type) && player.weapon === "none") {
        player.weapon = d.type; player.ammo = d.ammo; drops.splice(i, 1);
        showMsg(`ПОДОБРАНО: ${d.type.toUpperCase()} (${d.ammo})`);
      }
    }
  }

  for (let i = bricks.length - 1; i >= 0; i--) {
    const b = bricks[i];
    b.x += Math.cos(b.angle) * 660 * dt;
    b.y += Math.sin(b.angle) * 660 * dt;
    b.life -= dt;
    let hit = walls.some((w) => circleRect(b.x, b.y, 6, w));
    for (const e of enemies) {
      if (e.state !== "dead" && dist(b.x, b.y, e.x, e.y) < e.r + 8) {
        e.state = "stunned"; e.stunTimer = 4.5; e.kicks = 0;
        if (e.gun) { drops.push({ x: e.x + 14, y: e.y, type: e.gun, ammo: e.ammo }); e.gun = null; }
        showMsg("ОГЛУШЁН КИРПИЧОМ! ПНИ 3 РАЗА (KICK)!");
        hit = true; break;
      }
    }
    if (hit || b.life <= 0) { drops.push({ x: b.x, y: b.y, type: "brick", ammo: 0 }); bricks.splice(i, 1); }
  }

  let alive = 0;
  for (const e of enemies) {
    if (e.state === "dead") continue;
    alive++;
    const canSee = hasLOS(player.x, player.y, e.x, e.y) && dist(player.x, player.y, e.x, e.y) < 540;
    if (canSee) e.spotted = true;

    if (e.state === "stunned") {
      e.stunTimer -= dt;
      if (e.stunTimer <= 0) { e.state = "patrol"; showMsg("ОХРАННИК ОЧНУЛСЯ!"); }
    } else if (e.state === "patrol" && canSee) {
      e.angle = Math.atan2(player.y - e.y, player.x - e.x);
      e.shootCd -= dt;
      if (e.shootCd <= 0 && e.gun) {
        fireWeapon(e.x, e.y, e.angle, false, e.gun);
        e.shootCd = e.gun === "glock18" ? 0.16 : 0.78;
      }
    }
  }

  if (alive === 0 && !levelCleared) {
    levelCleared = true;
    showMsg("ЭТАЖ ЗАЧИЩЕН! +500$ В КОНВЕРТЕ. ТАПНИ ПО ЭКРАНУ ДЛЯ НОВОГО ЗАХОДА.", 15);
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += Math.cos(b.angle) * 980 * dt;
    b.y += Math.sin(b.angle) * 980 * dt;
    let rm = walls.some((w) => circleRect(b.x, b.y, 4, w));

    if (!rm) {
      if (b.fromPlayer) {
        for (const e of enemies) {
          if (e.state !== "dead" && dist(b.x, b.y, e.x, e.y) < e.r + 4) {
            rm = true; addBlood(e.x, e.y, 24);
            if (e.state === "stunned" || b.gunType === "deagle") {
              e.state = "dead";
              if (e.gun) { drops.push({ x: e.x, y: e.y, type: e.gun, ammo: e.ammo }); e.gun = null; }
            } else {
              e.headHits++;
              if (e.headHits === 1 && Math.random() < 0.75) {
                e.state = "stunned"; e.stunTimer = 2.2;
                showMsg("1-Я В ГОЛОВУ (ОГЛУШЁН) — ДОБЕЙ ВТОРОЙ!");
              } else {
                e.state = "dead";
                if (e.gun) { drops.push({ x: e.x, y: e.y, type: e.gun, ammo: e.ammo }); e.gun = null; }
              }
            }
            break;
          }
        }
      } else if (player.rollTimer <= 0 && dist(b.x, b.y, player.x, player.y) < player.r + 4) {
        rm = true;
        damagePlayer(b.gunType === "deagle" ? 35 : 14);
      }
    }
    if (rm) bullets.splice(i, 1);
  }
}
function getBoneColor(hits) {
  if (hits >= 7) return "#6b0000";
  if (hits >= 5) return "#e53e3e";
  if (hits > 0) return "#ecc94b";
  return "#cbd5e0";
}

function drawMenu() {
  ctx.fillStyle = "#121316";
  ctx.fillRect(0, 0, W, H);
  if (textures.icon) ctx.drawImage(textures.icon, W / 2 - 120, 70, 240, 240);

  ctx.fillStyle = "#edf2f7";
  ctx.font = "bold 64px monospace";
  ctx.textAlign = "center";
  ctx.fillText("STREET 12", W / 2, textures.icon ? 390 : 280);

  ctx.fillStyle = "#a0aec0";
  ctx.font = "18px monospace";
  ctx.fillText("КОНВЕРТ ПОД ДВЕРЬЮ. ЗАЧИСТИ ЭТАЖ. ВЫЖИВИ НА ПУТИ НАЗАД.", W / 2, textures.icon ? 435 : 330);

  ctx.fillStyle = "#e53e3e";
  ctx.fillRect(W / 2 - 140, textures.icon ? 480 : 390, 280, 56);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 22px monospace";
  ctx.fillText("НАЧАТЬ ВЫЛАЗКУ", W / 2, textures.icon ? 515 : 425);
  ctx.textAlign = "left";
}

function draw() {
  if (gameState === "menu") { drawMenu(); return; }

  ctx.fillStyle = "#222426";
  ctx.fillRect(0, 0, W, H);
  if (textures.tiles) {
    const sp = SPRITES.floorTile;
    for (let tx = 30; tx < 1230; tx += 128) {
      for (let ty = 30; ty < 670; ty += 128) {
        ctx.drawImage(textures.tiles, sp.x, sp.y, sp.w, sp.h, tx, ty, 128, 128);
      }
    }
  }

  for (const bl of bloodDecals) {
    if (!drawSprite("bloodDecal", bl.x, bl.y, bl.r * 2.2, bl.r * 2.2)) {
      ctx.fillStyle = "rgba(130, 12, 12, 0.75)";
      ctx.beginPath(); ctx.arc(bl.x, bl.y, bl.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.fillStyle = "#3a3d42";
  for (const w of walls) {
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = "#1a1c1e"; ctx.lineWidth = 2; ctx.strokeRect(w.x, w.y, w.w, w.h);
  }

  for (const d of drops) {
    if (!hasLOS(player.x, player.y, d.x, d.y)) continue;
    const iconKey = d.type === "brick" ? "itemBrick" : d.type === "deagle" ? "itemDeagle" : "itemGlock";
    if (!drawSprite(iconKey, d.x, d.y, 34, 34)) {
      ctx.fillStyle = d.type === "brick" ? "#c53030" : "#e2e8f0";
      ctx.fillRect(d.x - 9, d.y - 5, 18, 10);
    }
  }

  for (const e of enemies) {
    const visible = hasLOS(player.x, player.y, e.x, e.y) && dist(player.x, player.y, e.x, e.y) < 540;
    const facingLeft = Math.cos(e.angle) < 0;
    if (e.state === "dead") {
      if (!drawSprite("guardDown", e.x, e.y, 64, 46, facingLeft)) {
        ctx.fillStyle = "#5a0b0b"; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, Math.PI * 2); ctx.fill();
      }
    } else if (visible) {
      if (e.state === "stunned") {
        if (!drawSprite("guardDown", e.x, e.y, 64, 46, facingLeft)) {
          ctx.fillStyle = "#dd6b20"; ctx.beginPath(); ctx.ellipse(e.x, e.y, 24, 14, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = "#faf089"; ctx.font = "bold 12px monospace";
        ctx.fillText(`STUN (${e.kicks}/3)`, e.x - 28, e.y - 24);
      } else if (!drawSprite("guardStand", e.x, e.y, 52, 62, facingLeft)) {
        ctx.fillStyle = "#171923"; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      }
    } else if (e.spotted) {
      ctx.strokeStyle = "rgba(245, 101, 101, 0.85)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.stroke();
    }
  }

  for (const b of bricks) {
    if (!drawSprite("itemBrick", b.x, b.y, 26, 26)) {
      ctx.fillStyle = "#c53030"; ctx.fillRect(b.x - 7, b.y - 4, 14, 8);
    }
  }
  ctx.fillStyle = "#faf089";
  for (const b of bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill(); }

  const pLeft = Math.cos(player.angle) < 0;
  let heroSprite = "heroIdle";
  if (player.rollTimer > 0) heroSprite = "heroRoll";
  else if (player.hp <= 35) heroSprite = "heroBlood";
  else if (player.weapon === "brick") heroSprite = "heroBrick";
  else if (["pistol", "glock18", "deagle"].includes(player.weapon)) heroSprite = "heroGun";

  if (!drawSprite(heroSprite, player.x, player.y, 50, 62, pLeft)) {
    ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.angle);
    ctx.fillStyle = "#1a365d"; ctx.beginPath(); ctx.arc(-3, 0, player.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4299e1"; ctx.beginPath(); ctx.arc(2, 0, player.r - 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fbd38d"; ctx.beginPath(); ctx.arc(4, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
  ctx.fillRect(15, 15, 300, 122);
  ctx.fillStyle = "#2d3748"; ctx.fillRect(85, 25, 210, 18);
  ctx.fillStyle = "#e53e3e"; ctx.fillRect(85, 25, 210 * (player.hp / player.maxHp), 18);
  ctx.fillStyle = "#fff"; ctx.font = "bold 13px monospace";
  ctx.fillText(`HP: ${player.hp}/100`, 92, 38);

  ctx.fillStyle = "#dd6b20"; ctx.fillRect(85, 50, 100 * (player.hunger / 100), 10);
  ctx.fillStyle = "#3182ce"; ctx.fillRect(195, 50, 100 * (player.thirst / 100), 10);

  ctx.fillStyle = "#edf2f7";
  const wLabel = player.weapon === "none" ? "РУКИ (CHOKE / KICK)" : `${player.weapon.toUpperCase()} ${player.ammo > 0 ? "[" + player.ammo + "]" : ""}`;
  ctx.fillText(wLabel, 85, 80);

  ctx.fillStyle = getBoneColor(player.bones.head); ctx.beginPath(); ctx.arc(48, 34, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = getBoneColor(player.bones.torso); ctx.fillRect(40, 44, 16, 28);
  ctx.fillStyle = getBoneColor(player.bones.lArm); ctx.fillRect(32, 44, 6, 24);
  ctx.fillStyle = getBoneColor(player.bones.rArm); ctx.fillRect(58, 44, 6, 24);
  ctx.fillStyle = getBoneColor(player.bones.lLeg); ctx.fillRect(40, 74, 7, 28);
  ctx.fillStyle = getBoneColor(player.bones.rLeg); ctx.fillRect(49, 74, 7, 28);

  if (msgTimer > 0) {
    ctx.fillStyle = "#faf089"; ctx.font = "bold 15px monospace";
    ctx.fillText(msg, 335, 38);
  }

  const btns = getButtons();
  for (const key in btns) {
    const b = btns[key];
    ctx.fillStyle = b.color; ctx.globalAlpha = 0.72;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.font = "bold 12px monospace";
    ctx.textAlign = "center"; ctx.fillText(b.label, b.x, b.y + 4); ctx.textAlign = "left";
  }

  if (leftStick.active) {
    ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.beginPath(); ctx.arc(leftStick.sx, leftStick.sy, 55, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.beginPath(); ctx.arc(leftStick.sx + leftStick.dx * 55, leftStick.sy + leftStick.dy * 55, 22, 0, Math.PI * 2); ctx.fill();
  }
  if (rightStick.active) {
    ctx.strokeStyle = "rgba(245,101,101,0.4)"; ctx.beginPath(); ctx.arc(rightStick.sx, rightStick.sy, 55, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(245,101,101,0.5)"; ctx.beginPath(); ctx.arc(rightStick.sx + rightStick.dx * 55, rightStick.sy + rightStick.dy * 55, 22, 0, Math.PI * 2); ctx.fill();
  }

  if (skillCheck.active) {
    ctx.fillStyle = "rgba(0,0,0,0.65)"; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, rad = 85;
    ctx.strokeStyle = "#4a5568"; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(cx, cy, rad, skillCheck.targetStart, skillCheck.targetStart + skillCheck.targetSize); ctx.stroke();
    const px = cx + Math.cos(skillCheck.angle) * rad;
    const py = cy + Math.sin(skillCheck.angle) * rad;
    ctx.fillStyle = "#f56565"; ctx.beginPath(); ctx.arc(px, py, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 18px monospace"; ctx.textAlign = "center";
    ctx.fillText("ТАПНИ ПО ЭКРАНУ В БЕЛОЙ ЗОНЕ!", cx, cy + 125); ctx.textAlign = "left";
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
