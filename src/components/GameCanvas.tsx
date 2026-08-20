import React, { useEffect, useRef } from 'react';
import { GameState, Building, Point, CostumeId, Obstacle } from '../types';

const PIXELS_PER_METER = 35;
const GRAVITY = 9.81 * PIXELS_PER_METER;
const AIR_DRAG_PER_SECOND = 0.22;
const FIXED_TIMESTEP = 1 / 120;
const MAX_FRAME_DELTA = 1 / 30;
const BUILDING_SPACING = 300;
const ABYSS_Y = 2000;
const GROUND_Y = ABYSS_Y - 40;
const BASE_RUN_SPEED = 420;
const JUMP_VELOCITY = -620;
const JUMP_BUFFER_MS = 150;
const WEB_SHOT_SPEED = 1500;
const WEB_RANGE_MIN = 160;
const WEB_RANGE_MAX = 620;
const WEB_SPRING_STIFFNESS = 28;
const WEB_DAMPING = 6;
const WEB_RETRACT_PER_SECOND = 26;
const WEB_TANGENTIAL_PUSH = 90;

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
  const jumpBufferUntilRef = useRef(0);
  const stateRef = useRef<GameState>({
    player: {
      x: 0,
      y: GROUND_Y - 15,
      vx: BASE_RUN_SPEED,
      vy: 0,
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
        if (Math.random() > 0.25) {
          initialObstacles.push(generateGroundObstacle(bX + BUILDING_SPACING * 0.62));
        }
      }
    }
    stateRef.current.buildings = initialBuildings;
    stateRef.current.obstacles = initialObstacles;
  }, []);

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

  const queueJump = () => {
    jumpBufferUntilRef.current = Date.now() + JUMP_BUFFER_MS;
  };

  const getWorldPointer = (event: MouseEvent) => {
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas) {
      return { x: state.player.x + 260, y: state.player.y - 220 };
    }
    const rect = canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    return {
      x: localX + state.cameraX,
      y: localY + state.cameraY,
    };
  };

  const getNearestAnchor = (aimPoint: Point, playerX: number) => {
    const state = stateRef.current;
    let bestAnchor: Point | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const building of state.buildings) {
      const roofY = building.y + 12;
      const candidates: Point[] = [
        { x: building.x + 12, y: roofY },
        { x: building.x + building.width * 0.32, y: roofY - 10 },
        { x: building.x + building.width * 0.68, y: roofY - 8 },
        { x: building.x + building.width - 12, y: roofY },
      ];

      for (const candidate of candidates) {
        const dx = candidate.x - playerX;
        const dist = Math.hypot(aimPoint.x - candidate.x, aimPoint.y - candidate.y);
        const playerDist = Math.hypot(candidate.x - playerX, candidate.y - state.player.y);
        if (playerDist < WEB_RANGE_MIN || playerDist > WEB_RANGE_MAX) continue;
        const rearAnchorPenalty = dx < 0 && aimPoint.x >= playerX ? Math.abs(dx) * 0.8 : 0;
        const score = dist + rearAnchorPenalty;
        if (score < bestScore) {
          bestScore = score;
          bestAnchor = candidate;
        }
      }
    }

    return bestAnchor;
  };

  const shootWeb = (webKey: 'leftWeb' | 'rightWeb', targetHint?: Point) => {
    const state = stateRef.current;
    const player = state.player;
    const web = player[webKey];
    const fallbackTarget = {
      x: player.x + 260,
      y: player.y - 220,
    };
    const aimPoint = targetHint ?? fallbackTarget;
    const anchor = getNearestAnchor(aimPoint, player.x);
    if (!anchor) return;

    const shoulderOffset = webKey === 'leftWeb' ? -8 : 8;
    web.active = false;
    web.shooting = true;
    web.shotTension = 0;
    web.anchor = null;
    web.targetAnchor = anchor;
    web.tip = { x: player.x, y: player.y + shoulderOffset };
  };

  const releaseWeb = (webKey: 'leftWeb' | 'rightWeb') => {
    const web = stateRef.current.player[webKey];
    web.active = false;
    web.shooting = false;
    web.anchor = null;
    web.targetAnchor = null;
    web.tip = null;
    web.shotTension = 0;
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        queueJump();
      }
      if (e.code === 'KeyQ') {
        e.preventDefault();
        shootWeb('leftWeb');
      }
      if (e.code === 'KeyE') {
        e.preventDefault();
        shootWeb('rightWeb');
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyQ') {
        releaseWeb('leftWeb');
      }
      if (e.code === 'KeyE') {
        releaseWeb('rightWeb');
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      stateRef.current.pointer = getWorldPointer(e);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        shootWeb('leftWeb', getWorldPointer(e));
      }
      if (e.button === 2) {
        shootWeb('rightWeb', getWorldPointer(e));
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        releaseWeb('leftWeb');
      }
      if (e.button === 2) {
        releaseWeb('rightWeb');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
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

    const drag = Math.exp(-AIR_DRAG_PER_SECOND * dt);
    player.vx *= drag;
    player.vy *= drag;
    const targetRunSpeed = BASE_RUN_SPEED + Math.min(260, state.score * 0.6);
    const hasRearAnchor =
      (player.leftWeb.active && player.leftWeb.anchor && player.leftWeb.anchor.x < player.x - player.radius) ||
      (player.rightWeb.active && player.rightWeb.anchor && player.rightWeb.anchor.x < player.x - player.radius);
    const runAssist = hasRearAnchor ? 0.02 : 0.1;
    if (!(hasRearAnchor && player.vx < 0)) {
      player.vx += (targetRunSpeed - player.vx) * runAssist;
    }

    const applyWebPhysics = (webKey: 'leftWeb' | 'rightWeb') => {
      const web = player[webKey];
      if (web.shooting && web.tip && web.targetAnchor) {
        const toTargetX = web.targetAnchor.x - web.tip.x;
        const toTargetY = web.targetAnchor.y - web.tip.y;
        const distance = Math.hypot(toTargetX, toTargetY);
        if (distance < WEB_SHOT_SPEED * dt) {
          web.tip = { ...web.targetAnchor };
          web.anchor = { ...web.targetAnchor };
          web.active = true;
          web.shooting = false;
          web.targetAnchor = null;
          web.shotTension = 1;
          web.restLength = Math.max(80, Math.hypot(player.x - web.anchor.x, player.y - web.anchor.y) * 0.88);
        } else if (distance > 0.0001) {
          const travel = WEB_SHOT_SPEED * dt;
          web.tip.x += (toTargetX / distance) * travel;
          web.tip.y += (toTargetY / distance) * travel;
          web.shotTension = Math.min(1, web.shotTension + dt * 2);
        }
      }

      if (!web.active || !web.anchor) return;
      const dx = web.anchor.x - player.x;
      const dy = web.anchor.y - player.y;
      const dist = Math.hypot(dx, dy);
      web.restLength = Math.max(70, web.restLength - WEB_RETRACT_PER_SECOND * dt);
      if (dist <= web.restLength || dist < 0.0001) {
        web.shotTension = Math.max(0, web.shotTension - dt * 0.9);
        return;
      }

      const nx = dx / dist;
      const ny = dy / dist;
      const stretch = dist - web.restLength;
      const radialSpeed = player.vx * nx + player.vy * ny;
      const springForce = stretch * WEB_SPRING_STIFFNESS;
      const dampingForce = radialSpeed * WEB_DAMPING;
      const pull = springForce - dampingForce;

      player.vx += nx * pull * dt;
      player.vy += ny * pull * dt;
      player.vx += -ny * WEB_TANGENTIAL_PUSH * dt;
      web.shotTension = Math.min(1, 0.45 + stretch / 180);
    };

    applyWebPhysics('leftWeb');
    applyWebPhysics('rightWeb');

    // Update Position
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // Ground collision
    const groundLevel = GROUND_Y - player.radius;
    const canJump = player.y >= groundLevel - 2;
    if (jumpBufferUntilRef.current > Date.now() && canJump) {
      player.vy = JUMP_VELOCITY;
      jumpBufferUntilRef.current = 0;
    }
    if (player.y > groundLevel) {
      player.y = groundLevel;
      player.vy = 0;
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
      const actualY = obs.y;
      const halfW = (obs.width ?? obs.radius * 2) / 2;
      const halfH = (obs.height ?? obs.radius * 2) / 2;

      if (now > player.invulnerableUntil) {
        const hit = Math.abs(player.x - obs.x) < player.radius + halfW && Math.abs(player.y - (actualY - halfH)) < player.radius + halfH;
        if (hit) {
          state.lives -= 1;
          onLivesUpdate(state.lives);
          player.invulnerableUntil = now + 1500; // 1.5s invulnerability
          
          // Bounce back
          player.vx *= -0.2;
          player.vy = -220;
          
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

    // Arms in running pose
    const drawArm = (offsetY: number) => {
      ctx.strokeStyle = colors.primary;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      // Start from shoulder roughly
      const shoulderX = p.x + Math.cos(velocityAngle) * 5 - Math.sin(velocityAngle) * offsetY;
      const shoulderY = p.y + Math.sin(velocityAngle) * 5 + Math.cos(velocityAngle) * offsetY;
      ctx.moveTo(shoulderX, shoulderY);
      
      const runCycle = Math.sin(performance.now() / 110);
      const trailAngle = velocityAngle + Math.PI + (offsetY > 0 ? 0.5 : -0.5) + runCycle * 0.2;
      ctx.lineTo(shoulderX + Math.cos(trailAngle) * 15, shoulderY + Math.sin(trailAngle) * 15);
      ctx.stroke();
    };

    drawArm(-6); // Left arm
    drawArm(6); // Right arm

    const drawWeb = (web: typeof p.leftWeb, offsetY: number) => {
      if (!web.anchor && !web.tip && !web.targetAnchor) return;
      const shoulderX = p.x + Math.cos(velocityAngle) * 5 - Math.sin(velocityAngle) * offsetY;
      const shoulderY = p.y + Math.sin(velocityAngle) * 5 + Math.cos(velocityAngle) * offsetY;
      const end = web.active
        ? web.anchor
        : web.shooting
          ? web.tip
          : web.targetAnchor;
      if (!end) return;

      const tension = Math.min(1, Math.max(0.15, web.shotTension));
      const dx = end.x - shoulderX;
      const dy = end.y - shoulderY;
      const perpX = -dy;
      const perpY = dx;
      const perpLen = Math.max(1, Math.hypot(perpX, perpY));
      const sag = web.active ? Math.min(18, Math.hypot(dx, dy) * 0.06) * (1 - tension) : 0;
      const cpX = shoulderX + dx * 0.5 + (perpX / perpLen) * sag;
      const cpY = shoulderY + dy * 0.5 + (perpY / perpLen) * sag;

      ctx.lineWidth = 1 + tension * 1.6;
      ctx.strokeStyle = `rgba(240, 244, 255, ${0.55 + tension * 0.45})`;
      ctx.beginPath();
      ctx.moveTo(shoulderX, shoulderY);
      ctx.quadraticCurveTo(cpX, cpY, end.x, end.y);
      ctx.stroke();

      if (web.active && web.anchor) {
        ctx.fillStyle = 'rgba(248,250,252,0.75)';
        ctx.beginPath();
        ctx.arc(web.anchor.x, web.anchor.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    drawWeb(p.leftWeb, -6);
    drawWeb(p.rightWeb, 6);

    ctx.restore();
    ctx.globalAlpha = 1.0; // Reset alpha after player draw

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
        onTouchStart={(e) => {
          if (e.cancelable) e.preventDefault();
          queueJump();
        }}
        onContextMenu={(e) => e.preventDefault()}
        className="block cursor-none touch-none select-none"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      />
    </div>
  );
};
