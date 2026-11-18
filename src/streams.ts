import { Click, Stick } from "./types";
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

// Keys currently held, shared by the keyboard handlers and the on-screen
// touch buttons so both drive movement the same way.
const heldKeys = new Set<number>();

export function setKeyHeld(key: number, held: boolean) {
  if (held) {
    heldKeys.add(key);
  } else {
    heldKeys.delete(key);
  }
}

export function getLocalKeysPressedStream() {
  return (function* () {
    window.addEventListener("keydown", (e) => {
      // Typing "wasd" into the chat box shouldn't move the player.
      const typing = (e.target as HTMLElement).closest("input, textarea");
      if (VALID_KEYS.has(e.keyCode) && !typing) {
        setKeyHeld(e.keyCode, true);
      }
    });

    window.addEventListener("keyup", (e) => setKeyHeld(e.keyCode, false));

    while (true) {
      yield heldKeys;
    }
  })();
}

// Analog stick tilt, written by the on-screen stick.
const heldStick: Stick = { x: 0, y: 0 };

export function setStick(x: number, y: number) {
  heldStick.x = x;
  heldStick.y = y;
}

export function getLocalStickStream() {
  return (function* () {
    while (true) {
      yield heldStick;
    }
  })();
}

// The guest's value arrives over the network, so don't trust it: ignore
// anything malformed and cap the strength at 1 (no speed hacks).
function sanitizeStick(s?: Stick): Stick {
  if (
    !s ||
    typeof s.x !== "number" ||
    typeof s.y !== "number" ||
    !isFinite(s.x) ||
    !isFinite(s.y)
  ) {
    return { x: 0, y: 0 };
  }
  const len = Math.hypot(s.x, s.y);
  return len > 1 ? { x: s.x / len, y: s.y / len } : { x: s.x, y: s.y };
}

export function getRemoteStickStream(channel: RTCDataChannel) {
  return (function* () {
    let latest: Stick = { x: 0, y: 0 };
    let lastN = -1;
    channel.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      // The channel is unordered, so ignore input older than what we have.
      if (typeof msg.n == "number") {
        if (msg.n <= lastN) {
          return;
        }
        lastN = msg.n;
      }
      latest = sanitizeStick(msg.stick);
    });
    while (true) {
      yield latest;
    }
  })();
}

export function getRemoteKeysPressedStream(channel: RTCDataChannel) {
  return (function* () {
    // Keys are state, not events: hold the latest set the guest reported.
    let latest = new Set<number>();
    let lastN = -1;

    channel.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (typeof msg.n == "number") {
        if (msg.n <= lastN) {
          return;
        }
        lastN = msg.n;
      }
      latest = new Set<number>(msg.keysPressed);
    });

    while (true) {
      yield latest;
    }
  })();
}

export function getClickStream(entityId: string, canvas: HTMLCanvasElement) {
  return (function* () {
    const queue: Click[] = [];
    // Pointer events cover both mouse clicks and touch taps. Presses on
    // buttons, the move pad and form fields aren't shots.
    window.addEventListener("pointerdown", ({ clientX, clientY, target }) => {
      if ((target as HTMLElement).closest("button, textarea, input, #chat")) {
        return;
      }
      // Measure the canvas at click time: the page layout shifts (setup panel
      // hiding, status text changing, scrolling), so a position captured when
      // the stream was created goes stale.
      const rect = canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) * canvas.width) / rect.width;
      const y = ((clientY - rect.top) * canvas.height) / rect.height;
      queue.push({ entityId, x, y: canvas.height - y });
    });
    while (true) {
      yield queue.shift();
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
      yield queue.shift();
    }
  })();
}
