import { GUEST, HOST, PLAYER_COLORS, PLAYER_RADIUS } from "./config";
import {
  drain,
  getClickStream,
  getDtStream,
  getLocalInputStream,
} from "./streams";
import { simulate } from "./transformations";
import { Click, Entity, Input, Score, State } from "./types";

// Runs the game on the host: every animation frame, gather everyone's input,
// advance the simulation, and hand the new board to `onBoardUpdate`.
export function start({
  board,
  onBoardUpdate,
  remoteInput,
  remoteClicks,
  consumeReset,
  shouldStop,
}: {
  board: State;
  onBoardUpdate: (board: State) => void;
  remoteInput: Iterator<Input>;
  remoteClicks: Iterator<Click | undefined>;
  // True once if a reset was requested since the last frame.
  consumeReset: () => boolean;
  shouldStop: () => boolean;
}) {
  const dt = getDtStream();
  const localInput = getLocalInputStream();
  const localClicks = getClickStream(HOST, board.ctx.canvas);

  requestAnimationFrame(function frame() {
    if (shouldStop()) {
      return;
    }
    const { board: next } = simulate({
      board,
      dt: dt.next().value,
      inputs: { host: localInput.next().value, guest: remoteInput.next().value },
      clicks: [...drain(localClicks), ...drain(remoteClicks)],
    });
    board = consumeReset() ? init() : afterRound(next);
    onBoardUpdate(board);
    requestAnimationFrame(frame);
  });
}

// If a player has died, award the round to the survivor (nobody scores on a
// double knockout) and immediately start a fresh round, keeping the score.
function afterRound(board: State): State {
  const hostAlive = board.entities.some((e) => e.id == HOST);
  const guestAlive = board.entities.some((e) => e.id == GUEST);
  if (hostAlive && guestAlive) {
    return board;
  }
  return init({
    host: board.score.host + (hostAlive ? 1 : 0),
    guest: board.score.guest + (guestAlive ? 1 : 0),
  });
}

// A fresh round: both players at random heights on their own side.
export function init(score: Score = { host: 0, guest: 0 }): State {
  const canvas = document.querySelector("canvas");
  const { width, height } = canvas;
  const player = (id: Entity["id"], x: number, color: string): Entity => ({
    id,
    x,
    y: Math.random() * height,
    r: PLAYER_RADIUS,
    vx: 0,
    vy: 0,
    color,
  });

  return {
    ctx: canvas.getContext("2d"),
    entities: [
      player(HOST, width / 8, PLAYER_COLORS.host),
      player(GUEST, (width * 7) / 8, PLAYER_COLORS.guest),
    ],
    score,
  };
}
