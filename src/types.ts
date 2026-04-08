export interface Point {
  x: number;
  y: number;
}

export interface Web {
  active: boolean;
  anchor: Point | null;
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

export interface Enemy {
  x: number;
  spawnX: number;
  y: number;
  radius: number;
  type: 'goblin' | 'lizard' | 'rhino';
  vx: number;
  hp: number;
  direction: 1 | -1;
}

export interface WebShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
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
  enemies: Enemy[];
  webShots: WebShot[];
  score: number;
  lives: number;
  cameraX: number;
  cameraY: number;
  pointer: Point;
  isGameOver: boolean;
}
