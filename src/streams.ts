import { VALID_KEYS } from "./controls";
import { decodeClick, decodeInput } from "./protocol";
import { Click, Input, Stick } from "./types";

// A stream is an endless iterator: ask for `.next().value` once per frame to
// get the current value of something (time since the last frame, the keys
// held right now, the next queued click...).
function* stream<T>(read: () => T): Generator<T, never, undefined> {
  while (true) {
    yield read();
  }
}

export function getDtStream() {
  let previous = Date.now();
  return stream(() => {
    const now = Date.now();
    const dt = now - previous;
    previous = now;
    return dt;
  });
}

// Everything queued so far, oldest first.
export function drain<T>(source: Iterator<T | undefined>): T[] {
  const items: T[] = [];
  for (let item = source.next().value; item; item = source.next().value) {
    items.push(item);
  }
  return items;
}

// ---------- This player's controls ----------

const heldKeys = new Set<number>();
const heldStick: Stick = { x: 0, y: 0 };

// Called by the on-screen stick.
export function setStick(x: number, y: number) {
  heldStick.x = x;
  heldStick.y = y;
}

export function getLocalInputStream() {
  window.addEventListener("keydown", (e) => {
    // Typing "wasd" into the chat box shouldn't move the player.
    const typing = (e.target as HTMLElement).closest("input, textarea");
    if (VALID_KEYS.has(e.keyCode) && !typing) {
      heldKeys.add(e.keyCode);
    }
  });
  window.addEventListener("keyup", (e) => heldKeys.delete(e.keyCode));

  return stream((): Input => ({ keys: heldKeys, stick: heldStick }));
}

// Presses on these are using the interface, not shooting.
const NOT_A_SHOT = "button, input, textarea, #chat, #stick";

export function getClickStream(entityId: string, canvas: HTMLCanvasElement) {
  const queue: Click[] = [];
  // Pointer events cover both mouse clicks and touch taps.
  window.addEventListener("pointerdown", ({ clientX, clientY, target }) => {
    if ((target as HTMLElement).closest(NOT_A_SHOT)) {
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
  return stream(() => queue.shift());
}

// ---------- The other player's controls (from the network) ----------

// The most recent input the guest reported. Input is state, not events, so
// holding the latest value is right: it keeps applying until a new one comes.
export function getRemoteInputStream(channel: RTCDataChannel) {
  let latest: Input = { keys: new Set(), stick: { x: 0, y: 0 } };
  let lastN = -1;

  channel.addEventListener("message", ({ data }) => {
    const message = decodeInput(data);
    // The channel is unordered, so ignore input older than what we have.
    if (!message || message.n <= lastN) {
      return;
    }
    lastN = message.n;
    latest = { keys: new Set(message.keys), stick: message.stick };
  });

  return stream(() => latest);
}

export function getRemoteClickStream(channel: RTCDataChannel, entityId: string) {
  const queue: Click[] = [];
  channel.addEventListener("message", ({ data }) => {
    const click = decodeClick(data, entityId);
    if (click) {
      queue.push(click);
    }
  });
  return stream(() => queue.shift());
}
