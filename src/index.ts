import { keysPressedStream, dtStream, getClickStream } from "./streams";
import {
  afterBouncing,
  afterCollisions,
  afterTimeStep,
  afterKeysPressed,
  afterMouseDown,
} from "./transformations";
import { Entity, Msg, State } from "./types";

(function main() {
  let board = init();

  const update = (e: Msg): Msg =>
    afterMouseDown(
      afterKeysPressed(afterCollisions(afterBouncing(afterTimeStep(e))))
    );

  const clickStream = getClickStream(board);

  requestAnimationFrame(async function frame() {
    await new Promise((r, _) => setTimeout(r, 10));

    const msg: Msg = {
      board,
      dt: dtStream.next().value,
      keysPressed: keysPressedStream.next().value,
      click: clickStream.next().value,
    };
    board = update(msg).board;
    display(board);
    requestAnimationFrame(frame);
  });
})();

function display(s: State) {
  const { height: h, width: w } = s.ctx.canvas;
  s.ctx.clearRect(0, 0, w, h);
  s.entities.forEach((b) => {
    s.ctx.beginPath();
    s.ctx.arc(b.x, h - b.y, b.r, 0, 2 * Math.PI);
    s.ctx.fillStyle = b.color;
    s.ctx.fill();
    s.ctx.closePath();
  });
}

function init(): State {
  const canvas = document.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  const players: Entity[] = [
    {
      id: 1,
      x: Math.random() * w,
      y: Math.random() * h,
      r: 10,
      vx: 0,
      vy: 0,
      color: "red",
    },
  ];

  return {
    ctx,
    entities: players,
  };
}
