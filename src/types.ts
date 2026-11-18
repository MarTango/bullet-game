export type Role = "host" | "guest";

export interface Score {
  host: number;
  guest: number;
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

export interface Arena {
  width: number;
  height: number;
}

// The whole game at one moment: plain data, no DOM objects.
export interface State {
  arena: Arena;
  entities: Entity[];
  score: Score;
}

// What's needed to draw a frame (the guest has no arena or physics, only this).
export type Scene = Pick<State, "entities" | "score">;

export interface Click {
  entityId: string;
  x: number;
  y: number;
}

// Analog stick tilt, each axis in [-1, 1] (y up, matching the board).
export interface Stick {
  x: number;
  y: number;
}

// Everything a player is doing with their controls right now.
export interface Input {
  keys: Set<number>;
  stick: Stick;
}

export type Inputs = { [playerId: string]: Input };

// What one frame of the simulation consumes; each transformation maps a Msg to
// a new Msg.
export interface Msg {
  board: State;
  dt?: number;
  inputs: Inputs;
  clicks: Click[];
}
