import { Click } from "./types";
import { keycodes } from "./controls";
const VALID_KEYS = new Set(Object.values(keycodes));

export const dtStream = (function* () {
  let prev = Date.now();
  while (true) {
    let next = Date.now();
    const dt = next - prev;
    prev = next;
    yield dt;
  }
})();

export function getLocalKeysPressedStream() {
  return (function* () {
    const keys = new Set<number>();

    window.addEventListener("keydown", (e) => {
      const key = e.keyCode;
      if (VALID_KEYS.has(key) && !keys.has(key)) {
        keys.add(key);
      }
    });

    window.addEventListener("keyup", (e) => {
      const key = e.keyCode;
      if (keys.has(key)) {
        keys.delete(key);
      }
    });

    while (true) {
      yield keys;
    }
  })();
}

export function getRemoteKeysPressedStream(channel: RTCDataChannel) {
  return (function* () {
    const keysPressedQueue: Set<number>[] = [];

    channel.addEventListener("message", (e) => {
      const keysPressed: number[] = JSON.parse(e.data).keysPressed;
      keysPressedQueue.push(new Set(keysPressed));
    });

    const emptySet = new Set<number>();

    while (true) {
      yield keysPressedQueue.pop() || emptySet;
    }
  })();
}

export function getClickStream(
  entityId: string,
  { offsetLeft, offsetTop, height }: HTMLCanvasElement
) {
  return (function* () {
    const queue: Click[] = [];
    window.addEventListener("mousedown", ({ pageX, pageY }) => {
      const offsetX = pageX - offsetLeft;
      const offsetY = pageY - offsetTop;
      queue.push({ entityId, x: offsetX, y: height - offsetY });
    });
    while (true) {
      yield queue.pop();
    }
  })();
}

export function getRemoteClickStream(channel: RTCDataChannel) {
  return (function* () {
    const queue: Click[] = [];

    channel.addEventListener("message", (e) => {
      const { click } = JSON.parse(e.data);

      if (click) {
        queue.push(click);
      }
    });

    while (true) {
      yield queue.pop();
    }
  })();
}
