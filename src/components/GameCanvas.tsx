import React, { useEffect, useRef } from 'react';
import { GameState, Building, Point, CostumeId, Web, Enemy, WebShot } from '../types';

const PIXELS_PER_METER = 35;
const GRAVITY = 9.81 * PIXELS_PER_METER;
const AIR_DRAG_PER_SECOND = 0.22;
const WEB_STIFFNESS = 65;
const WEB_DAMPING = 12;
const RETRACT_SPEED = 11 * PIXELS_PER_METER;
const DUAL_RETRACT_MULTIPLIER = 1.2;
const MIN_WEB_LENGTH = 75;
const FIXED_TIMESTEP = 1 / 120;
const MAX_FRAME_DELTA = 1 / 30;
const BUILDING_SPACING = 300;
const ABYSS_Y = 2000;
const GROUND_Y = ABYSS_Y - 40;
const GROUND_BOUNCE_DAMPING = 0.25;
const GROUND_FRICTION = 0.82;
const WALK_ACCELERATION = 2200;
const WALK_MAX_SPEED = 280;
const WEB_SHOT_SPEED = 1100;
const WEB_SHOT_LIFETIME = 1.1;

interface GameCanvasProps {
  costume: CostumeId;
  onGameOver: (score: number) => void;
  onScoreUpdate: (score: number) => void;
  onLivesUpdate: (lives: number) => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ costume, onGameOver, onScoreUpdate, onLivesUpdate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const previousTimeRef = useRef<number | null>(null);
  const accumulatorRef = useRef(0);
  const lastTouchTimeRef = useRef<number>(0);
  const keysRef = useRef({ left: false, right: false });
  const stateRef = useRef<GameState>({
    player: {
      x: 0,
      y: ABYSS_Y - 600,
      vx: 420,
      vy: -120,
      radius: 15,
      rotation: 0,
      leftWeb: { active: false, anchor: null, restLength: 0 },
      rightWeb: { active: false, anchor: null, restLength: 0 },
      invulnerableUntil: 0,
    },
    buildings: [],
    enemies: [],
    webShots: [],
    score: 0,
    lives: 5,
    cameraX: -200,
    cameraY: ABYSS_Y - 600,
    pointer: { x: 500, y: 300 },
    isGameOver: false,
  });

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        canvasRef.current.width = clientWidth;
        canvasRef.current.height = clientHeight;
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize();
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize buildings and enemies
  useEffect(() => {
    const initialBuildings: Building[] = [];
    const initialEnemies: Enemy[] = [];
    for (let i = -1; i < 10; i++) {
      const bX = i * BUILDING_SPACING;
      initialBuildings.push(generateBuilding(bX));
      if (i > 0) {
        initialEnemies.push(generateEnemy(bX + BUILDING_SPACING / 2));
        if (Math.random() > 0.45) initialEnemies.push(generateEnemy(bX + BUILDING_SPACING / 2 + (Math.random() * 130 - 65)));
      }
    }
    stateRef.current.buildings = initialBuildings;
    stateRef.current.enemies = initialEnemies;
  }, []);

  const generateEnemy = (x: number): Enemy => {
    const enemyTypes: Enemy['type'][] = ['goblin', 'lizard', 'rhino'];
    const type = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
    const statsByType: Record<Enemy['type'], { radius: number; hp: number; speed: number }> = {
      goblin: { radius: 20, hp: 1, speed: 90 },
      lizard: { radius: 24, hp: 2, speed: 70 },
      rhino: { radius: 28, hp: 3, speed: 55 },
    };
    const stats = statsByType[type];
    return {
      x,
      spawnX: x,
      y: GROUND_Y - 110 - stats.radius,
      radius: stats.radius,
      type,
      vx: (Math.random() > 0.5 ? 1 : -1) * stats.speed,
      hp: stats.hp,
      direction: Math.random() > 0.5 ? 1 : -1,
    };
  };

  const shootWeb = () => {
    const state = stateRef.current;
    if (state.isGameOver) return;
    const worldPointerX = state.pointer.x + state.cameraX;
    const worldPointerY = state.pointer.y + state.cameraY;
    const dx = worldPointerX - state.player.x;
    const dy = worldPointerY - state.player.y;
    const distance = Math.hypot(dx, dy) || 1;
    const shot: WebShot = {
      x: state.player.x + (dx / distance) * (state.player.radius + 6),
      y: state.player.y + (dy / distance) * (state.player.radius + 6),
      vx: (dx / distance) * WEB_SHOT_SPEED,
      vy: (dy / distance) * WEB_SHOT_SPEED,
      life: WEB_SHOT_LIFETIME,
    };
    state.webShots.push(shot);
  };

  const generateBuilding = (x: number): Building => {
    const width = 120 + Math.random() * 150;
    const height = 400 + Math.random() * 600;
    const colors = [
      { main: '#0f172a', dark: '#020617' },
      { main: '#1e293b', dark: '#0f172a' },
      { main: '#334155', dark: '#1e293b' },
      { main: '#1e1b4b', dark: '#111827' }
    ];
    const colorPair = colors[Math.floor(Math.random() * colors.length)];
    
    const windows: Point[] = [];
    for (let wx = 15; wx < width - 15; wx += 30) {
      for (let wy = 20; wy < height; wy += 40) {
        if (Math.random() > 0.4) {
          windows.push({ x: wx, y: wy });
        }
      }
    }
    
    return {
      x,
      y: ABYSS_Y - height,
      width,
      height,
      color: colorPair.main,
      darkColor: colorPair.dark,
      hasAntenna: Math.random() > 0.6,
      antennaX: width * 0.2 + Math.random() * (width * 0.6),
      windows,
    };
  };

  const getPointerPos = (clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const handlePointerMove = (e: React.MouseEvent) => {
    stateRef.current.pointer = getPointerPos(e.clientX, e.clientY);
  };

  const fireWeb = (web: Web, pos: Point) => {
    const state = stateRef.current;
    const worldX = pos.x + state.cameraX;
    const worldY = pos.y + state.cameraY;

    let bestAnchor: Point | null = null;

    for (const b of state.buildings) {
      if (worldX >= b.x && worldX <= b.x + b.width && worldY >= b.y) {
        bestAnchor = { x: worldX, y: worldY };
        break;
      }
    }

    if (bestAnchor) {
      web.active = true;
      web.anchor = bestAnchor;
      web.restLength = Math.hypot(bestAnchor.x - state.player.x, bestAnchor.y - state.player.y);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (stateRef.current.isGameOver) return;
    // Ignore mouse events if they were triggered by a touch event recently (prevents double-firing on mobile)
    if (Date.now() - lastTouchTimeRef.current < 500) return;

    const isRightClick = e.button === 2;
    const pos = getPointerPos(e.clientX, e.clientY);
    stateRef.current.pointer = pos;
    const web = isRightClick ? stateRef.current.player.rightWeb : stateRef.current.player.leftWeb;
    fireWeb(web, pos);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (Date.now() - lastTouchTimeRef.current < 500) return;
    const state = stateRef.current;
    const isRightClick = e.button === 2;
    const web = isRightClick ? state.player.rightWeb : state.player.leftWeb;
    web.active = false;
    web.anchor = null;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    // Prevent default to eliminate 300ms mobile tap delay and double-firing
    if (e.cancelable) e.preventDefault();
    
    if (stateRef.current.isGameOver) return;
    lastTouchTimeRef.current = Date.now();
    const state = stateRef.current;
    
    Array.from(e.changedTouches).forEach(touch => {
      const pos = getPointerPos(touch.clientX, touch.clientY);
      if (touch.clientX < window.innerWidth / 2) {
        fireWeb(state.player.leftWeb, pos);
      } else {
        fireWeb(state.player.rightWeb, pos);
      }
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    if (e.touches.length > 0) {
      stateRef.current.pointer = getPointerPos(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    const state = stateRef.current;

    let hasLeft = false;
    let hasRight = false;
    
    Array.from(e.touches).forEach(touch => {
      if (touch.clientX < window.innerWidth / 2) hasLeft = true;
      else hasRight = true;
    });

    if (!hasLeft) {
      state.player.leftWeb.active = false;
      state.player.leftWeb.anchor = null;
    }
    if (!hasRight) {
      state.player.rightWeb.active = false;
      state.player.rightWeb.anchor = null;
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') keysRef.current.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') keysRef.current.right = true;
      if (e.code === 'Space') {
        e.preventDefault();
        shootWeb();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') keysRef.current.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') keysRef.current.right = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const update = (dt: number) => {
    const state = stateRef.current;
    if (state.isGameOver) return;
    
    const canvas = canvasRef.current;
    const canvasWidth = canvas ? canvas.width : 1000;
    const canvasHeight = canvas ? canvas.height : 600;

    const player = state.player;

    // Apply gravity
    player.vy += GRAVITY * dt;

    const bothActive = player.leftWeb.active && player.rightWeb.active;
    const currentRetractSpeed = bothActive ? RETRACT_SPEED * DUAL_RETRACT_MULTIPLIER : RETRACT_SPEED;

    const applyWeb = (web: Web) => {
      if (!web.active || !web.anchor) return;
      const dx = web.anchor.x - player.x;
      const dy = web.anchor.y - player.y;
      const distance = Math.hypot(dx, dy);

      web.restLength = Math.max(MIN_WEB_LENGTH, web.restLength - currentRetractSpeed * dt);

      if (distance > web.restLength) {
        const stretch = distance - web.restLength;
        const nx = dx / distance;
        const ny = dy / distance;

        const radialVelocity = player.vx * nx + player.vy * ny;
        const tensionAcceleration = stretch * WEB_STIFFNESS - radialVelocity * WEB_DAMPING;
        if (tensionAcceleration > 0) {
          player.vx += nx * tensionAcceleration * dt;
          player.vy += ny * tensionAcceleration * dt;
        }

        const correction = stretch * 0.22;
        player.x += nx * correction;
        player.y += ny * correction;
      }
    };

    // Apply constraints sequentially (multiple iterations for stability if both active)
    for (let i = 0; i < 3; i++) {
      applyWeb(player.leftWeb);
      applyWeb(player.rightWeb);
    }

    const drag = Math.exp(-AIR_DRAG_PER_SECOND * dt);
    player.vx *= drag;
    player.vy *= drag;

    // Update Position
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // Smooth Camera Follow
    const targetCamX = player.x - canvasWidth * 0.35;
    const targetCamY = player.y - canvasHeight * 0.5;
    state.cameraX += (targetCamX - state.cameraX) * 0.1;
    state.cameraY += (targetCamY - state.cameraY) * 0.1;

    // Clamp Camera Y so we don't see infinitely below ground
    const maxCamY = ABYSS_Y - canvasHeight + 200;
    if (state.cameraY > maxCamY) state.cameraY = maxCamY;

    // Generate new buildings and enemies
    const lastBuilding = state.buildings[state.buildings.length - 1];
    if (lastBuilding.x - state.cameraX < canvasWidth + 500) {
      const nextX = lastBuilding.x + BUILDING_SPACING + Math.random() * 200;
      state.buildings.push(generateBuilding(nextX));
      state.enemies.push(generateEnemy(nextX - BUILDING_SPACING / 2));
      if (Math.random() > 0.4) state.enemies.push(generateEnemy(nextX - BUILDING_SPACING / 2 + (Math.random() * 150 - 75)));
    }

    // Remove old buildings and enemies
    if (state.buildings[0].x - state.cameraX < -1000) {
      state.buildings.shift();
    }
    if (state.enemies.length > 0 && state.enemies[0].x - state.cameraX < -1000) {
      state.enemies.shift();
    }

    const onGround = player.y + player.radius >= GROUND_Y - 0.5;
    if (onGround) {
      if (keysRef.current.left) player.vx -= WALK_ACCELERATION * dt;
      if (keysRef.current.right) player.vx += WALK_ACCELERATION * dt;
      player.vx = Math.max(-WALK_MAX_SPEED, Math.min(WALK_MAX_SPEED, player.vx));
      if (!keysRef.current.left && !keysRef.current.right) player.vx *= GROUND_FRICTION;
    }

    // Update web shots
    for (let i = state.webShots.length - 1; i >= 0; i--) {
      const shot = state.webShots[i];
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      if (shot.life <= 0) {
        state.webShots.splice(i, 1);
      }
    }

    // Enemy movement and collisions
    const now = Date.now();
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const enemy = state.enemies[i];
      const walkSpeed = Math.abs(enemy.vx);
      enemy.x += walkSpeed * enemy.direction * dt;

      // Patrol around spawn area
      if (enemy.x > enemy.spawnX + 90) enemy.direction = -1;
      if (enemy.x < enemy.spawnX - 90) enemy.direction = 1;

      for (let j = state.webShots.length - 1; j >= 0; j--) {
        const shot = state.webShots[j];
        const distToShot = Math.hypot(enemy.x - shot.x, enemy.y - shot.y);
        if (distToShot < enemy.radius + 8) {
          enemy.hp -= 1;
          state.webShots.splice(j, 1);
          if (enemy.hp <= 0) {
            state.enemies.splice(i, 1);
            state.score += 12;
            onScoreUpdate(state.score);
          }
          break;
        }
      }

      if (now > player.invulnerableUntil) {
        const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (dist < player.radius + enemy.radius) {
          state.lives -= 1;
          onLivesUpdate(state.lives);
          player.invulnerableUntil = now + 1500; // 1.5s invulnerability
          
          // Bounce back
          player.vx = (player.x < enemy.x ? -1 : 1) * 220;
          player.vy = -220;
          
          // Break webs
          player.leftWeb.active = false;
          player.rightWeb.active = false;
          
          if (state.lives <= 0) {
            state.isGameOver = true;
            onGameOver(state.score);
          }
          break; // Only one enemy hit per frame
        }
      }
    }

    // Score based on distance
    const newScore = Math.floor(player.x / 50);
    if (newScore > state.score) {
      state.score = newScore;
      onScoreUpdate(state.score);
    }

    // Ground collision: prevent falling out of the map
    const playerBottom = player.y + player.radius;
    if (playerBottom > GROUND_Y) {
      player.y = GROUND_Y - player.radius;
      if (player.vy > 0) {
        player.vy *= -GROUND_BOUNCE_DAMPING;
        if (Math.abs(player.vy) < 25) player.vy = 0;
      }
    }
  };

  const getCostumeColors = (id: CostumeId) => {
    switch(id) {
      case 'symbiote': return { primary: '#111', secondary: '#000', eye: '#fff', web: '#fff' };
      case 'miles': return { primary: '#111', secondary: '#ef4444', eye: '#ef4444', web: '#ef4444' };
      case 'gwen': return { primary: '#fff', secondary: '#000', eye: '#ec4899', web: '#06b6d4' };
      case 'iron': return { primary: '#ef4444', secondary: '#eab308', eye: '#eab308', web: '#eab308' };
      case '2099': return { primary: '#1d4ed8', secondary: '#ef4444', eye: '#ef4444', web: '#ef4444' };
      case 'noir': return { primary: '#292524', secondary: '#1c1917', eye: '#fff', web: '#a8a29e' };
      case 'classic':
      default: return { primary: '#ef4444', secondary: '#1d4ed8', eye: '#fff', web: '#fff' };
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const state = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw Sky Background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    gradient.addColorStop(0, '#020617'); // Very dark blue
    gradient.addColorStop(1, '#1e293b'); // Slate
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw Parallax Cityscape (Background layer)
    ctx.fillStyle = '#0f172a';
    const bgOffset = (state.cameraX * 0.3) % 300;
    for (let i = -2; i < canvasWidth / 300 + 3; i++) {
      const x = i * 300 - bgOffset;
      const yOffset = state.cameraY * 0.3;
      ctx.fillRect(x + 30, ABYSS_Y - 800 - yOffset, 100, 1200);
      ctx.fillRect(x + 150, ABYSS_Y - 950 - yOffset, 120, 1350);
    }

    ctx.save();
    ctx.translate(-state.cameraX, -state.cameraY);

    // Draw themed ground (city street with spider-web motif)
    const groundLeft = state.cameraX - 200;
    const groundWidth = canvasWidth + 400;
    const groundHeight = 280;

    const groundGradient = ctx.createLinearGradient(0, GROUND_Y - groundHeight, 0, GROUND_Y + 30);
    groundGradient.addColorStop(0, '#0f172a');
    groundGradient.addColorStop(1, '#020617');
    ctx.fillStyle = groundGradient;
    ctx.fillRect(groundLeft, GROUND_Y - groundHeight, groundWidth, groundHeight + 60);

    // Asphalt lanes
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(groundLeft, GROUND_Y - 110, groundWidth, 70);

    // Lane markings
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 18]);
    ctx.beginPath();
    ctx.moveTo(groundLeft, GROUND_Y - 74);
    ctx.lineTo(groundLeft + groundWidth, GROUND_Y - 74);
    ctx.stroke();
    ctx.setLineDash([]);

    // Spider-web arcs on the ground to match game theme
    const webCenterY = GROUND_Y - 18;
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const radius = 45 + i * 24;
      ctx.beginPath();
      ctx.arc(state.cameraX + canvasWidth * 0.5, webCenterY, radius, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = -5; i <= 5; i++) {
      const x = state.cameraX + canvasWidth * 0.5 + i * 30;
      ctx.beginPath();
      ctx.moveTo(state.cameraX + canvasWidth * 0.5, webCenterY);
      ctx.lineTo(x, GROUND_Y + 10);
      ctx.stroke();
    }

    // Glowing top line of the ground
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(groundLeft, GROUND_Y - 110);
    ctx.lineTo(groundLeft + groundWidth, GROUND_Y - 110);
    ctx.stroke();

    // Draw Buildings (Foreground)
    state.buildings.forEach(b => {
      // Building Gradient
      const bGrad = ctx.createLinearGradient(b.x, 0, b.x + b.width, 0);
      bGrad.addColorStop(0, b.color);
      bGrad.addColorStop(1, b.darkColor);
      ctx.fillStyle = bGrad;
      ctx.fillRect(b.x, b.y, b.width, canvasHeight * 3);
      
      // Roof Ledge
      ctx.fillStyle = b.darkColor;
      ctx.fillRect(b.x - 5, b.y, b.width + 10, 15);

      // Antenna
      if (b.hasAntenna) {
        ctx.fillStyle = '#475569';
        ctx.fillRect(b.x + b.antennaX, b.y - 60, 4, 60);
        ctx.beginPath();
        ctx.arc(b.x + b.antennaX + 2, b.y - 60, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
      }

      // Windows
      ctx.fillStyle = 'rgba(255, 255, 150, 0.15)';
      
      // Only draw windows that are visible on screen
      const minVisibleY = state.cameraY - 50;
      const maxVisibleY = state.cameraY + canvasHeight + 50;
      
      // Batch window drawing for performance
      ctx.beginPath();
      b.windows.forEach(w => {
        const worldY = b.y + w.y;
        if (worldY > minVisibleY && worldY < maxVisibleY) {
          ctx.rect(b.x + w.x, worldY, 12, 20);
        }
      });
      ctx.fill();
    });

    // Draw Wind Lines (Speed effect)
    const speed = Math.hypot(state.player.vx, state.player.vy);
    const visualSpeed = speed / 60;
    if (visualSpeed > 20) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.3, (visualSpeed - 20) / 100)})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 15; i++) {
        const x = (Math.random() * canvasWidth);
        const y = (Math.random() * canvasHeight);
        const len = visualSpeed * 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - (state.player.vx / speed) * len, y - (state.player.vy / speed) * len);
        ctx.stroke();
      }
    }

    // Draw enemies (only ground enemies, no flying units)
    state.enemies.forEach(enemy => {
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.scale(enemy.direction, 1);

      if (enemy.type === 'goblin') {
        ctx.fillStyle = '#16a34a';
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(-enemy.radius * 0.4, -enemy.radius * 0.9, enemy.radius * 0.8, enemy.radius * 0.5);
      } else if (enemy.type === 'lizard') {
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.ellipse(0, 0, enemy.radius * 1.2, enemy.radius * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(enemy.radius * 0.2, -enemy.radius * 0.2, enemy.radius, enemy.radius * 0.2);
      } else {
        ctx.fillStyle = '#4b5563';
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-enemy.radius * 0.5, -enemy.radius * 0.35, enemy.radius, enemy.radius * 0.3);
      }

      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(enemy.radius * 0.2, -enemy.radius * 0.15, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Draw web shots
    state.webShots.forEach(shot => {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, 3.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(shot.x - 6, shot.y);
      ctx.lineTo(shot.x + 6, shot.y);
      ctx.moveTo(shot.x, shot.y - 6);
      ctx.lineTo(shot.x, shot.y + 6);
      ctx.stroke();
    });

    const colors = getCostumeColors(costume);

    // Draw Webs
    const drawWeb = (web: Web) => {
      if (web.active && web.anchor) {
        ctx.beginPath();
        ctx.moveTo(state.player.x, state.player.y);
        ctx.lineTo(web.anchor.x, web.anchor.y);
        ctx.strokeStyle = colors.web;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(web.anchor.x, web.anchor.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = colors.web;
        ctx.fill();
        
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(web.anchor.x, web.anchor.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }
    };
    drawWeb(state.player.leftWeb);
    drawWeb(state.player.rightWeb);

    // Draw Player
    const p = state.player;
    const isGrounded = p.y + p.radius >= GROUND_Y - 0.5;
    const velocityAngle = isGrounded ? 0 : Math.atan2(p.vy, p.vx);
    const walkSwing = isGrounded ? Math.sin(Date.now() * 0.018 + p.x * 0.04) * Math.min(1, Math.abs(p.vx) / 120) : 0;
    
    // Flashing effect if invulnerable
    const isInvulnerable = Date.now() < p.invulnerableUntil;
    if (isInvulnerable && Math.floor(Date.now() / 100) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }
    
    // Motion Blur (Trail)
    if (visualSpeed > 15) {
      ctx.globalAlpha = 0.3;
      for (let i = 1; i < 4; i++) {
        ctx.save();
        ctx.translate(p.x - (p.vx / 60) * i * 0.5, p.y - (p.vy / 60) * i * 0.5);
        ctx.rotate(velocityAngle);
        ctx.fillStyle = colors.primary;
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1.0;
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    
    // Rotation based on velocity
    ctx.rotate(velocityAngle);

    // Legs
    ctx.strokeStyle = colors.secondary;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-8, -5);
    ctx.lineTo(-22 + walkSwing * 7, -10 - walkSwing * 4);
    ctx.moveTo(-8, 5);
    ctx.lineTo(-22 - walkSwing * 7, 10 + walkSwing * 4);
    ctx.stroke();

    // Body (Oval)
    ctx.fillStyle = colors.primary;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.beginPath();
    ctx.arc(12, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Eyes
    ctx.fillStyle = colors.eye;
    ctx.beginPath();
    ctx.arc(15, -3, 2.5, 0, Math.PI * 2);
    ctx.arc(15, 3, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Arms shooting webs (drawn separately to point at anchors)
    const drawArm = (web: Web, offsetY: number) => {
      ctx.strokeStyle = colors.primary;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      // Start from shoulder roughly
      const shoulderX = p.x + Math.cos(velocityAngle) * 5 - Math.sin(velocityAngle) * offsetY;
      const shoulderY = p.y + Math.sin(velocityAngle) * 5 + Math.cos(velocityAngle) * offsetY;
      ctx.moveTo(shoulderX, shoulderY);
      
      if (web.active && web.anchor) {
        const dx = web.anchor.x - shoulderX;
        const dy = web.anchor.y - shoulderY;
        const dist = Math.hypot(dx, dy);
        const armLen = 20;
        ctx.lineTo(shoulderX + (dx/dist)*armLen, shoulderY + (dy/dist)*armLen);
      } else {
        // Trail arm behind
        const trailAngle = velocityAngle + Math.PI + (offsetY > 0 ? 0.5 : -0.5);
        ctx.lineTo(shoulderX + Math.cos(trailAngle)*15, shoulderY + Math.sin(trailAngle)*15);
      }
      ctx.stroke();
    };

    drawArm(p.leftWeb, -6); // Left arm
    drawArm(p.rightWeb, 6); // Right arm

    ctx.restore();
    ctx.globalAlpha = 1.0; // Reset alpha after player draw

    // Draw Crosshair (Aiming indicator)
    if (!state.isGameOver) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      const gap = 6;
      const len = 10;
      
      // Top
      ctx.moveTo(state.pointer.x, state.pointer.y - gap);
      ctx.lineTo(state.pointer.x, state.pointer.y - gap - len);
      // Bottom
      ctx.moveTo(state.pointer.x, state.pointer.y + gap);
      ctx.lineTo(state.pointer.x, state.pointer.y + gap + len);
      // Left
      ctx.moveTo(state.pointer.x - gap, state.pointer.y);
      ctx.lineTo(state.pointer.x - gap - len, state.pointer.y);
      // Right
      ctx.moveTo(state.pointer.x + gap, state.pointer.y);
      ctx.lineTo(state.pointer.x + gap + len, state.pointer.y);
      
      // Center dot
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.arc(state.pointer.x, state.pointer.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.stroke();
    }

    // Draw Speed Bar (Mobile-based UI)
    const barWidth = 150;
    const barHeight = 8;
    const barX = canvasWidth / 2 - barWidth / 2;
    const barY = canvasHeight - 40;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.roundRect?.(barX - 5, barY - 20, barWidth + 10, barHeight + 25, 10);
    ctx.fill();
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HIZ', canvasWidth / 2, barY - 8);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    
    const speedFill = Math.min(1, visualSpeed / 60);
    const speedColor = visualSpeed > 40 ? '#ef4444' : visualSpeed > 20 ? '#eab308' : '#22c55e';
    ctx.fillStyle = speedColor;
    ctx.fillRect(barX, barY, barWidth * speedFill, barHeight);
  };

  const loop = (time: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (previousTimeRef.current === null) {
      previousTimeRef.current = time;
    }

    const rawDelta = (time - previousTimeRef.current) / 1000;
    previousTimeRef.current = time;
    accumulatorRef.current += Math.min(rawDelta, MAX_FRAME_DELTA);

    while (accumulatorRef.current >= FIXED_TIMESTEP) {
      update(FIXED_TIMESTEP);
      accumulatorRef.current -= FIXED_TIMESTEP;
    }

    if (ctx) {
      draw(ctx);
    }
    requestRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden touch-none">
      <canvas
        ref={canvasRef}
        onMouseMove={handlePointerMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onContextMenu={(e) => e.preventDefault()}
        className="block cursor-none touch-none select-none"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      />
    </div>
  );
};
