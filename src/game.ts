import {
  dtStream,
  getClickStream,
  getLocalKeysPressedStream,
  getLocalStickStream,
  getRemoteStickStream,
} from "./streams";
import {
  afterBouncing,
  afterCollisions,
  afterTimeStep,
  afterKeysPressed,
  afterClicks,
} from "./transformations";
import { Entity, Msg, State } from "./types";

export function start({
  board,
  onBoardUpdate,
  remoteKeysStream,
  remoteStickStream,
  remoteClickStream,
  shouldReset,
  reset,
  shouldStop,
}: {
  board: State;
  onBoardUpdate: (b: State) => void;
  remoteKeysStream: ReturnType<typeof getLocalKeysPressedStream>;
  remoteStickStream: ReturnType<typeof getRemoteStickStream>;
  remoteClickStream: Iterator<Msg["clicks"][0]>;
  shouldReset: () => boolean;
  reset: () => void;
  shouldStop: () => boolean;
}) {
  const id = "host";

  // Composition of all transformers
  const update: (e: Msg) => Msg = [
    afterClicks,
    afterKeysPressed,
    afterCollisions,
    afterBouncing,
    afterTimeStep,
  ].reduce((f, g) => {
    return (msg: Msg) => f(g(msg));
  });

  const clickStream = getClickStream(id, board.ctx.canvas);
  const keysPressedStream = getLocalKeysPressedStream();
  const stickStream = getLocalStickStream();

  requestAnimationFrame(async function frame() {
    if (shouldStop()) {
      return;
    }
    const msg: Msg = {
      board,
      dt: dtStream.next().value,
      keys: {
        host: keysPressedStream.next().value,
        guest: remoteKeysStream.next().value,
      },
      sticks: {
        host: stickStream.next().value,
        guest: remoteStickStream.next().value,
      },
      clicks: [clickStream.next().value, remoteClickStream.next().value].filter(
        (c) => c
      ),
    };
    board = afterRound(update(msg).board);
    if (shouldReset()) {
      board = init();
      reset();
    }
    onBoardUpdate(board);
    requestAnimationFrame(frame);
  });
}

// If a player has died, award the round to the survivor (nobody scores on a
// double knockout) and immediately start a fresh round, keeping the score.
function afterRound(board: State): State {
  const hostAlive = board.entities.some((e) => e.id == "host");
  const guestAlive = board.entities.some((e) => e.id == "guest");
  if (hostAlive && guestAlive) {
    return board;
  }
  return {
    ...init(),
    score: {
      host: board.score.host + (hostAlive ? 1 : 0),
      guest: board.score.guest + (guestAlive ? 1 : 0),
    },
  };
}

export function display(s: State) {
  const { height: h, width: w } = s.ctx.canvas;
  s.ctx.clearRect(0, 0, w, h);
  if (s.score) {
    s.ctx.font = "20px sans-serif";
    s.ctx.textAlign = "center";
    s.ctx.fillStyle = "#555";
    s.ctx.fillText(
      `Red ${s.score.host} – ${s.score.guest} Yellow`,
      w / 2,
      28
    );
  }
  s.entities.forEach((b) => {
    s.ctx.beginPath();
    s.ctx.arc(b.x, h - b.y, b.r, 0, 2 * Math.PI);
    s.ctx.fillStyle = b.color;
    s.ctx.fill();
    s.ctx.strokeStyle = "black";
    s.ctx.stroke();
    s.ctx.closePath();
  });
}

export function init(): State {
  const canvas: HTMLCanvasElement = document.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  const players: Entity[] = [
    {
      id: "host",
      x: w / 8,
      y: Math.random() * h,
      r: 10,
      vx: 0,
      vy: 0,
      color: "red",
    },
    {
      id: "guest",
      x: (w * 7) / 8,
      y: Math.random() * h,
      r: 10,
      vx: 0,
      vy: 0,
      color: "yellow",
    },
  ];

  return {
    ctx,
    entities: players,
    score: { host: 0, guest: 0 },
  };
}
