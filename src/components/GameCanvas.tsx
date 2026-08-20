import React, { useEffect, useRef } from 'react';
import { GameState, Building, Point, CostumeId, Web } from '../types';

const GAME_SPEED = 0.85; // Run physics at 85% speed for a slightly slower game
const GRAVITY = 0.6;
const AIR_FRICTION = 0.995;
const RETRACT_SPEED = 4; // Base retract speed
const DUAL_RETRACT_MULTIPLIER = 2.5; // Stronger pull when both webs are active
const BUILDING_SPACING = 300;
const ABYSS_Y = 2000;
const GROUND_Y = ABYSS_Y;

interface GameCanvasProps {
  costume: CostumeId;
  onGameOver: (score: number) => void;
  onScoreUpdate: (score: number) => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ costume, onGameOver, onScoreUpdate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);
  const shotTimestampsRef = useRef<number[]>([]);
  const stateRef = useRef<GameState>({
    player: {
      x: 0,
      y: ABYSS_Y - 600,
      vx: 25 * GAME_SPEED,
      vy: -15 * GAME_SPEED,
      radius: 15,
      rotation: 0,
      leftWeb: { active: false, anchor: null, restLength: 0 },
      rightWeb: { active: false, anchor: null, restLength: 0 },
    },
    buildings: [],
    score: 0,
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

  // Initialize buildings
  useEffect(() => {
    const initialBuildings: Building[] = [];
    for (let i = -1; i < 10; i++) {
      initialBuildings.push(generateBuilding(i * BUILDING_SPACING));
    }
    stateRef.current.buildings = initialBuildings;
  }, []);

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
    
    return {
      x,
      y: ABYSS_Y - height,
      width,
      height,
      color: colorPair.main,
      darkColor: colorPair.dark,
      hasAntenna: Math.random() > 0.6,
      antennaX: width * 0.2 + Math.random() * (width * 0.6),
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
    const now = Date.now();
    shotTimestampsRef.current = shotTimestampsRef.current.filter(t => now - t < 1000);
    
    if (shotTimestampsRef.current.length >= 2) {
      return; // Rate limit exceeded: max 2 webs per second
    }

    shotTimestampsRef.current.push(now);

    const state = stateRef.current;
    const worldX = pos.x + state.cameraX;
    const worldY = pos.y + state.cameraY;

    let bestAnchor: Point | null = null;

    for (const b of state.buildings) {
      if (worldX >= b.x && worldX <= b.x + b.width) {
        if (worldY >= b.y) {
          bestAnchor = { x: worldX, y: worldY };
        } else {
          bestAnchor = { x: worldX, y: b.y };
        }
        break;
      }
    }

    if (!bestAnchor) {
      let minDistance = Infinity;
      state.buildings.forEach(b => {
        const corners = [
          { x: b.x, y: b.y },
          { x: b.x + b.width, y: b.y }
        ];
        corners.forEach(c => {
          const dist = Math.hypot(c.x - worldX, c.y - worldY);
          if (dist < minDistance && c.x > state.player.x - 300) {
            minDistance = dist;
            bestAnchor = c;
          }
        });
      });
    }

    if (bestAnchor) {
      web.active = true;
      web.anchor = bestAnchor;
      web.restLength = Math.hypot(bestAnchor.x - state.player.x, bestAnchor.y - state.player.y);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (stateRef.current.isGameOver) return;
    const isRightClick = e.button === 2;
    const pos = getPointerPos(e.clientX, e.clientY);
    stateRef.current.pointer = pos;
    const web = isRightClick ? stateRef.current.player.rightWeb : stateRef.current.player.leftWeb;
    fireWeb(web, pos);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const isRightClick = e.button === 2;
    const web = isRightClick ? stateRef.current.player.rightWeb : stateRef.current.player.leftWeb;
    web.active = false;
    web.anchor = null;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (stateRef.current.isGameOver) return;
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
    if (e.touches.length > 0) {
      stateRef.current.pointer = getPointerPos(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
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

  const update = () => {
    const state = stateRef.current;
    if (state.isGameOver) return;
    
    const canvas = canvasRef.current;
    const canvasWidth = canvas ? canvas.width : 1000;
    const canvasHeight = canvas ? canvas.height : 600;

    const player = state.player;

    // Apply Gravity
    player.vy += GRAVITY * GAME_SPEED;

    const bothActive = player.leftWeb.active && player.rightWeb.active;
    const currentRetractSpeed = (bothActive ? RETRACT_SPEED * DUAL_RETRACT_MULTIPLIER : RETRACT_SPEED) * GAME_SPEED;

    const applyWeb = (web: Web) => {
      if (!web.active || !web.anchor) return;
      const dx = web.anchor.x - player.x;
      const dy = web.anchor.y - player.y;
      const distance = Math.hypot(dx, dy);

      if (web.restLength > 80) {
        web.restLength -= currentRetractSpeed;
      }

      if (distance > web.restLength) {
        const diff = distance - web.restLength;
        const nx = dx / distance;
        const ny = dy / distance;

        player.x += nx * diff;
        player.y += ny * diff;

        const dot = player.vx * nx + player.vy * ny;
        if (dot < 0) {
          player.vx -= dot * nx;
          player.vy -= dot * ny;
        }
      }
    };

    // Apply constraints sequentially (multiple iterations for stability if both active)
    for (let i = 0; i < 3; i++) {
      applyWeb(player.leftWeb);
      applyWeb(player.rightWeb);
    }

    // Apply Air Friction
    player.vx *= AIR_FRICTION;
    player.vy *= AIR_FRICTION;

    // Update Position
    player.x += player.vx * GAME_SPEED;
    player.y += player.vy * GAME_SPEED;

    // Keep the player on the ground instead of falling endlessly.
    if (player.y + player.radius > GROUND_Y) {
      player.y = GROUND_Y - player.radius;
      if (player.vy > 0) player.vy = 0;
      player.vx *= 0.92;
    }

    // Smooth Camera Follow
    const targetCamX = player.x - canvasWidth * 0.35;
    const targetCamY = player.y - canvasHeight * 0.5;
    state.cameraX += (targetCamX - state.cameraX) * 0.1 * GAME_SPEED;
    state.cameraY += (targetCamY - state.cameraY) * 0.1 * GAME_SPEED;

    // Clamp Camera Y so we don't see infinitely below ground
    const maxCamY = ABYSS_Y - canvasHeight + 200;
    if (state.cameraY > maxCamY) state.cameraY = maxCamY;

    // Generate new buildings
    const lastBuilding = state.buildings[state.buildings.length - 1];
    if (lastBuilding.x - state.cameraX < canvasWidth + 500) {
      state.buildings.push(generateBuilding(lastBuilding.x + BUILDING_SPACING + Math.random() * 200));
    }

    // Remove old buildings
    if (state.buildings[0].x - state.cameraX < -1000) {
      state.buildings.shift();
    }

    // Score based on distance
    const newScore = Math.floor(player.x / 50);
    if (newScore > state.score) {
      state.score = newScore;
      onScoreUpdate(state.score);
    }

    // Game over conditions
    if (player.y > GROUND_Y + canvasHeight) {
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
      for (let wx = b.x + 15; wx < b.x + b.width - 15; wx += 30) {
        const startY = Math.max(b.y + 20, state.cameraY - 50);
        const endY = Math.min(b.y + canvasHeight * 3, state.cameraY + canvasHeight + 50);
        const gridOffset = startY % 40;
        for (let wy = startY - gridOffset; wy < endY; wy += 40) {
          if (wy < b.y + 20) continue;
          const pseudoRandom = Math.abs(Math.sin(wx * 12.9898 + wy * 78.233) * 43758.5453) % 1;
          if (pseudoRandom > 0.4) {
            ctx.fillRect(wx, wy, 12, 20);
          }
        }
      }
    });

    // Draw Ground
    const groundGradient = ctx.createLinearGradient(0, GROUND_Y - 40, 0, GROUND_Y + 220);
    groundGradient.addColorStop(0, '#334155');
    groundGradient.addColorStop(1, '#020617');
    ctx.fillStyle = groundGradient;
    ctx.fillRect(state.cameraX - 100, GROUND_Y, canvasWidth + 200, 260);

    ctx.fillStyle = '#475569';
    ctx.fillRect(state.cameraX - 100, GROUND_Y, canvasWidth + 200, 12);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 2;
    for (let gx = Math.floor((state.cameraX - 100) / 80) * 80; gx < state.cameraX + canvasWidth + 100; gx += 80) {
      ctx.beginPath();
      ctx.moveTo(gx, GROUND_Y + 12);
      ctx.lineTo(gx + 40, GROUND_Y + 260);
      ctx.stroke();
    }

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
        ctx.shadowBlur = 10;
        ctx.shadowColor = colors.web;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };
    drawWeb(state.player.leftWeb);
    drawWeb(state.player.rightWeb);

    // Draw Player
    const p = state.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    
    // Rotation based on velocity
    const velocityAngle = Math.atan2(p.vy, p.vx);
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

    // Draw Crosshair (Aiming indicator)
    if (!state.isGameOver) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(state.pointer.x, state.pointer.y, 10, 0, Math.PI * 2);
      ctx.moveTo(state.pointer.x - 15, state.pointer.y);
      ctx.lineTo(state.pointer.x + 15, state.pointer.y);
      ctx.moveTo(state.pointer.x, state.pointer.y - 15);
      ctx.lineTo(state.pointer.x, state.pointer.y + 15);
      ctx.stroke();
    }
  };

  const loop = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      update();
      draw(ctx);
    }
    requestRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
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
        className="block cursor-none"
      />
    </div>
  );
};

