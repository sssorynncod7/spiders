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
  };
  buildings: Building[];
  score: number;
  cameraX: number;
  cameraY: number;
  pointer: Point;
  isGameOver: boolean;
}
