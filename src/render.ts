import { PLAYER_NAMES } from "./config";
import { Entity, Scene, Score } from "./types";

function drawScore(ctx: CanvasRenderingContext2D, score: Score) {
  ctx.font = "20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#555";
  ctx.fillText(
    `${PLAYER_NAMES.host} ${score.host} – ${score.guest} ${PLAYER_NAMES.guest}`,
    ctx.canvas.width / 2,
    28
  );
}

// The board's y axis points up, the canvas's points down.
function drawEntity(ctx: CanvasRenderingContext2D, e: Entity) {
  ctx.beginPath();
  ctx.arc(e.x, ctx.canvas.height - e.y, e.r, 0, 2 * Math.PI);
  ctx.fillStyle = e.color;
  ctx.fill();
  ctx.strokeStyle = "black";
  ctx.stroke();
  ctx.closePath();
}

export function display(
  ctx: CanvasRenderingContext2D,
  { entities, score }: Scene,
  showScore = true
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (showScore) {
    drawScore(ctx, score);
  }
  entities.forEach((e) => drawEntity(ctx, e));
}
