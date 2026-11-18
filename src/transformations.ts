import { Click, Entity, Input, Msg } from "./types";
import { keycodes } from "./controls";
import {
  BULLET_COLOR,
  BULLET_RADIUS,
  BULLET_SPAWN_GAP,
  BULLET_SPEED,
  MAX_DT,
  PLAYER_SPEED,
} from "./config";

// The game rules, as pure functions: each takes a Msg and returns a new one.

export function afterTimeStep({ dt = 0, board, ...msg }: Msg): Msg {
  const step = Math.min(dt, MAX_DT);
  return {
    ...msg,
    dt: step,
    board: {
      ...board,
      entities: board.entities.map((e) => ({
        ...e,
        x: e.x + e.vx * step,
        y: e.y + e.vy * step,
      })),
    },
  };
}

const overlaps = (a: Entity, b: Entity) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < (a.r + b.r) ** 2;

// Anything touching anything else is destroyed (both sides of a collision).
export function afterCollisions({ board, ...msg }: Msg): Msg {
  return {
    ...msg,
    board: {
      ...board,
      entities: board.entities.filter(
        (a, i) => !board.entities.some((b, j) => i != j && overlaps(a, b))
      ),
    },
  };
}

// Keeps a position inside [0, max] and turns the velocity back inwards when
// the edge of the entity (radius r) touches a wall.
function bounce(pos: number, vel: number, r: number, max: number) {
  return {
    pos: Math.min(Math.max(pos, 0), max),
    vel:
      pos - r < 0 ? Math.abs(vel) : pos + r > max ? -Math.abs(vel) : vel,
  };
}

export function afterBouncing({ board, ...msg }: Msg): Msg {
  const { width, height } = board.arena;

  return {
    ...msg,
    board: {
      ...board,
      entities: board.entities.map((e) => {
        const x = bounce(e.x, e.vx, e.r, width);
        const y = bounce(e.y, e.vy, e.r, height);
        return { ...e, x: x.pos, y: y.pos, vx: x.vel, vy: y.vel };
      }),
    },
  };
}

const KEY_VELOCITY: { [keycode: number]: Partial<Entity> } = {
  [keycodes.w]: { vy: PLAYER_SPEED },
  [keycodes.a]: { vx: -PLAYER_SPEED },
  [keycodes.s]: { vy: -PLAYER_SPEED },
  [keycodes.d]: { vx: PLAYER_SPEED },
};

function velocityFor({ keys, stick }: Input) {
  // The analog stick sets a base velocity; held keys then override the axes
  // they touch.
  return Array.from(keys).reduce(
    (velocity, key) => ({ ...velocity, ...KEY_VELOCITY[key] }),
    { vx: stick.x * PLAYER_SPEED, vy: stick.y * PLAYER_SPEED }
  );
}

// Sets each player's velocity from their input. Entities without an input
// (bullets) are untouched.
export function afterMovement({ board, ...msg }: Msg): Msg {
  return {
    ...msg,
    board: {
      ...board,
      entities: board.entities.map((e) => {
        const input = msg.inputs[e.id];
        return input ? { ...e, ...velocityFor(input) } : e;
      }),
    },
  };
}

function bulletFor(click: Click, entities: Entity[]): Entity | undefined {
  const shooter = entities.find((e) => e.id == click.entityId);
  if (!shooter) {
    return;
  }
  const dx = click.x - shooter.x;
  const dy = click.y - shooter.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance === 0) {
    // Aimed exactly at the shooter's centre: there's no direction to fire in,
    // and dividing by zero would turn the bullet's position into NaN.
    return;
  }
  const ux = dx / distance;
  const uy = dy / distance;
  const offset = shooter.r + BULLET_SPAWN_GAP;

  return {
    r: BULLET_RADIUS,
    color: BULLET_COLOR,
    x: shooter.x + offset * ux,
    y: shooter.y + offset * uy,
    vx: BULLET_SPEED * ux,
    vy: BULLET_SPEED * uy,
  };
}

export function afterClicks({ board, ...msg }: Msg): Msg {
  const bullets = msg.clicks
    .map((click) => bulletFor(click, board.entities))
    .filter((bullet): bullet is Entity => !!bullet);

  return {
    ...msg,
    board: { ...board, entities: [...board.entities, ...bullets] },
  };
}

// One frame of the game, in the order the steps run.
const steps: Array<(msg: Msg) => Msg> = [
  afterTimeStep,
  afterBouncing,
  afterCollisions,
  afterMovement,
  afterClicks,
];

export const simulate = (msg: Msg): Msg =>
  steps.reduce((current, step) => step(current), msg);
