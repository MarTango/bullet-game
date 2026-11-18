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

// A fresh round: both players at random heights on their own side.
export function newRound(
  arena: Arena,
  score: Score,
  random: () => number
): State {
  const player = (role: Role, x: number): Entity => ({
    id: role,
    x,
    y: random() * arena.height,
    r: PLAYER_RADIUS,
    vx: 0,
    vy: 0,
    color: PLAYER_COLORS[role],
  });

  return {
    arena,
    score,
    entities: [
      player(HOST, arena.width / 8),
      player(GUEST, (arena.width * 7) / 8),
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
