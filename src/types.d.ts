export interface State {
  ctx: CanvasRenderingContext2D;
  entities: Entity[];
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

export interface Msg {
  board: State;
  dt?: number;
  keys: Keys;
  clicks: Click[];
}
