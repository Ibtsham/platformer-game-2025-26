const canvas = document.getElementById('gc');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

let gameState = 'idle';
let player, platforms, enemies, coins, particles, hearts, boss;
let score, health, cameraX, worldOffset, bossesDefeated;
let keys = {};
let animFrame;
let levelSeed = 0;

// ─── Input ────────────────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
document.getElementById('start-btn').onclick = initGame;

// ─── Seeded RNG ───────────────────────────────────────────────────────────────

function rng(seed) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ─── Level Generation ─────────────────────────────────────────────────────────

function generateLevel(offsetX, seed) {
  const r = rng(seed);
  const plats = [];
  const enems = [];
  const cs    = [];

  // Floor segments with gaps
  const floorSegments = [
    { x: offsetX,       w: 350 },
    { x: offsetX + 390, w: 300 },
    { x: offsetX + 730, w: 350 },
    { x: offsetX + 1120,w: 400 },
    { x: offsetX + 1560,w: 350 },
    { x: offsetX + 1950,w: 500 },
  ];
  for (const seg of floorSegments) {
    plats.push({ x: seg.x, y: 340, w: seg.w, h: 20, c: '#3d5a80', isFloor: true });
  }

  // Elevated platforms
  const elevated = [
    [offsetX+80,  260, 110], [offsetX+280, 200, 100], [offsetX+470, 265, 120],
    [offsetX+650, 205, 100], [offsetX+830, 255, 130], [offsetX+1010,200, 110],
    [offsetX+1200,260, 100], [offsetX+1370,200, 120], [offsetX+1540,260, 100],
    [offsetX+1720,205, 110], [offsetX+1920,255, 130], [offsetX+2100,200, 100],
    [offsetX+2280,260, 110], [offsetX+2460,200,  80],
  ];
  for (const [ex, ey, ew] of elevated) {
    plats.push({ x: ex, y: ey, w: ew, h: 16, c: '#4a7c59' });
    // Coins on elevated platforms
    const coinX = ex + ew / 2 - 10;
    cs.push({ x: coinX,    y: ey - 18, r: 7, collected: false, bob: r() * Math.PI * 2 });
    cs.push({ x: coinX+20, y: ey - 18, r: 7, collected: false, bob: r() * Math.PI * 2 });
    // Enemy on elevated platforms (40% chance)
    if (r() > 0.4) {
      enems.push({
        x: ex + 10, y: ey - 24,
        vx: (r() > 0.5 ? 1 : -1) * (0.9 + r() * 0.6),
        sx: ex + 10, range: ew - 20,
        w: 24, h: 24, alive: true, type: 'normal'
      });
    }
  }

  // Floor enemies and coins
  for (const seg of floorSegments) {
    if (r() > 0.4) {
      enems.push({
        x: seg.x + 60, y: 316,
        vx: (r() > 0.5 ? 1.5 : -1.5) * (0.8 + r() * 0.7),
        sx: seg.x + 60, range: 70 + r() * 50,
        w: 24, h: 24, alive: true, type: 'normal'
      });
    }
    for (const frac of [0.3, 0.5, 0.7]) {
      cs.push({ x: seg.x + seg.w * frac, y: 318, r: 7, collected: false, bob: r() * Math.PI * 2 });
    }
  }

  // Goal platform
  const goalX = offsetX + 2550;
  plats.push({ x: goalX, y: 300, w: 200, h: 20, c: '#c87137', isGoal: true });

  return { platforms: plats, enemies: enems, coins: cs, goalX };
}

// ─── Boss Factory ─────────────────────────────────────────────────────────────

function makeBoss(offsetX, bossNum) {
  const hp  = 5 + bossNum * 3;
  const spd = 1.2 + bossNum * 0.3;
  const sz  = 38 + Math.min(bossNum * 4, 30);
  return {
    x: offsetX + 1200, y: 340 - sz,
    w: sz, h: sz,
    vx: spd, vy: 0,
    hp, maxHp: hp,
    alive: true,
    invTimer: 0,
    spawnX: offsetX + 1200,
    range: 200 + bossNum * 30,
    phase: 'patrol',
    shootTimer: 0,
    bullets: [],
    bossNum
  };
}

// ─── Heart Pickup ─────────────────────────────────────────────────────────────

function spawnHeartPickup(x, y) {
  hearts.push({ x, y, collected: false, bob: Math.random() * Math.PI * 2, timer: 600 });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function initGame() {
  score          = 0;
  health         = 3;
  cameraX        = 0;
  worldOffset    = 0;
  particles      = [];
  hearts         = [];
  boss           = null;
  bossesDefeated = 0;
  levelSeed      = Math.floor(Math.random() * 99999);

  document.getElementById('msg').style.display = 'none';
  document.getElementById('boss-display').style.display = 'none';

  const lvl = generateLevel(0, levelSeed);
  platforms = lvl.platforms;
  enemies   = lvl.enemies;
  coins     = lvl.coins;

  player = {
    x: 60, y: 300,
    w: 22, h: 28,
    vx: 0, vy: 0,
    onGround: false, jumpsLeft: 2,
    spawnX: 60, spawnY: 300,
    invTimer: 0, facing: 1, animT: 0
  };

  gameState = 'playing';
  if (animFrame) cancelAnimationFrame(animFrame);
  loop();
  updateHUD();
}

// ─── Game Loop ────────────────────────────────────────────────────────────────

function loop() {
  update();
  draw();
  animFrame = requestAnimationFrame(loop);
}

// ─── AABB Collision ───────────────────────────────────────────────────────────

function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
}

// ─── Check / Trigger Boss ─────────────────────────────────────────────────────

function checkNextBoss() {
  const nextThreshold = (bossesDefeated + 1) * 250;
  if (score >= nextThreshold && !boss) {
    boss = makeBoss(worldOffset, bossesDefeated + 1);
    spawnParticles(boss.x + boss.w / 2, boss.y, '#ff6b6b', 20);
  }
}

// ─── Extend World ─────────────────────────────────────────────────────────────

function extendWorld() {
  worldOffset += 2800;
  levelSeed = (levelSeed * 6364136223846793005 + 1442695040888963407) >>> 0;
  const lvl = generateLevel(worldOffset, levelSeed);
  platforms = platforms.concat(lvl.platforms);
  enemies   = enemies.concat(lvl.enemies);
  coins     = coins.concat(lvl.coins);
  player.spawnX = worldOffset + 60;
  player.spawnY = 300;
}

// ─── Update (logic) ───────────────────────────────────────────────────────────

function update() {
  if (gameState !== 'playing') return;

  const p = player;
  p.animT++;

  const left  = keys['ArrowLeft']  || keys['KeyA'];
  const right = keys['ArrowRight'] || keys['KeyD'];
  const jump  = keys['Space'] || keys['ArrowUp'] || keys['KeyW'];

  // Horizontal movement
  p.vx = 0;
  if (left)  { p.vx = -4; p.facing = -1; }
  if (right) { p.vx =  4; p.facing =  1; }

  // Gravity
  p.vy += 0.55;
  if (p.vy > 14) p.vy = 14;

  // Jump (single + double)
  if (jump && !p._jumpHeld && p.jumpsLeft > 0) {
    p.vy = -11;
    p.jumpsLeft--;
    p._jumpHeld = true;
    spawnParticles(p.x + p.w / 2, p.y + p.h, '#88aaff', 5);
  }
  if (!jump) p._jumpHeld = false;

  p.onGround = false;

  // Horizontal platform collision
  p.x += p.vx;
  for (const pl of platforms) {
    if (rectOverlap(p.x, p.y, p.w, p.h, pl.x, pl.y, pl.w, pl.h)) {
      if (p.vx > 0) p.x = pl.x - p.w;
      else          p.x = pl.x + pl.w;
      p.vx = 0;
    }
  }

  // Vertical platform collision
  p.y += p.vy;
  for (const pl of platforms) {
    if (rectOverlap(p.x, p.y, p.w, p.h, pl.x, pl.y, pl.w, pl.h)) {
      if (p.vy > 0) { p.y = pl.y - p.h; p.onGround = true; p.jumpsLeft = 2; }
      else          { p.y = pl.y + pl.h; }
      p.vy = 0;
    }
  }

  // Coin collection
  for (const c of coins) {
    if (!c.collected && rectOverlap(p.x, p.y, p.w, p.h, c.x-c.r, c.y-c.r, c.r*2, c.r*2)) {
      c.collected = true;
      score += 10;
      spawnParticles(c.x, c.y, '#ffd700', 8);
      updateHUD();
      checkNextBoss();
    }
    c.bob += 0.06;
  }

  // Heart pickups
  for (let i = hearts.length - 1; i >= 0; i--) {
    const h = hearts[i];
    h.bob += 0.05;
    h.timer--;
    if (h.timer <= 0) { hearts.splice(i, 1); continue; }
    if (!h.collected && rectOverlap(p.x, p.y, p.w, p.h, h.x-10, h.y-10, 20, 20)) {
      h.collected = true;
      hearts.splice(i, 1);
      if (health < 5) health++;
      spawnParticles(h.x, h.y, '#ff69b4', 10);
      updateHUD();
    }
  }

  if (p.invTimer > 0) p.invTimer--;

  // Normal enemy collisions
  for (const e of enemies) {
    if (!e.alive) continue;
    e.x += e.vx;
    if (e.x < e.sx - e.range || e.x > e.sx + e.range) e.vx = -e.vx;

    if (p.invTimer === 0 && rectOverlap(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) {
      const stompTop = p.y + p.h;
      const enemyMid = e.y + e.h / 2;
      if (p.vy > 0 && stompTop < enemyMid + 8) {
        // Stomp
        e.alive = false;
        p.vy = -8;
        score += 50;
        if (Math.random() < 0.15) spawnHeartPickup(e.x + e.w / 2, e.y);
        spawnParticles(e.x + e.w/2, e.y + e.h/2, '#ff6b6b', 10);
        updateHUD();
        checkNextBoss();
      } else {
        // Damage
        health--;
        p.invTimer = 90;
        p.vy = -7;
        p.vx = (p.x < e.x + e.w/2) ? -5 : 5;
        spawnParticles(p.x + p.w/2, p.y + p.h/2, '#ff4444', 8);
        updateHUD();
        if (health <= 0) { gameOver(); return; }
      }
    }
  }

  // Boss update and collision
  if (boss && boss.alive) {
    updateBoss(boss, p);

    if (p.invTimer === 0 && rectOverlap(p.x, p.y, p.w, p.h, boss.x, boss.y, boss.w, boss.h)) {
      const stompTop = p.y + p.h;
      const bossMid  = boss.y + boss.h / 2;
      if (p.vy > 0 && stompTop < bossMid + 12 && boss.invTimer === 0) {
        boss.hp--;
        boss.invTimer = 40;
        p.vy = -9;
        spawnParticles(boss.x + boss.w/2, boss.y + boss.h/2, '#ffaa00', 12);
        if (boss.hp <= 0) {
          boss.alive = false;
          bossesDefeated++;
          score += 200 + boss.bossNum * 50;
          // Drop 3 hearts on boss death
          for (let i = 0; i < 3; i++) {
            spawnHeartPickup(boss.x + boss.w/2 + (i - 1) * 30, boss.y - 20);
          }
          spawnParticles(boss.x + boss.w/2, boss.y + boss.h/2, '#ff6b6b', 40);
          spawnParticles(boss.x + boss.w/2, boss.y + boss.h/2, '#ffd700', 30);
          boss = null;
          document.getElementById('boss-display').style.display = 'none';
          updateHUD();
        }
        updateHUD();
      } else if (boss.invTimer === 0) {
        health--;
        p.invTimer = 90;
        p.vy = -7;
        p.vx = (p.x < boss.x + boss.w/2) ? -5 : 5;
        spawnParticles(p.x + p.w/2, p.y + p.h/2, '#ff4444', 8);
        updateHUD();
        if (health <= 0) { gameOver(); return; }
      }
    }

    // Boss bullet collisions
    for (let i = boss.bullets.length - 1; i >= 0; i--) {
      const b = boss.bullets[i];
      b.x += b.vx; b.y += b.vy; b.life--;
      if (b.life <= 0) { boss.bullets.splice(i, 1); continue; }
      if (p.invTimer === 0 && rectOverlap(p.x, p.y, p.w, p.h, b.x-5, b.y-5, 10, 10)) {
        boss.bullets.splice(i, 1);
        health--;
        p.invTimer = 90;
        p.vy = -5;
        spawnParticles(p.x + p.w/2, p.y + p.h/2, '#ff4444', 6);
        updateHUD();
        if (health <= 0) { gameOver(); return; }
      }
    }
  }

  // Fall out of level
  if (p.y > H + 100) {
    health--;
    updateHUD();
    if (health <= 0) { gameOver(); return; }
    p.x = p.spawnX; p.y = p.spawnY; p.vy = 0; p.vx = 0;
    p.invTimer = 120;
  }

  // Extend world when player reaches far right
  if (p.x > worldOffset + 2500) extendWorld();

  // Camera follow
  cameraX = Math.max(0, p.x - W / 3);

  // Update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.2; pt.life--;
    if (pt.life <= 0) particles.splice(i, 1);
  }

  // Cull far-left objects
  const far = cameraX - 400;
  platforms = platforms.filter(pl => pl.x + pl.w > far);
  enemies   = enemies.filter(e  => !e.alive ? e.x > far - 100 : e.x + e.w > far);
  coins     = coins.filter(c   => c.x > far || !c.collected);
}

// ─── Boss AI ──────────────────────────────────────────────────────────────────

function updateBoss(b, p) {
  if (b.invTimer > 0) b.invTimer--;

  const dx   = p.x - b.x;
  const dist = Math.abs(dx);
  b.phase    = dist < 300 ? 'chase' : 'patrol';

  if (b.phase === 'chase') {
    b.vx = Math.sign(dx) * (1.5 + b.bossNum * 0.35);
  } else {
    if (b.x < b.spawnX - b.range) b.vx =  Math.abs(b.vx);
    if (b.x > b.spawnX + b.range) b.vx = -Math.abs(b.vx);
  }

  b.x += b.vx;

  // Gravity on boss
  b.vy += 0.55;
  if (b.vy > 14) b.vy = 14;
  b.y += b.vy;
  for (const pl of platforms) {
    if (rectOverlap(b.x, b.y, b.w, b.h, pl.x, pl.y, pl.w, pl.h)) {
      if (b.vy > 0) { b.y = pl.y - b.h; b.vy = 0; }
      else          { b.y = pl.y + pl.h; b.vy = 0; }
    }
  }

  // Boss shoots at player
  const shootInterval = Math.max(40, 100 - b.bossNum * 8);
  b.shootTimer++;
  if (b.shootTimer >= shootInterval && dist < 350) {
    b.shootTimer = 0;
    const angle = Math.atan2(
      p.y + p.h/2 - (b.y + b.h/2),
      p.x + p.w/2 - (b.x + b.w/2)
    );
    const spd = 3 + b.bossNum * 0.4;
    b.bullets.push({
      x: b.x + b.w/2, y: b.y + b.h/2,
      vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
      life: 120
    });
  }

  // Update boss HUD
  const bossEl = document.getElementById('boss-display');
  bossEl.style.display = '';
  bossEl.textContent = 'BOSS #' + b.bossNum + '  HP: ' +
    '♥'.repeat(b.hp) + '♡'.repeat(Math.max(0, b.maxHp - b.hp));
}

// ─── Game Over ────────────────────────────────────────────────────────────────

function gameOver() {
  gameState = 'dead';
  showMsg('Game Over! 💀\nScore: ' + score + '\nBosses Defeated: ' + bossesDefeated + '\nClick Start to retry');
}

// ─── Particles ────────────────────────────────────────────────────────────────

function spawnParticles(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 2 + Math.random() * 3;
    particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s - 2, life: 20 + Math.random()*15, color });
  }
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

function updateHUD() {
  const maxH = Math.max(health, 3);
  const heartsStr = Array.from({ length: maxH }, (_, i) => i < health ? '♥' : '♡').join(' ');
  document.getElementById('health-display').textContent = heartsStr;
  document.getElementById('score-display').textContent  = 'Score: ' + score;
}

function showMsg(txt) {
  const el = document.getElementById('msg');
  el.style.display = 'block';
  el.textContent   = txt;
}

// ─── Draw (rendering) ─────────────────────────────────────────────────────────

function draw() {
  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  // Parallax stars
  for (let i = 0; i < 80; i++) {
    const sx = ((i*137 + 20) % 9999 - cameraX * 0.2) % W;
    const sy = (i*73 + 10) % (H * 0.7);
    ctx.fillStyle = `rgba(255,255,255,${0.2 + (i%3)*0.15})`;
    ctx.fillRect(((sx % W) + W) % W, sy, 1.5, 1.5);
  }

  ctx.save();
  ctx.translate(-cameraX, 0);

  // Platforms
  for (const pl of platforms) {
    ctx.fillStyle = pl.isGoal ? '#c87137' : pl.c;
    ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(pl.x, pl.y, pl.w, 3);
    if (pl.isGoal) {
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NEXT ▶', pl.x + pl.w/2, pl.y + 14);
      ctx.textAlign = 'left';
    }
  }

  // Coins
  for (const c of coins) {
    if (c.collected) continue;
    const cy = c.y + Math.sin(c.bob) * 3;
    ctx.beginPath();
    ctx.arc(c.x, cy, c.r, 0, Math.PI*2);
    ctx.fillStyle = '#ffd700';
    ctx.fill();
    ctx.strokeStyle = '#b8960c';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(c.x-2, cy-2, 2.5, 0, Math.PI*2);
    ctx.fill();
  }

  // Heart pickups
  for (const h of hearts) {
    const hy = h.y + Math.sin(h.bob) * 4;
    ctx.globalAlpha = h.timer < 120 ? h.timer / 120 : 1;
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff69b4';
    ctx.fillText('♥', h.x, hy);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // Normal enemies
  for (const e of enemies) {
    if (!e.alive) continue;
    ctx.fillStyle = '#e63946';
    ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.fillStyle = '#fff';
    const ex = e.vx > 0 ? e.x+14 : e.x+6;
    ctx.fillRect(ex, e.y+6, 5, 5);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(ex+1, e.y+7, 3, 3);
    ctx.fillStyle = '#c1121f';
    ctx.fillRect(e.x+2, e.y, e.w-4, 6);
  }

  // Boss
  if (boss && boss.alive) {
    const b = boss;
    const flash = b.invTimer > 0 && Math.floor(b.invTimer/4) % 2 === 0;
    ctx.fillStyle = flash ? '#ffaa00' : '#8b0000';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(b.x, b.y, b.w, b.h * 0.3);
    // Eyes
    ctx.fillStyle = '#fff';
    ctx.fillRect(b.x + b.w*0.20, b.y + b.h*0.12, b.w*0.18, b.w*0.18);
    ctx.fillRect(b.x + b.w*0.62, b.y + b.h*0.12, b.w*0.18, b.w*0.18);
    ctx.fillStyle = '#000';
    ctx.fillRect(b.x + b.w*0.24, b.y + b.h*0.15, b.w*0.10, b.w*0.10);
    ctx.fillRect(b.x + b.w*0.66, b.y + b.h*0.15, b.w*0.10, b.w*0.10);
    // Mouth
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(b.x + b.w*0.25, b.y + b.h*0.65, b.w*0.5, b.h*0.08);
    // HP bar
    const hpRatio = b.hp / b.maxHp;
    const bw = b.w + 20, bx = b.x - 10, by = b.y - 14;
    ctx.fillStyle = '#333';
    ctx.fillRect(bx, by, bw, 8);
    ctx.fillStyle = hpRatio > 0.5 ? '#00cc44' : hpRatio > 0.25 ? '#ffaa00' : '#ff2222';
    ctx.fillRect(bx, by, bw * hpRatio, 8);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, 8);
    // Bullets
    for (const bullet of b.bullets) {
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI*2);
      ctx.fillStyle = '#ff4400';
      ctx.fill();
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // Player
  const p = player;
  const show = p.invTimer === 0 || Math.floor(p.invTimer/5) % 2 === 0;
  if (show) {
    const legSwing = Math.sin(p.animT * 0.25) * (p.vx !== 0 ? 8 : 0);
    ctx.save();
    ctx.translate(p.x + p.w/2, p.y + p.h/2);
    ctx.scale(p.facing, 1);
    // Shirt
    ctx.fillStyle = '#4cc9f0';
    ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h*0.55);
    // Pants
    ctx.fillStyle = '#3a86ff';
    ctx.fillRect(-p.w/2, p.h*0.05, p.w, p.h*0.45);
    // Head
    ctx.fillStyle = '#f8d7b4';
    ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h*0.3);
    // Eyes
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect( 2, -p.h*0.3, 3, 3);
    ctx.fillRect(-5, -p.h*0.3, 3, 3);
    // Legs
    ctx.fillStyle = '#3a86ff';
    ctx.save(); ctx.rotate(legSwing * Math.PI/180);
    ctx.fillRect(-p.w/2, p.h*0.45, p.w*0.45-1, p.h*0.3);
    ctx.restore();
    ctx.save(); ctx.rotate(-legSwing * Math.PI/180);
    ctx.fillRect(p.w*0.05, p.h*0.45, p.w*0.45-1, p.h*0.3);
    ctx.restore();
    ctx.restore();
  }

  // Particles
  for (const pt of particles) {
    ctx.globalAlpha = pt.life / 35;
    ctx.fillStyle   = pt.color;
    ctx.fillRect(pt.x-2, pt.y-2, 4, 4);
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // Bottom progress bar (next boss countdown)
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, 360, W, 20);
  const pct = (score % 250) / 250;
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(0, 360, W * pct, 20);
  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  const nextBossIn = 250 - (score % 250);
  ctx.fillText(boss ? 'BOSS FIGHT!  Stomp to damage!' : 'Next boss in: ' + nextBossIn + ' pts', W/2, 374);
  ctx.textAlign = 'left';
}

// ─── Start ────────────────────────────────────────────────────────────────────

initGame();
