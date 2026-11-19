// Playing alone: the same game with one player and nothing to score against.
// It runs on the lobby screen, so you can still be challenged while you
// practise, and it stops the moment a real game begins.

import { start } from "./game";
import { display } from "./render";
import { practice } from "./round";
import { onPracticeOver, onPracticing } from "./session";
import { $, canvas, ctx, watchReset } from "./ui";

let practising = false;

export function stopPractice() {
  if (!practising) {
    return;
  }
  practising = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  onPracticeOver();
  $("practice").textContent = "Practice alone";
}

function startPractice() {
  practising = true;
  onPracticing();
  $("practice").textContent = "Stop practice";
  start({
    canvas,
    // No score: there's nobody to play against.
    onBoardUpdate: (board) => display(ctx, board, false),
    consumeReset: watchReset(),
    shouldStop: () => !practising,
    rounds: practice,
  });
}

export function initPractice() {
  $("practice").onclick = () => (practising ? stopPractice() : startPractice());
}
