import { PLAYER_NAMES } from "./config";
import { Entity, Score, State } from "./types";

function drawScore(ctx: CanvasRenderingContext2D, score: Score, width: number) {
  ctx.font = "20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#555";
  ctx.fillText(
    `${PLAYER_NAMES.host} ${score.host} – ${score.guest} ${PLAYER_NAMES.guest}`,
    width / 2,
    28
  );
}

// The board's y axis points up, the canvas's points down.
function drawEntity(ctx: CanvasRenderingContext2D, e: Entity, height: number) {
  ctx.beginPath();
  ctx.arc(e.x, height - e.y, e.r, 0, 2 * Math.PI);
  ctx.fillStyle = e.color;
  ctx.fill();
  ctx.strokeStyle = "black";
  ctx.stroke();
  ctx.closePath();
}

export function display({ ctx, entities, score }: State) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  drawScore(ctx, score, width);
  entities.forEach((e) => drawEntity(ctx, e, height));
}
