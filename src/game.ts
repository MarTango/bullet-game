import { HOST } from "./config";
import { afterRound, firstRound } from "./round";
import {
  drain,
  getClickStream,
  getDtStream,
  getLocalInputStream,
} from "./streams";
import { simulate } from "./transformations";
import { Click, Input, State } from "./types";

// Runs the game on the host: every animation frame, gather everyone's input,
// advance the simulation, and hand the new board to `onBoardUpdate`. This is
// the impure shell around the pure rules in transformations.ts and round.ts.
export function start({
  canvas,
  onBoardUpdate,
  remoteInput,
  remoteClicks,
  consumeReset,
  shouldStop,
  random = Math.random,
}: {
  // Clicks are measured against this; the game itself never touches it.
  canvas: HTMLCanvasElement;
  onBoardUpdate: (board: State) => void;
  remoteInput: Iterator<Input>;
  remoteClicks: Iterator<Click | undefined>;
  // True once if a reset was requested since the last frame.
  consumeReset: () => boolean;
  shouldStop: () => boolean;
  random?: () => number;
}) {
  const dt = getDtStream();
  const localInput = getLocalInputStream();
  const localClicks = getClickStream(HOST, canvas);
  let board = firstRound(random);

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
    board = consumeReset() ? firstRound(random) : afterRound(next, random);
    onBoardUpdate(board);
    requestAnimationFrame(frame);
  });
}
