import { HOST } from "./config";
import { Rounds, versus } from "./round";
import {
  drain,
  getClickStream,
  getDtStream,
  getLocalInputStream,
} from "./streams";
import { simulate } from "./transformations";
import { Click, Input, State } from "./types";

const NO_INPUT: Input = { keys: new Set(), stick: { x: 0, y: 0 } };

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
  rounds = versus,
  random = Math.random,
}: {
  // Clicks are measured against this; the game itself never touches it.
  canvas: HTMLCanvasElement;
  onBoardUpdate: (board: State) => void;
  // The other player's controls; leave out to play alone.
  remoteInput?: Iterator<Input>;
  remoteClicks?: Iterator<Click | undefined>;
  // True once if a reset was requested since the last frame.
  consumeReset: () => boolean;
  shouldStop: () => boolean;
  rounds?: Rounds;
  random?: () => number;
}) {
  const dt = getDtStream();
  const localInput = getLocalInputStream();
  // Stops listening for clicks when the game ends.
  const listening = new AbortController();
  const localClicks = getClickStream(HOST, canvas, listening.signal);
  let board = rounds.first(random);

  requestAnimationFrame(function frame() {
    if (shouldStop()) {
      listening.abort();
      return;
    }
    const { board: next } = simulate({
      board,
      dt: dt.next().value,
      inputs: {
        host: localInput.next().value,
        guest: remoteInput ? remoteInput.next().value : NO_INPUT,
      },
      clicks: [
        ...drain(localClicks),
        ...(remoteClicks ? drain(remoteClicks) : []),
      ],
    });
    board = consumeReset() ? rounds.first(random) : rounds.after(next, random);
    onBoardUpdate(board);
    requestAnimationFrame(frame);
  });
}
