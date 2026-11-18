export interface Score {
  host: number;
  guest: number;
}

export interface State {
  ctx: CanvasRenderingContext2D;
  entities: Entity[];
  score: Score;
}

export interface Entity {
  id?: string;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
}

export interface Click {
  entityId: string;
  x: number;
  y: number;
}

export type Keys = { [id: string]: Set<number> };

// Analog stick tilt, each axis in [-1, 1] (y up, matching the board).
export interface Stick {
  x: number;
  y: number;
}

export type Sticks = { [id: string]: Stick };

export interface Msg {
  board: State;
  dt?: number;
  keys: Keys;
  sticks: Sticks;
  clicks: Click[];
}
