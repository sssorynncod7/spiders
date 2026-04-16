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
const WEB_SHOT_SPEED = 2600;
const WEB_SHOT_TENSION_DECAY = 4.5;
const WEB_OSCILLATION_SPEED = 11;
const WEB_OSCILLATION_AMPLITUDE = 22;
const WEB_ATTACH_MOMENTUM_BLEND = 0.75;
const WEB_RELEASE_BOOST = 0.16;
const FIXED_TIMESTEP = 1 / 120;
const MAX_FRAME_DELTA = 1 / 30;
const BUILDING_SPACING = 300;
const ABYSS_Y = 2000;
const GROUND_Y = ABYSS_Y - 40;

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
      leftWeb: { active: false, anchor: null, restLength: 0, targetAnchor: null, tip: null, shooting: false, shotTension: 0 },
      rightWeb: { active: false, anchor: null, restLength: 0, targetAnchor: null, tip: null, shooting: false, shotTension: 0 },
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
        if (Math.random() > 0.25) {
          initialObstacles.push(generateGroundObstacle(bX + BUILDING_SPACING * 0.62));
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
      lane: 'air',
      offsetY: Math.random() * Math.PI * 2, // Random starting phase for floating
    };
  };

  const generateGroundObstacle = (x: number): Obstacle => {
    const isSpike = Math.random() > 0.45;
    const width = isSpike ? 44 : 62;
    const height = isSpike ? 34 : 28;
    return {
      x,
      y: GROUND_Y,
      radius: Math.max(width, height) * 0.4,
      type: isSpike ? 'spike' : 'barrier',
      lane: 'ground',
      width,
      height,
      offsetY: Math.random() * Math.PI * 2,
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
    let bestDistance = Infinity;

    for (const b of state.buildings) {
      const inBuildingRange = worldX >= b.x - 30 && worldX <= b.x + b.width + 30 && worldY >= b.y - 120;
      if (!inBuildingRange) continue;
      const clampedX = Math.min(Math.max(worldX, b.x + 4), b.x + b.width - 4);
      const roofY = b.y;
      const anchor = { x: clampedX, y: roofY };
      const dist = Math.hypot(anchor.x - state.player.x, anchor.y - state.player.y);
      if (dist < bestDistance) {
        bestAnchor = anchor;
        bestDistance = dist;
      }
    }

    if (bestAnchor) {
      web.active = true;
      web.anchor = null;
      web.targetAnchor = bestAnchor;
      web.tip = { x: state.player.x, y: state.player.y };
      web.shooting = true;
      web.shotTension = 1;
      web.restLength = Math.hypot(bestAnchor.x - state.player.x, bestAnchor.y - state.player.y);

      // Spiderdoll-like snap: preserve momentum but redirect a bit toward rope tangent.
      const toAnchorX = bestAnchor.x - state.player.x;
      const toAnchorY = bestAnchor.y - state.player.y;
      const len = Math.hypot(toAnchorX, toAnchorY) || 1;
      const nx = toAnchorX / len;
      const ny = toAnchorY / len;
      const radial = state.player.vx * nx + state.player.vy * ny;
      state.player.vx -= nx * radial * WEB_ATTACH_MOMENTUM_BLEND;
      state.player.vy -= ny * radial * WEB_ATTACH_MOMENTUM_BLEND;
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
    if (web.active && web.anchor) {
      const dx = state.player.x - web.anchor.x;
      const dy = state.player.y - web.anchor.y;
      const distance = Math.hypot(dx, dy) || 1;
      const rx = dx / distance;
      const ry = dy / distance;
      const radialSpeed = state.player.vx * rx + state.player.vy * ry;
      if (radialSpeed < 0) {
        state.player.vx += -rx * radialSpeed * WEB_RELEASE_BOOST;
        state.player.vy += -ry * radialSpeed * WEB_RELEASE_BOOST;
      }
    }
    web.active = false;
    web.anchor = null;
    web.targetAnchor = null;
    web.tip = null;
    web.shooting = false;
    web.shotTension = 0;
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
      state.player.leftWeb.targetAnchor = null;
      state.player.leftWeb.tip = null;
      state.player.leftWeb.shooting = false;
      state.player.leftWeb.shotTension = 0;
    }
    if (!hasRight) {
      state.player.rightWeb.active = false;
      state.player.rightWeb.anchor = null;
      state.player.rightWeb.targetAnchor = null;
      state.player.rightWeb.tip = null;
      state.player.rightWeb.shooting = false;
      state.player.rightWeb.shotTension = 0;
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
      if (!web.active) return;

      if (web.shooting && web.targetAnchor) {
        const tip = web.tip ?? { x: player.x, y: player.y };
        const dx = web.targetAnchor.x - tip.x;
        const dy = web.targetAnchor.y - tip.y;
        const distance = Math.hypot(dx, dy);

        if (distance <= WEB_SHOT_SPEED * dt) {
          web.tip = { ...web.targetAnchor };
          web.anchor = { ...web.targetAnchor };
          web.shooting = false;
          web.restLength = Math.hypot(web.anchor.x - player.x, web.anchor.y - player.y);
        } else {
          const nx = dx / distance;
          const ny = dy / distance;
          web.tip = {
            x: tip.x + nx * WEB_SHOT_SPEED * dt,
            y: tip.y + ny * WEB_SHOT_SPEED * dt,
          };
        }
        return;
      }

      if (!web.anchor) return;
      const dx = web.anchor.x - player.x;
      const dy = web.anchor.y - player.y;
      const distance = Math.hypot(dx, dy);

      web.restLength = Math.max(MIN_WEB_LENGTH, web.restLength - currentRetractSpeed * dt);
      web.shotTension = Math.max(0, web.shotTension - WEB_SHOT_TENSION_DECAY * dt);

      const speedFactor = Math.min(1, Math.hypot(player.vx, player.vy) / 800);
      const waveOffset = Math.sin((performance.now() / 1000) * WEB_OSCILLATION_SPEED + web.restLength * 0.01) * WEB_OSCILLATION_AMPLITUDE * (0.35 + speedFactor * 0.65);
      const effectiveRestLength = Math.max(MIN_WEB_LENGTH, web.restLength + waveOffset);

      if (distance > effectiveRestLength) {
        const stretch = distance - effectiveRestLength;
        const nx = dx / distance;
        const ny = dy / distance;

        const radialVelocity = player.vx * nx + player.vy * ny;
        const tensionAcceleration = stretch * WEB_STIFFNESS - radialVelocity * WEB_DAMPING;
        if (tensionAcceleration > 0) {
          player.vx += nx * tensionAcceleration * dt;
          player.vy += ny * tensionAcceleration * dt;
        }

        // Positional correction (Verlet style) keeps rope feel tight like Spiderdoll.
        const correction = stretch * 0.28;
        player.x += nx * correction;
        player.y += ny * correction;

        if (radialVelocity > 0) {
          player.vx -= nx * radialVelocity * 0.52;
          player.vy -= ny * radialVelocity * 0.52;
        }
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

    // Ground collision
    const groundLevel = GROUND_Y - player.radius;
    if (player.y > groundLevel) {
      player.y = groundLevel;
      if (player.vy > 140) {
        state.isGameOver = true;
        onGameOver(state.score);
        return;
      }
      player.vy = Math.min(0, player.vy * -0.2);
      player.vx *= 0.94;
    }

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
      if (Math.random() > 0.2) {
        state.obstacles.push(generateGroundObstacle(nextX - BUILDING_SPACING * 0.15 + (Math.random() * 150 - 75)));
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
      const actualY = obs.lane === 'air' ? obs.y + Math.sin(obs.offsetY) * 20 : obs.y;
      const halfW = (obs.width ?? obs.radius * 2) / 2;
      const halfH = (obs.height ?? obs.radius * 2) / 2;

      if (now > player.invulnerableUntil) {
        const hit =
          obs.lane === 'air'
            ? Math.hypot(player.x - obs.x, player.y - actualY) < player.radius + obs.radius
            : Math.abs(player.x - obs.x) < player.radius + halfW && Math.abs(player.y - (actualY - halfH)) < player.radius + halfH;
        if (hit) {
          state.lives -= 1;
          onLivesUpdate(state.lives);
          player.invulnerableUntil = now + 1500; // 1.5s invulnerability
          
          // Bounce back
          player.vx *= obs.lane === 'ground' ? -0.3 : -0.5;
          player.vy = obs.lane === 'ground' ? -120 : -220;
          
          // Break webs
          player.leftWeb.active = false;
          player.leftWeb.anchor = null;
          player.leftWeb.targetAnchor = null;
          player.leftWeb.tip = null;
          player.leftWeb.shooting = false;
          player.leftWeb.shotTension = 0;
          player.rightWeb.active = false;
          player.rightWeb.anchor = null;
          player.rightWeb.targetAnchor = null;
          player.rightWeb.tip = null;
          player.rightWeb.shooting = false;
          player.rightWeb.shotTension = 0;
          
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

    // Ground plane + lane markings
    const groundTop = GROUND_Y;
    ctx.fillStyle = '#111827';
    ctx.fillRect(state.cameraX - 400, groundTop, canvasWidth + 1200, canvasHeight * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.setLineDash([26, 18]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(state.cameraX - 300, groundTop + 36);
    ctx.lineTo(state.cameraX + canvasWidth + 900, groundTop + 36);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Obstacles
    state.obstacles.forEach(obs => {
      const actualY = obs.lane === 'air' ? obs.y + Math.sin(obs.offsetY) * 20 : obs.y;
      
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
      } else if (obs.type === 'drone') {
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
      } else if (obs.type === 'barrier') {
        const width = obs.width ?? 60;
        const height = obs.height ?? 28;
        ctx.fillStyle = '#374151';
        ctx.fillRect(-width / 2, -height, width, height);
        ctx.fillStyle = '#9ca3af';
        ctx.fillRect(-width / 2, -height, width, 4);
        for (let i = -width / 2 + 8; i < width / 2 - 4; i += 14) {
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(i, -height + 6, 6, 6);
        }
      } else {
        const width = obs.width ?? 44;
        const height = obs.height ?? 34;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(-width / 2, 0);
        ctx.lineTo(0, -height);
        ctx.lineTo(width / 2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fca5a5';
        ctx.fillRect(-2, -height * 0.72, 4, height * 0.55);
      }
      
      ctx.restore();
    });

    const colors = getCostumeColors(costume);

    // Draw Webs (curved + animated silk strands)
    const drawWeb = (web: Web, sideSeed: number) => {
      if (!web.active) return;
      const end = web.shooting ? web.tip : web.anchor;
      if (!end) return;

      const startX = state.player.x;
      const startY = state.player.y;
      const dx = end.x - startX;
      const dy = end.y - startY;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.1) return;

      const nx = -dy / distance;
      const ny = dx / distance;
      const now = performance.now() / 1000;
      const speedRatio = Math.min(1, Math.hypot(state.player.vx, state.player.vy) / 900);
      const wave = Math.sin(now * 16 + distance * 0.03 + sideSeed) * (5 + speedRatio * 8);
      const sagBase = distance * (web.shooting ? 0.07 : 0.11);
      const sag = sagBase + wave + web.shotTension * 7;

      // Blend a perpendicular bend with downward pull to get a "bow" arc like Spiderdoll.
      const downPull = web.shooting ? 0.35 : 0.62;
      const bendX = nx * (1 - downPull);
      const bendY = ny * (1 - downPull) + downPull;
      const bendLen = Math.hypot(bendX, bendY) || 1;
      const bendDirX = bendX / bendLen;
      const bendDirY = bendY / bendLen;

      const c1x = startX + dx * 0.28 + bendDirX * sag;
      const c1y = startY + dy * 0.28 + bendDirY * sag;
      const c2x = startX + dx * 0.72 + bendDirX * sag;
      const c2y = startY + dy * 0.72 + bendDirY * sag;

      const sampleCurvePoint = (t: number, offset = 0) => {
        const inv = 1 - t;
        const x =
          inv * inv * inv * startX +
          3 * inv * inv * t * (c1x + bendDirX * offset) +
          3 * inv * t * t * (c2x + bendDirX * offset) +
          t * t * t * end.x;
        const y =
          inv * inv * inv * startY +
          3 * inv * inv * t * (c1y + bendDirY * offset) +
          3 * inv * t * t * (c2y + bendDirY * offset) +
          t * t * t * end.y;
        return { x, y };
      };

      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(255,255,255,0.45)';
      ctx.shadowBlur = 8;

      for (const offset of [-2.1, 0, 2.1]) {
        ctx.beginPath();
        ctx.moveTo(startX + bendDirX * offset, startY + bendDirY * offset);
        ctx.bezierCurveTo(
          c1x + bendDirX * offset,
          c1y + bendDirY * offset,
          c2x + bendDirX * offset,
          c2y + bendDirY * offset,
          end.x,
          end.y
        );
        ctx.strokeStyle = offset === 0 ? colors.web : 'rgba(255,255,255,0.9)';
        ctx.lineWidth = offset === 0 ? 2.7 : 1.1;
        ctx.globalAlpha = offset === 0 ? 1 : 0.75;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 0.85;
      for (let t = 0.14; t < 0.92; t += 0.14) {
        const a = sampleCurvePoint(t, -2.1);
        const b = sampleCurvePoint(t, 2.1);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(end.x, end.y, web.shooting ? 2.8 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = colors.web;
      ctx.fill();

      if (!web.shooting) {
        ctx.globalAlpha = 0.35 + web.shotTension * 0.25;
        ctx.beginPath();
        ctx.arc(end.x, end.y, 11 + web.shotTension * 7, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(end.x, end.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    drawWeb(state.player.leftWeb, -0.6);
    drawWeb(state.player.rightWeb, 0.6);

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
      
      const armTarget = web.shooting ? web.tip : web.anchor;
      if (web.active && armTarget) {
        const dx = armTarget.x - shoulderX;
        const dy = armTarget.y - shoulderY;
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
