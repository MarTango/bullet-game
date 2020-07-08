import { dtStream, getClickStream, getLocalKeysPressedStream } from "./streams";
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
  remoteClickStream,
  pc,
}: {
  board: State;
  onBoardUpdate: (b: State) => void;
  remoteKeysStream: ReturnType<typeof getLocalKeysPressedStream>;
  remoteClickStream: Iterator<Msg["clicks"][0]>;
  pc: RTCPeerConnection;
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

  requestAnimationFrame(async function frame() {
    const msg: Msg = {
      board,
      dt: dtStream.next().value,
      keys: {
        host: keysPressedStream.next().value,
        guest: remoteKeysStream.next().value,
      },
      clicks: [clickStream.next().value, remoteClickStream.next().value].filter(
        (c) => c
      ),
    };
    board = update(msg).board;
    onBoardUpdate(board);
    requestAnimationFrame(frame);
  });
}

export function display(s: State) {
  const { height: h, width: w } = s.ctx.canvas;
  s.ctx.clearRect(0, 0, w, h);
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
  };
}
