export interface Point {
  x: number;
  y: number;
}

export interface Web {
  active: boolean;
  anchor: Point | null;
  targetAnchor: Point | null;
  tip: Point | null;
  shooting: boolean;
  shotTension: number;
  restLength: number;
}

export interface Building {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  darkColor: string;
  hasAntenna: boolean;
  antennaX: number;
  windows: Point[];
}

export interface Obstacle {
  x: number;
  y: number;
  radius: number;
  type: 'drone' | 'mine';
  offsetY: number; // For floating animation
}

export type CostumeId = 'classic' | 'symbiote' | 'miles' | 'gwen' | 'iron' | '2099' | 'noir';

export interface GameState {
  player: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    rotation: number;
    leftWeb: Web;
    rightWeb: Web;
    invulnerableUntil: number;
  };
  buildings: Building[];
  obstacles: Obstacle[];
  score: number;
  lives: number;
  cameraX: number;
  cameraY: number;
  pointer: Point;
  isGameOver: boolean;
}
