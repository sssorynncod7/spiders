import React, { useEffect, useRef } from 'react';
import { GameState, Building, Point, CostumeId, Web, Obstacle } from '../types';

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
    obstacles: [],
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

  // Initialize buildings and obstacles
  useEffect(() => {
    const initialBuildings: Building[] = [];
    const initialObstacles: Obstacle[] = [];
    for (let i = -1; i < 10; i++) {
      const bX = i * BUILDING_SPACING;
      initialBuildings.push(generateBuilding(bX));
      if (i > 0) {
        if (Math.random() > 0.1) {
          initialObstacles.push(generateObstacle(bX + BUILDING_SPACING / 2));
        }
        if (Math.random() > 0.4) {
          initialObstacles.push(generateObstacle(bX + BUILDING_SPACING / 2 + (Math.random() * 150 - 75)));
        }
      }
    }
    stateRef.current.buildings = initialBuildings;
    stateRef.current.obstacles = initialObstacles;
  }, []);

  const generateObstacle = (x: number): Obstacle => {
    return {
      x,
      y: ABYSS_Y - 200 - Math.random() * 600, // Lower down
      radius: 20,
      type: Math.random() > 0.5 ? 'drone' : 'mine',
      offsetY: Math.random() * Math.PI * 2, // Random starting phase for floating
    };
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

    // Generate new buildings and obstacles
    const lastBuilding = state.buildings[state.buildings.length - 1];
    if (lastBuilding.x - state.cameraX < canvasWidth + 500) {
      const nextX = lastBuilding.x + BUILDING_SPACING + Math.random() * 200;
      state.buildings.push(generateBuilding(nextX));
      if (Math.random() > 0.1) {
        state.obstacles.push(generateObstacle(nextX - BUILDING_SPACING / 2));
      }
      if (Math.random() > 0.4) {
        state.obstacles.push(generateObstacle(nextX - BUILDING_SPACING / 2 + (Math.random() * 150 - 75)));
      }
    }

    // Remove old buildings and obstacles
    if (state.buildings[0].x - state.cameraX < -1000) {
      state.buildings.shift();
    }
    if (state.obstacles.length > 0 && state.obstacles[0].x - state.cameraX < -1000) {
      state.obstacles.shift();
    }

    // Obstacle collision and movement
    const now = Date.now();
    for (const obs of state.obstacles) {
      // Floating animation
      obs.offsetY += 0.05;
      
      if (now > player.invulnerableUntil) {
        const actualY = obs.y + Math.sin(obs.offsetY) * 20;
        const dist = Math.hypot(player.x - obs.x, player.y - actualY);
        if (dist < player.radius + obs.radius) {
          state.lives -= 1;
          onLivesUpdate(state.lives);
          player.invulnerableUntil = now + 1500; // 1.5s invulnerability
          
          // Bounce back
          player.vx *= -0.5;
          player.vy = -220;
          
          // Break webs
          player.leftWeb.active = false;
          player.rightWeb.active = false;
          
          if (state.lives <= 0) {
            state.isGameOver = true;
            onGameOver(state.score);
          }
          break; // Only hit one obstacle per frame
        }
      }
    }

    // Score based on distance
    const newScore = Math.floor(player.x / 50);
    if (newScore > state.score) {
      state.score = newScore;
      onScoreUpdate(state.score);
    }

    // Game over conditions
    if (player.y > state.cameraY + canvasHeight + 50) {
      state.isGameOver = true;
      onGameOver(state.score);
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

    // Draw Obstacles
    state.obstacles.forEach(obs => {
      const actualY = obs.y + Math.sin(obs.offsetY) * 20;
      
      ctx.save();
      ctx.translate(obs.x, actualY);
      
      if (obs.type === 'mine') {
        // Spiky floating mine
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, 0, obs.radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#b91c1c';
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 + obs.offsetY;
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * obs.radius, Math.sin(angle) * obs.radius);
          ctx.lineTo(Math.cos(angle - 0.2) * (obs.radius - 5), Math.sin(angle - 0.2) * (obs.radius - 5));
          ctx.lineTo(Math.cos(angle) * (obs.radius + 8), Math.sin(angle) * (obs.radius + 8));
          ctx.lineTo(Math.cos(angle + 0.2) * (obs.radius - 5), Math.sin(angle + 0.2) * (obs.radius - 5));
          ctx.fill();
        }
        
        // Glowing center
        ctx.fillStyle = '#fca5a5';
        ctx.beginPath();
        ctx.arc(0, 0, obs.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Drone
        ctx.fillStyle = '#64748b';
        ctx.fillRect(-obs.radius, -obs.radius * 0.4, obs.radius * 2, obs.radius * 0.8);
        
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, 0, obs.radius * 0.3, 0, Math.PI * 2);
        ctx.fill();
        
        // Propellers
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-obs.radius, -obs.radius * 0.4);
        ctx.lineTo(-obs.radius + Math.cos(obs.offsetY * 10) * 10, -obs.radius * 0.4 - 5);
        ctx.moveTo(obs.radius, -obs.radius * 0.4);
        ctx.lineTo(obs.radius + Math.cos(obs.offsetY * 10) * 10, -obs.radius * 0.4 - 5);
        ctx.stroke();
      }
      
      ctx.restore();
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
    const velocityAngle = Math.atan2(p.vy, p.vx);
    
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

    // Legs (trailing behind)
    ctx.strokeStyle = colors.secondary;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-8, -5);
    ctx.lineTo(-22, -10); // Left leg
    ctx.moveTo(-8, 5);
    ctx.lineTo(-22, 10); // Right leg
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
