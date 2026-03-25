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

const GRAVITY = new THREE.Vector3(0, -90, 0);
const RETRACT_SPEED = 60;
const FORWARD_FORCE = 40;
const MAX_VELOCITY = 150;
const BUILDING_SPACING = 80;
const BUILDING_WIDTH = 40;

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
}

const generateBuilding = (z: number, id: number, isLeft: boolean): BuildingData => {
  const x = isLeft ? -30 - Math.random() * 40 : 30 + Math.random() * 40;
  const height = 150 + Math.random() * 200;
  const width = BUILDING_WIDTH + Math.random() * 20;
  const depth = BUILDING_WIDTH + Math.random() * 20;
  
  const colors = ['#0f172a', '#1e293b', '#334155', '#020617'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  return {
    id,
    position: new THREE.Vector3(x, height / 2, z),
    size: new THREE.Vector3(width, height, depth),
    color
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
    score: 0,
    isGameOver: false
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
      web.restLength = state.current.pos.distanceTo(web.anchor);
    }
  };

  const handlePointerUp = (e: PointerEvent) => {
    const x = e.clientX;
    const isLeft = x < window.innerWidth / 2;
    if (isLeft) state.current.leftWeb.active = false;
    else state.current.rightWeb.active = false;
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

    const dt = Math.min(delta, 0.05);

    // Gravity
    s.vel.addScaledVector(GRAVITY, dt);

    // Forward propulsion to keep the game moving
    s.vel.z -= FORWARD_FORCE * dt;

    const applyWeb = (web: typeof s.leftWeb) => {
      if (!web.active) return;
      const diff = new THREE.Vector3().subVectors(web.anchor, s.pos);
      const distance = diff.length();
      
      // Retract web
      if (web.restLength > 50) {
        web.restLength -= RETRACT_SPEED * dt;
      }

      // Pendulum constraint
      if (distance > web.restLength) {
        const excess = distance - web.restLength;
        const dir = diff.normalize();
        
        // Pull player back to rest length
        s.pos.addScaledVector(dir, excess);
        
        // Remove velocity along the web string (inelastic collision)
        const dot = s.vel.dot(dir);
        if (dot < 0) {
          s.vel.addScaledVector(dir, -dot);
        }
      }
    };

    applyWeb(s.leftWeb);
    applyWeb(s.rightWeb);

    // Speed limit
    if (s.vel.length() > MAX_VELOCITY) {
      s.vel.setLength(MAX_VELOCITY);
    }

    // Apply velocity
    s.pos.addScaledVector(s.vel, dt);

    // Update player mesh
    if (playerRef.current) {
      playerRef.current.position.copy(s.pos);
      
      // Smooth rotation towards velocity
      const targetRotation = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, -1),
        s.vel.clone().normalize()
      );
      playerRef.current.quaternion.slerp(targetRotation, 0.1);
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
  const ref = useRef<any>(null);
  
  useFrame(() => {
    if (ref.current) {
      const positions = ref.current.geometry.attributes.position.array;
      positions[0] = startPos.x;
      positions[1] = startPos.y;
      positions[2] = startPos.z;
      positions[3] = endPos.x;
      positions[4] = endPos.y;
      positions[5] = endPos.z;
      ref.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <line ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={2}
          array={new Float32Array(6)}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color={color} linewidth={3} />
    </line>
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
        <Box key={b.id} position={b.position} args={[b.size.x, b.size.y, b.size.z]}>
          <meshStandardMaterial color={b.color} roughness={0.9} metalness={0.1} />
          {/* Simple Windows */}
          <edgesGeometry attach="geometry" />
          <lineBasicMaterial attach="material" color="#334155" linewidth={1} opacity={0.2} transparent />
        </Box>
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
