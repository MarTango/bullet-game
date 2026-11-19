import {
  ARENA,
  GUEST,
  HOST,
  NO_SCORE,
  PLAYER_COLORS,
  PLAYER_RADIUS,
} from "./config";
import { Arena, Entity, Role, Score, State } from "./types";

// Round logic, as pure functions. Randomness is passed in (`random` returns a
// number in [0, 1), like Math.random) so results are reproducible.

// How a game starts and what happens after each frame. Versus is the real
// game; practice is one player alone.
export interface Rounds {
  first: (random: () => number) => State;
  after: (state: State, random: () => number) => State;
}

// A player at a random height, `x` across.
function spawn(role: Role, x: number, arena: Arena, random: () => number): Entity {
  return {
    id: role,
    x,
    y: random() * arena.height,
    r: PLAYER_RADIUS,
    vx: 0,
    vy: 0,
    color: PLAYER_COLORS[role],
  };
}

// A fresh round: both players at random heights on their own side.
export function newRound(
  arena: Arena,
  score: Score,
  random: () => number
): State {
  return {
    arena,
    score,
    entities: [
      spawn(HOST, arena.width / 8, arena, random),
      spawn(GUEST, (arena.width * 7) / 8, arena, random),
    ],
  };
}

export const firstRound = (random: () => number) =>
  newRound(ARENA, NO_SCORE, random);

// If a player has died, award the round to the survivor (nobody scores on a
// double knockout) and immediately start a fresh round, keeping the score.
export function afterRound(state: State, random: () => number): State {
  const alive = (role: Role) => state.entities.some((e) => e.id == role);
  const hostAlive = alive(HOST);
  const guestAlive = alive(GUEST);
  if (hostAlive && guestAlive) {
    return state;
  }
  return newRound(
    state.arena,
    {
      host: state.score.host + (hostAlive ? 1 : 0),
      guest: state.score.guest + (guestAlive ? 1 : 0),
    },
    random
  );
}

export const versus: Rounds = { first: firstRound, after: afterRound };

// Practice: one player and nobody to score against.
export const practiceRound = (random: () => number): State => ({
  arena: ARENA,
  score: NO_SCORE,
  entities: [spawn(HOST, ARENA.width / 2, ARENA, random)],
});

// Touching a bullet just starts over, with the bullets cleared.
export const afterPracticeRound = (state: State, random: () => number): State =>
  state.entities.some((e) => e.id == HOST) ? state : practiceRound(random);

export const practice: Rounds = {
  first: practiceRound,
  after: afterPracticeRound,
};
