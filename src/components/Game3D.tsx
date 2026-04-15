import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky, Environment, Box, Sphere, Trail } from '@react-three/drei';
import * as THREE from 'three';
import { CostumeId } from '../types';

interface Game3DProps {
  costume: CostumeId;
  onGameOver: (score: number) => void;
  onScoreUpdate?: (score: number) => void;
}

const GRAVITY = new THREE.Vector3(0, -85, 0);
const RETRACT_SPEED = 80;
const FORWARD_FORCE = 36;
const MAX_VELOCITY = 180;
const AIR_DRAG = 0.035;
const LINEAR_DAMPING = 0.12;
const CONSTRAINT_DAMPING = 0.08;
const CONSTRAINT_STIFFNESS = 0.6;
const WEB_MIN_LENGTH = 32;
const WEB_MAX_LENGTH = 420;
const WEB_ATTACH_BOOST = 1.08;
const DUAL_WEB_STABILITY = 0.92;
const PHYSICS_SUBSTEP = 1 / 120;
const MAX_FRAME_TIME = 0.05;
const GLIDE_DURATION = 0.8;
const GLIDE_GRAVITY_REDUCTION = 0.35;
const BUILDING_SPACING = 80;
const BUILDING_WIDTH = 40;
const BUILDING_DEPTH_BONUS = 45;
const WALKABLE_BUILDING_CHANCE = 0.45;
const PLAYER_RADIUS = 2;
const ROOF_SNAP_TOLERANCE = 16;

const getCostumeColors = (id: CostumeId) => {
  switch (id) {
    case 'symbiote': return { primary: '#111111', secondary: '#ffffff', web: '#ffffff', eye: '#ffffff' };
    case 'miles': return { primary: '#111111', secondary: '#ef4444', web: '#ef4444', eye: '#ffffff' };
    case 'gwen': return { primary: '#ffffff', secondary: '#ec4899', web: '#06b6d4', eye: '#ec4899' };
    case 'iron': return { primary: '#dc2626', secondary: '#fbbf24', web: '#fbbf24', eye: '#60a5fa' };
    case '2099': return { primary: '#1e3a8a', secondary: '#dc2626', web: '#dc2626', eye: '#dc2626' };
    case 'noir': return { primary: '#171717', secondary: '#404040', web: '#a3a3a3', eye: '#ffffff' };
    default: return { primary: '#dc2626', secondary: '#2563eb', web: '#ffffff', eye: '#ffffff' };
  }
};

interface BuildingData {
  id: number;
  position: THREE.Vector3;
  size: THREE.Vector3;
  color: string;
  walkable: boolean;
}

const generateBuilding = (z: number, id: number, isLeft: boolean): BuildingData => {
  const x = isLeft ? -30 - Math.random() * 40 : 30 + Math.random() * 40;
  const height = 150 + Math.random() * 200;
  const width = BUILDING_WIDTH + Math.random() * 20;
  const extraDepth = Math.random() < WALKABLE_BUILDING_CHANCE ? BUILDING_DEPTH_BONUS + Math.random() * 55 : 0;
  const depth = BUILDING_WIDTH + Math.random() * 20 + extraDepth;
  
  const colors = ['#0f172a', '#1e293b', '#334155', '#020617'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  return {
    id,
    position: new THREE.Vector3(x, height / 2, z),
    size: new THREE.Vector3(width, height, depth),
    color,
    walkable: extraDepth > 0
  };
};

const Player = ({ costume, onGameOver, onScoreUpdate, buildingsRef }: { costume: CostumeId, onGameOver: (score: number) => void, onScoreUpdate?: (score: number) => void, buildingsRef: React.MutableRefObject<BuildingData[]> }) => {
  const { camera } = useThree();
  const playerRef = useRef<THREE.Group>(null);
  
  const state = useRef({
    pos: new THREE.Vector3(0, 150, 0),
    vel: new THREE.Vector3(0, 0, -80),
    leftWeb: { active: false, anchor: new THREE.Vector3(), restLength: 0 },
    rightWeb: { active: false, anchor: new THREE.Vector3(), restLength: 0 },
    glideTimer: 0,
    glideLift: 0,
    score: 0,
    isGameOver: false,
    accumulator: 0
  });

  const colors = useMemo(() => getCostumeColors(costume), [costume]);

  const handlePointerDown = (e: PointerEvent) => {
    if (state.current.isGameOver) return;
    const x = e.clientX;
    const isLeft = x < window.innerWidth / 2;
    
    let bestBuilding: BuildingData | null = null;
    let minDistance = Infinity;
    
    for (const b of buildingsRef.current) {
      if (isLeft && b.position.x > 0) continue;
      if (!isLeft && b.position.x < 0) continue;
      
      // Look for buildings ahead
      if (b.position.z > state.current.pos.z) continue;
      
      const dist = state.current.pos.distanceTo(b.position);
      if (dist < minDistance && dist < 400) {
        minDistance = dist;
        bestBuilding = b;
      }
    }
    
    if (bestBuilding) {
      const web = isLeft ? state.current.leftWeb : state.current.rightWeb;
      web.active = true;
      // Anchor to the top inner corner of the building
      const anchorX = bestBuilding.position.x + (isLeft ? bestBuilding.size.x/2 : -bestBuilding.size.x/2);
      web.anchor.set(anchorX, bestBuilding.size.y, bestBuilding.position.z);
      const initialLength = state.current.pos.distanceTo(web.anchor);
      web.restLength = THREE.MathUtils.clamp(initialLength * 0.88, WEB_MIN_LENGTH, WEB_MAX_LENGTH);

      // Preserve existing momentum and add a small catch boost toward the new anchor.
      const toAnchor = new THREE.Vector3().subVectors(web.anchor, state.current.pos).normalize();
      const tangentVelocity = state.current.vel.clone().projectOnPlane(toAnchor);
      const incomingSpeed = Math.max(0, state.current.vel.dot(toAnchor));
      state.current.vel.copy(tangentVelocity.addScaledVector(toAnchor, incomingSpeed * WEB_ATTACH_BOOST));
    }
  };

  const handlePointerUp = (e: PointerEvent) => {
    const s = state.current;
    const x = e.clientX;
    const isLeft = x < window.innerWidth / 2;
    const releasedWeb = isLeft ? s.leftWeb : s.rightWeb;
    if (!releasedWeb.active) return;

    const ropeDir = new THREE.Vector3().subVectors(s.pos, releasedWeb.anchor).normalize();
    const tangentVelocity = s.vel.clone().projectOnPlane(ropeDir);

    if (tangentVelocity.lengthSq() > 0.0001) {
      const tangentDir = tangentVelocity.normalize();
      const speed = s.vel.length();
      const upwardFactor = THREE.MathUtils.clamp((tangentDir.y + 0.1) / 1.1, 0, 1);
      const forwardFactor = THREE.MathUtils.clamp(-tangentDir.z, 0, 1);
      const diveFactor = THREE.MathUtils.clamp(-tangentDir.y, 0, 1);

      // Release angle controls launch and glide feel.
      const launchBoost = speed * (0.08 + 0.18 * forwardFactor);
      s.vel.addScaledVector(tangentDir, launchBoost);
      s.vel.y += speed * (0.08 * upwardFactor - 0.04 * diveFactor);

      s.glideTimer = GLIDE_DURATION * (0.55 + 0.45 * forwardFactor);
      s.glideLift = 14 * upwardFactor + 6 * forwardFactor;
    }

    releasedWeb.active = false;
  };

  useEffect(() => {
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  useFrame((_, delta) => {
    const s = state.current;
    if (s.isGameOver) return;

    const frameDt = Math.min(delta, MAX_FRAME_TIME);
    s.accumulator = Math.min(s.accumulator + frameDt, 0.2);

    const solveWebConstraint = (web: typeof s.leftWeb, dt: number) => {
      if (!web.active) return;

      web.restLength = Math.max(WEB_MIN_LENGTH, web.restLength - RETRACT_SPEED * dt);
      const rope = new THREE.Vector3().subVectors(s.pos, web.anchor);
      const distance = rope.length();
      if (distance < 0.0001) return;

      if (distance <= web.restLength) return;

      const dir = rope.multiplyScalar(1 / distance);
      const excess = distance - web.restLength;

      // Position based correction keeps the rope numerically stable at high speed.
      s.pos.addScaledVector(dir, -excess * CONSTRAINT_STIFFNESS);

      // Remove outward radial velocity while keeping tangential motion.
      const radialSpeed = s.vel.dot(dir);
      if (radialSpeed > 0) {
        s.vel.addScaledVector(dir, -radialSpeed * (1 + CONSTRAINT_DAMPING));
      }
    };

    while (s.accumulator >= PHYSICS_SUBSTEP) {
      const dt = PHYSICS_SUBSTEP;
      s.accumulator -= dt;

      if (s.glideTimer > 0) {
        const glideBlend = THREE.MathUtils.clamp(s.glideTimer / GLIDE_DURATION, 0, 1);
        s.vel.addScaledVector(GRAVITY, dt * (1 - GLIDE_GRAVITY_REDUCTION * glideBlend));
        s.vel.y += s.glideLift * glideBlend * dt;
        s.glideTimer = Math.max(0, s.glideTimer - dt);
      } else {
        s.vel.addScaledVector(GRAVITY, dt);
      }
      s.vel.z -= FORWARD_FORCE * dt;

      const air = Math.exp(-AIR_DRAG * dt);
      const linear = Math.exp(-LINEAR_DAMPING * dt);
      s.vel.multiplyScalar(air * linear);

      s.pos.addScaledVector(s.vel, dt);

      // Allow landing/running across selected rooftops to create parkour moments.
      for (const building of buildingsRef.current) {
        if (!building.walkable) continue;

        const halfWidth = building.size.x / 2;
        const halfDepth = building.size.z / 2;
        const topY = building.size.y;

        const isWithinX = Math.abs(s.pos.x - building.position.x) <= halfWidth + PLAYER_RADIUS;
        const isWithinZ = Math.abs(s.pos.z - building.position.z) <= halfDepth + PLAYER_RADIUS;
        const isNearRoof = s.pos.y <= topY + PLAYER_RADIUS && s.pos.y >= topY - ROOF_SNAP_TOLERANCE;

        if (isWithinX && isWithinZ && isNearRoof && s.vel.y <= 0) {
          s.pos.y = topY + PLAYER_RADIUS;
          s.vel.y = 0;
          break;
        }
      }

      // Multiple iterations avoid post-shot instability and rope stretch jitter.
      for (let i = 0; i < 3; i++) {
        solveWebConstraint(s.leftWeb, dt);
        solveWebConstraint(s.rightWeb, dt);
      }

      const activeWebCount = Number(s.leftWeb.active) + Number(s.rightWeb.active);
      if (activeWebCount === 2) {
        s.vel.y *= DUAL_WEB_STABILITY;
      }

      if (s.vel.length() > MAX_VELOCITY) {
        s.vel.setLength(MAX_VELOCITY);
      }
    }

    // Update player mesh
    if (playerRef.current) {
      playerRef.current.position.copy(s.pos);
      
      // Smooth rotation towards velocity
      if (s.vel.lengthSq() > 0.0001) {
        const targetRotation = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, -1),
          s.vel.clone().normalize()
        );
        playerRef.current.quaternion.slerp(targetRotation, 0.1);
      }
    }

    // Update camera (follow player smoothly)
    const targetCamPos = s.pos.clone().add(new THREE.Vector3(0, 15, 40));
    camera.position.lerp(targetCamPos, 0.1);
    
    const lookAtTarget = s.pos.clone().add(new THREE.Vector3(0, 0, -40));
    camera.lookAt(lookAtTarget);

    // Score
    const currentScore = Math.floor(-s.pos.z / 10);
    if (currentScore > s.score) {
      s.score = currentScore;
      if (onScoreUpdate) onScoreUpdate(s.score);
      // Dispatch custom event for UI score update
      window.dispatchEvent(new CustomEvent('updateScore', { detail: s.score }));
    }

    // Game Over (hit the ground)
    if (s.pos.y < 5) {
      s.isGameOver = true;
      onGameOver(s.score);
    }
  });

  return (
    <group>
      <group ref={playerRef}>
        <Sphere args={[2, 16, 16]}>
          <meshStandardMaterial color={colors.primary} />
        </Sphere>
        {/* Trail effect */}
        <Trail width={2} length={10} color={colors.secondary} attenuation={(t) => t * t}>
          <mesh position={[0, 0, 0]} />
        </Trail>
      </group>
      {/* Web Lines */}
      {state.current.leftWeb.active && (
        <WebLine startPos={state.current.pos} endPos={state.current.leftWeb.anchor} color={colors.web} />
      )}
      {state.current.rightWeb.active && (
        <WebLine startPos={state.current.pos} endPos={state.current.rightWeb.anchor} color={colors.web} />
      )}
    </group>
  );
};

const WebLine = ({ startPos, endPos, color }: { startPos: THREE.Vector3, endPos: THREE.Vector3, color: string }) => {
  const coreRef = useRef<any>(null);
  const glowRef = useRef<any>(null);
  const supportRef = useRef<any>(null);
  const SEGMENTS = 24;

  useFrame(({ clock }) => {
    const updateLine = (lineRef: React.RefObject<any>, sagFactor: number, sideOffset: number) => {
      if (!lineRef.current) return;
      const positions = lineRef.current.geometry.attributes.position.array as Float32Array;
      const temp = new THREE.Vector3();

      for (let i = 0; i <= SEGMENTS; i++) {
        const t = i / SEGMENTS;
        temp.lerpVectors(startPos, endPos, t);
        const arc = Math.sin(t * Math.PI) * sagFactor;
        temp.y -= arc;
        temp.x += sideOffset * Math.sin(t * Math.PI);

        const idx = i * 3;
        positions[idx] = temp.x;
        positions[idx + 1] = temp.y;
        positions[idx + 2] = temp.z;
      }

      lineRef.current.geometry.attributes.position.needsUpdate = true;
    };

    updateLine(coreRef, 5, 0);
    updateLine(glowRef, 8, 0.8);
    updateLine(supportRef, 8, -0.8);

    const pulse = 0.55 + Math.sin(clock.elapsedTime * 12) * 0.15;
    if (glowRef.current?.material) {
      glowRef.current.material.opacity = pulse;
    }
  });

  const lineArray = useMemo(() => new Float32Array((SEGMENTS + 1) * 3), []);

  return (
    <group>
      <line ref={glowRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={SEGMENTS + 1} array={lineArray.slice()} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.55} />
      </line>
      <line ref={supportRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={SEGMENTS + 1} array={lineArray.slice()} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.35} />
      </line>
      <line ref={coreRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={SEGMENTS + 1} array={lineArray.slice()} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.95} />
      </line>
      <Sphere args={[0.9, 12, 12]} position={[endPos.x, endPos.y, endPos.z]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.3} />
      </Sphere>
    </group>
  );
};

const City = ({ buildingsRef }: { buildingsRef: React.MutableRefObject<BuildingData[]> }) => {
  const { camera } = useThree();
  const [buildings, setBuildings] = useState<BuildingData[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const initial: BuildingData[] = [];
    for (let i = -10; i < 40; i++) {
      initial.push(generateBuilding(-i * BUILDING_SPACING, nextId.current++, true)); // Left
      initial.push(generateBuilding(-i * BUILDING_SPACING, nextId.current++, false)); // Right
    }
    buildingsRef.current = initial;
    setBuildings([...initial]);
  }, []);

  useFrame(() => {
    let changed = false;
    const currentBuildings = buildingsRef.current;
    
    // Remove buildings far behind camera
    while (currentBuildings.length > 0 && currentBuildings[0].position.z > camera.position.z + 100) {
      currentBuildings.shift();
      changed = true;
    }

    // Add new buildings ahead
    const lastZ = currentBuildings.length > 0 ? currentBuildings[currentBuildings.length - 1].position.z : camera.position.z;
    if (lastZ > camera.position.z - 2000) {
      currentBuildings.push(generateBuilding(lastZ - BUILDING_SPACING, nextId.current++, true));
      currentBuildings.push(generateBuilding(lastZ - BUILDING_SPACING, nextId.current++, false));
      changed = true;
    }

    if (changed) {
      // Trigger re-render of buildings
      setBuildings([...currentBuildings]);
    }
  });

  return (
    <group>
      {buildings.map(b => (
        <group key={b.id}>
          <Box position={b.position} args={[b.size.x, b.size.y, b.size.z]}>
            <meshStandardMaterial color={b.color} roughness={0.9} metalness={0.1} />
            {/* Simple Windows */}
            <edgesGeometry attach="geometry" />
            <lineBasicMaterial attach="material" color="#334155" linewidth={1} opacity={0.2} transparent />
          </Box>
          {b.walkable && (
            <mesh position={[b.position.x, b.size.y + 0.08, b.position.z]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[b.size.x * 0.92, b.size.z * 0.92]} />
              <meshStandardMaterial color="#1d4ed8" emissive="#2563eb" emissiveIntensity={0.25} transparent opacity={0.55} />
            </mesh>
          )}
        </group>
      ))}
      
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[2000, 10000]} />
        <meshStandardMaterial color="#020617" />
        <gridHelper args={[2000, 100, '#1e293b', '#0f172a']} rotation={[Math.PI / 2, 0, 0]} />
      </mesh>
    </group>
  );
};

export default function Game3D({ costume, onGameOver, onScoreUpdate }: Game3DProps) {
  const buildingsRef = useRef<BuildingData[]>([]);
  const [score, setScore] = useState(0);

  useEffect(() => {
    const handleScore = (e: any) => setScore(e.detail);
    window.addEventListener('updateScore', handleScore);
    return () => window.removeEventListener('updateScore', handleScore);
  }, []);

  return (
    <div className="relative w-full h-full bg-slate-950 touch-none select-none" style={{ WebkitTapHighlightColor: 'transparent' }}>
      <Canvas camera={{ position: [0, 50, 50], fov: 75 }}>
        <color attach="background" args={['#020617']} />
        <fog attach="fog" args={['#020617', 100, 1000]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[100, 200, 50]} intensity={1.5} castShadow />
        
        <Player costume={costume} onGameOver={onGameOver} onScoreUpdate={onScoreUpdate} buildingsRef={buildingsRef} />
        <City buildingsRef={buildingsRef} />
      </Canvas>
      
      {/* Crosshair */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-80">
        <div className="relative w-8 h-8">
          <div className="absolute top-0 left-1/2 w-0.5 h-3 bg-white -translate-x-1/2" />
          <div className="absolute bottom-0 left-1/2 w-0.5 h-3 bg-white -translate-x-1/2" />
          <div className="absolute left-0 top-1/2 w-3 h-0.5 bg-white -translate-y-1/2" />
          <div className="absolute right-0 top-1/2 w-3 h-0.5 bg-white -translate-y-1/2" />
          <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-white rounded-full -translate-x-1/2 -translate-y-1/2" />
        </div>
      </div>
      
      {/* UI Overlay */}
      <div className="absolute top-6 left-6 text-white font-black text-3xl drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] pointer-events-none italic">
        {score}
      </div>
      
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/50 font-bold text-lg tracking-widest pointer-events-none uppercase">
        Tap Left / Right
      </div>
    </div>
  );
}
