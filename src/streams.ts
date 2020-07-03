import { State, Click } from "./types";

export const keysPressedStream = (function* () {
  const keys = new Set<string>();
  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (!keys.has(key)) {
      keys.add(key);
    }
  });
  window.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    if (keys.has(key)) {
      keys.delete(key);
    }
  });
  while (true) {
    yield keys;
  }
})();

export const dtStream = (function* () {
  let prev = Date.now();
  while (true) {
    let next = Date.now();
    const dt = next - prev;
    prev = next;
    yield dt;
  }
})();

export function getClickStream(board: State) {
  return (function* () {
    const queue: Click[] = [];
    window.addEventListener("mousedown", ({ offsetX: x, offsetY }) => {
      queue.push({ x, y: board.ctx.canvas.height - offsetY });
    });
    while (true) {
      yield queue.pop();
    }
  })();
}
