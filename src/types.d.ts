export interface State {
  ctx: CanvasRenderingContext2D;
  entities: Entity[];
}

export interface Entity {
  id?: number;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
}

export interface Click {
  x: number;
  y: number;
}

export interface Msg {
  board: State;
  dt?: number;
  keysPressed?: Set<string>;
  click?: Click;
}
