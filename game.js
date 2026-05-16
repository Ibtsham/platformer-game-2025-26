const canvas = document.getElementById('gc');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

let gameState = 'idle';
let player, platforms, enemies, coins, particles;
let score, health, cameraX;
let keys = {};
let animFrame;

// ─── Input ───────────────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
document.getElementById('start-btn').onclick = initGame;

// ─── Init ─────────────────────────────────────────────────────────────────────

function initGame() {
  score = 0;
  health = 3;
  cameraX = 0;
  particles = [];
  document.getElementById('msg').style.display = 'none';

  platforms = [
    // Piattaforme principali (pavimento)
    {x:0,    y:340, w:400,  h:20, c:'#3d5a80'},
    {x:440,  y:340, w:300,  h:20, c:'#3d5a80'},
    {x:780,  y:340, w:400,  h:20, c:'#3d5a80'},
    {x:1200, y:340, w:500,  h:20, c:'#3d5a80'},
    {x:1740, y:340, w:400,  h:20, c:'#3d5a80'},
    {x:2180, y:340, w:600,  h:20, c:'#3d5a80'},
    // Piattaforme sopraelevate
    {x:100,  y:260, w:120, h:16, c:'#4a7c59'},
    {x:300,  y:200, w:100, h:16, c:'#4a7c59'},
    {x:500,  y:270, w:130, h:16, c:'#4a7c59'},
    {x:680,  y:210, w:100, h:16, c:'#4a7c59'},
    {x:860,  y:260, w:140, h:16, c:'#4a7c59'},
    {x:1060, y:200, w:120, h:16, c:'#4a7c59'},
    {x:1250, y:260, w:100, h:16, c:'#4a7c59'},
    {x:1420, y:200, w:130, h:16, c:'#4a7c59'},
    {x:1600, y:260, w:100, h:16, c:'#4a7c59'},
    {x:1800, y:210, w:120, h:16, c:'#4a7c59'},
    {x:2000, y:260, w:140, h:16, c:'#4a7c59'},
    {x:2200, y:200, w:100, h:16, c:'#4a7c59'},
    {x:2400, y:260, w:120, h:16, c:'#4a7c59'},
    {x:2600, y:200, w:80,  h:16, c:'#4a7c59'},
    // Piattaforma goal
    {x:2720, y:300, w:200,  h:20, c:'#c87137'},
  ];

  enemies = [
    // Nemici sul pavimento
    {x:200,  y:316, vx:1.5,  sx:200,  range:80,  w:24, h:24, alive:true},
    {x:550,  y:316, vx:-1.5, sx:550,  range:80,  w:24, h:24, alive:true},
    {x:900,  y:316, vx:1.2,  sx:900,  range:100, w:24, h:24, alive:true},
    {x:1300, y:316, vx:1.8,  sx:1300, range:90,  w:24, h:24, alive:true},
    {x:1600, y:316, vx:-1.5, sx:1600, range:80,  w:24, h:24, alive:true},
    {x:1870, y:316, vx:1.5,  sx:1870, range:100, w:24, h:24, alive:true},
    {x:2100, y:316, vx:-1.8, sx:2100, range:80,  w:24, h:24, alive:true},
    {x:2350, y:316, vx:1.5,  sx:2350, range:90,  w:24, h:24, alive:true},
    // Nemici sulle piattaforme sopraelevate
    {x:120,  y:236, vx:1.0,  sx:120,  range:60,  w:24, h:24, alive:true},
    {x:510,  y:246, vx:-1.0, sx:510,  range:70,  w:24, h:24, alive:true},
    {x:880,  y:236, vx:1.0,  sx:880,  range:80,  w:24, h:24, alive:true},
  ];

  coins = [];
  const coinPositions = [
    150,250, 170,250, 190,250,
    310,185, 330,185,
    510,250, 530,250,
    690,195, 710,195,
    880,245, 900,245,
    1070,185, 1090,185,
    1260,245, 1280,245,
    1430,185, 1450,185,
    1610,245, 1630,245,
    1810,195, 1830,195,
    2010,245, 2030,245,
    2210,185, 2230,185,
    2410,245, 2430,245,
    2610,185, 2630,185,
    460,320,  750,320, 1150,320, 1750,320, 2100,320,
  ];
  for (let i = 0; i < coinPositions.length; i += 2) {
    coins.push({
      x: coinPositions[i],
      y: coinPositions[i+1],
      r: 7,
      collected: false,
      bob: Math.random() * Math.PI * 2
    });
  }

  player = {
    x: 60, y: 300,
    w: 22, h: 28,
    vx: 0, vy: 0,
    onGround: false,
    jumpsLeft: 2,
    spawnX: 60, spawnY: 300,
    invTimer: 0,
    facing: 1,
    animT: 0,
    alive: true
  };

  gameState = 'playing';
  if (animFrame) cancelAnimationFrame(animFrame);
  loop();
}

// ─── Game Loop ────────────────────────────────────────────────────────────────

function loop() {
  update();
  draw();
  animFrame = requestAnimationFrame(loop);
}

// ─── Collisione AABB ──────────────────────────────────────────────────────────

function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
}

// ─── Update (logica) ──────────────────────────────────────────────────────────

function update() {
  if (gameState !== 'playing') return;

  const p = player;
  p.animT++;

  // Input
  const left  = keys['ArrowLeft']  || keys['KeyA'];
  const right = keys['ArrowRight'] || keys['KeyD'];
  const jump  = keys['Space'] || keys['ArrowUp'] || keys['KeyW'];

  // Movimento orizzontale
  p.vx = 0;
  if (left)  { p.vx = -4; p.facing = -1; }
  if (right) { p.vx =  4; p.facing =  1; }

  // Gravità
  p.vy += 0.55;
  if (p.vy > 14) p.vy = 14;

  // Salto (singolo + doppio)
  if (jump && !p._jumpHeld && p.jumpsLeft > 0) {
    p.vy = -11;
    p.jumpsLeft--;
    p._jumpHeld = true;
    spawnParticles(p.x + p.w/2, p.y + p.h, '#88aaff', 5);
  }
  if (!jump) p._jumpHeld = false;

  p.onGround = false;

  // Collisione orizzontale con piattaforme
  p.x += p.vx;
  for (const pl of platforms) {
    if (rectOverlap(p.x, p.y, p.w, p.h, pl.x, pl.y, pl.w, pl.h)) {
      if (p.vx > 0) p.x = pl.x - p.w;
      else          p.x = pl.x + pl.w;
      p.vx = 0;
    }
  }

  // Collisione verticale con piattaforme
  p.y += p.vy;
  for (const pl of platforms) {
    if (rectOverlap(p.x, p.y, p.w, p.h, pl.x, pl.y, pl.w, pl.h)) {
      if (p.vy > 0) { p.y = pl.y - p.h; p.onGround = true; p.jumpsLeft = 2; }
      else          { p.y = pl.y + pl.h; }
      p.vy = 0;
    }
  }

  // Raccolta monete
  for (const c of coins) {
    if (!c.collected && rectOverlap(p.x, p.y, p.w, p.h, c.x-c.r, c.y-c.r, c.r*2, c.r*2)) {
      c.collected = true;
      score += 10;
      spawnParticles(c.x, c.y, '#ffd700', 8);
      updateHUD();
    }
    c.bob += 0.06;
  }

  if (p.invTimer > 0) p.invTimer--;

  // Collisione con nemici
  for (const e of enemies) {
    if (!e.alive) continue;

    // Movimento pattuglia
    e.x += e.vx;
    if (e.x < e.sx - e.range || e.x > e.sx + e.range) e.vx = -e.vx;

    if (p.invTimer === 0 && rectOverlap(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) {
      const stompTop = p.y + p.h;
      const enemyMid = e.y + e.h / 2;

      if (p.vy > 0 && stompTop < enemyMid + 8) {
        // Stomp: uccidi il nemico
        e.alive = false;
        p.vy = -8;
        score += 50;
        spawnParticles(e.x + e.w/2, e.y + e.h/2, '#ff6b6b', 10);
        updateHUD();
      } else {
        // Danno al giocatore
        health--;
        p.invTimer = 90;
        p.vy = -7;
        p.vx = (p.x < e.x + e.w/2) ? -5 : 5;
        spawnParticles(p.x + p.w/2, p.y + p.h/2, '#ff4444', 8);
        updateHUD();
        if (health <= 0) {
          gameState = 'dead';
          showMsg('You died! 💀\nScore: ' + score + '\nClick Start to retry');
          return;
        }
      }
    }
  }

  // Caduta fuori dal livello
  if (p.y > H + 100) {
    health--;
    updateHUD();
    if (health <= 0) {
      gameState = 'dead';
      showMsg('You fell! 💀\nScore: ' + score + '\nClick Start to retry');
      return;
    }
    p.x = p.spawnX; p.y = p.spawnY; p.vy = 0; p.vx = 0;
    p.invTimer = 120;
  }

  // Condizione di vittoria
  if (p.x > 2720 && p.y > 270) {
    gameState = 'win';
    showMsg('🎉 You Win!\nScore: ' + score + '\nClick Start to play again');
    return;
  }

  // Camera che segue il giocatore
  cameraX = Math.max(0, Math.min(p.x - W/3, 2920 - W));

  // Aggiorna particelle
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.2; pt.life--;
    if (pt.life <= 0) particles.splice(i, 1);
  }
}

// ─── Particelle ───────────────────────────────────────────────────────────────

function spawnParticles(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 2 + Math.random() * 3;
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 2,
      life: 20 + Math.random() * 15,
      color
    });
  }
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

function updateHUD() {
  const hearts = ['♥','♥','♥'].map((_, i) => i < health ? '♥' : '♡').join(' ');
  document.getElementById('health-display').textContent = hearts;
  document.getElementById('score-display').textContent = 'Score: ' + score;
}

function showMsg(txt) {
  const el = document.getElementById('msg');
  el.style.display = 'block';
  el.textContent = txt;
}

// ─── Draw (rendering) ─────────────────────────────────────────────────────────

function draw() {
  ctx.clearRect(0, 0, W, H);

  // Sfondo
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  // Stelle con effetto parallasse
  for (let i = 0; i < 80; i++) {
    const sx = ((i*137 + 20) % 2920 - cameraX * 0.2) % W;
    const sy = (i*73 + 10) % (H * 0.7);
    ctx.fillStyle = `rgba(255,255,255,${0.2 + (i%3)*0.15})`;
    ctx.fillRect(((sx % W) + W) % W, sy, 1.5, 1.5);
  }

  ctx.save();
  ctx.translate(-cameraX, 0);

  // Piattaforme
  for (const pl of platforms) {
    ctx.fillStyle = pl.c;
    ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(pl.x, pl.y, pl.w, 3);
  }

  // Bandiera goal
  const flagX = 2770, flagY = 280;
  ctx.fillStyle = '#555';
  ctx.fillRect(flagX, flagY, 4, 50);
  ctx.fillStyle = '#f0c040';
  ctx.beginPath();
  ctx.moveTo(flagX+4, flagY);
  ctx.lineTo(flagX+30, flagY+12);
  ctx.lineTo(flagX+4, flagY+24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GOAL', flagX+17, flagY+47);
  ctx.textAlign = 'left';

  // Monete (con animazione bob)
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

  // Nemici
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

  // Giocatore
  const p = player;
  const show = p.invTimer === 0 || Math.floor(p.invTimer/5) % 2 === 0;
  if (show) {
    const legSwing = Math.sin(p.animT * 0.25) * (p.vx !== 0 ? 8 : 0);
    ctx.save();
    ctx.translate(p.x + p.w/2, p.y + p.h/2);
    ctx.scale(p.facing, 1);
    // Corpo
    ctx.fillStyle = '#4cc9f0';
    ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h*0.55);
    // Pantaloni
    ctx.fillStyle = '#3a86ff';
    ctx.fillRect(-p.w/2, p.h*0.05, p.w, p.h*0.45);
    // Testa
    ctx.fillStyle = '#f8d7b4';
    ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h*0.3);
    // Occhi
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(2, -p.h*0.3, 3, 3);
    ctx.fillRect(-5, -p.h*0.3, 3, 3);
    // Gambe con animazione
    ctx.fillStyle = '#3a86ff';
    ctx.save(); ctx.rotate(legSwing * Math.PI/180);
    ctx.fillRect(-p.w/2, p.h*0.45, p.w*0.45-1, p.h*0.3);
    ctx.restore();
    ctx.save(); ctx.rotate(-legSwing * Math.PI/180);
    ctx.fillRect(p.w*0.05, p.h*0.45, p.w*0.45-1, p.h*0.3);
    ctx.restore();
    ctx.restore();
  }

  // Particelle
  for (const pt of particles) {
    ctx.globalAlpha = pt.life / 35;
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x-2, pt.y-2, 4, 4);
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // Barra progresso monete
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, 360, W, 20);
  const collected = coins.filter(c => c.collected).length;
  const pct = collected / coins.length;
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(0, 360, W * pct, 20);
  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Coins: ' + collected + '/' + coins.length, W/2, 374);
  ctx.textAlign = 'left';
}

// ─── Avvio ────────────────────────────────────────────────────────────────────

initGame();
