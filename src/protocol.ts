// Everything that crosses the network between host and guest.
//
// Three data channels, each suited to what it carries:
//   state   unreliable   host -> guest game frames, guest -> host input
//   events  reliable     guest -> host clicks (one-off events must not be lost)
//   chat    reliable     text messages, both ways
//
// Anything read from the network is untrusted: the decoders return null for
// malformed data and clamp or filter what they accept.

import { VALID_KEYS } from "./controls";
import { Click, Entity, Score, Stick } from "./types";

export const CHANNELS = {
  state: "state",
  events: "events",
  chat: "chat",
} as const;

// ---------- Game frames (host -> guest, binary) ----------
//
// The guest only needs to draw, so each entity is just position, radius and
// colour (6 bytes), instead of the ~90 bytes of JSON it used to be.
//
// Layout (little endian):
//   header   seq u16 | hostScore u16 | guestScore u16 | count u16
//   entity   x i16 | y i16 | r u8 | color u8        (x, y in 1/10 px)

// Colours are sent as an index into this table. Anything unknown is drawn grey.
const COLORS = ["red", "yellow", "black"];
const UNKNOWN_COLOR = 255;

const SCALE = 10;
const HEADER_BYTES = 8;
const ENTITY_BYTES = 6;

export interface Frame {
  seq: number;
  score: Score;
  entities: Entity[];
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

export function encodeFrame(
  seq: number,
  score: Score,
  entities: Entity[]
): ArrayBuffer {
  const buf = new ArrayBuffer(HEADER_BYTES + ENTITY_BYTES * entities.length);
  const view = new DataView(buf);
  view.setUint16(0, seq & 0xffff, true);
  view.setUint16(2, clamp(score.host, 0, 0xffff), true);
  view.setUint16(4, clamp(score.guest, 0, 0xffff), true);
  view.setUint16(6, entities.length, true);
  entities.forEach((e, i) => {
    const o = HEADER_BYTES + ENTITY_BYTES * i;
    const color = COLORS.indexOf(e.color);
    view.setInt16(o, clamp(Math.round(e.x * SCALE), -32768, 32767), true);
    view.setInt16(o + 2, clamp(Math.round(e.y * SCALE), -32768, 32767), true);
    view.setUint8(o + 4, clamp(Math.round(e.r), 0, 255));
    view.setUint8(o + 5, color < 0 ? UNKNOWN_COLOR : color);
  });
  return buf;
}

// The bytes come from the network, so reject anything that isn't the exact
// size the header promises.
export function decodeFrame(buf: ArrayBuffer): Frame | null {
  if (buf.byteLength < HEADER_BYTES) {
    return null;
  }
  const view = new DataView(buf);
  const count = view.getUint16(6, true);
  if (buf.byteLength != HEADER_BYTES + ENTITY_BYTES * count) {
    return null;
  }
  const entities: Entity[] = [];
  for (let i = 0; i < count; i++) {
    const o = HEADER_BYTES + ENTITY_BYTES * i;
    entities.push({
      x: view.getInt16(o, true) / SCALE,
      y: view.getInt16(o + 2, true) / SCALE,
      r: view.getUint8(o + 4),
      color: COLORS[view.getUint8(o + 5)] || "grey",
      vx: 0,
      vy: 0,
    });
  }
  return {
    seq: view.getUint16(0, true),
    score: {
      host: view.getUint16(2, true),
      guest: view.getUint16(4, true),
    },
    entities,
  };
}

// Messages can arrive out of order on an unordered channel. True if `seq` is
// newer than `last`, treating the 16-bit counter as wrapping around.
export function isNewer(seq: number, last: number): boolean {
  const diff = (seq - last + 0x10000) & 0xffff;
  return diff != 0 && diff < 0x8000;
}

// ---------- Input (guest -> host, JSON on the state channel) ----------
//
// Sent every frame and numbered, so the host can ignore any that arrive out of
// order on the unordered channel.

export interface InputMessage {
  n: number;
  keys: number[];
  stick: Stick;
}

export const encodeInput = (message: InputMessage) => JSON.stringify(message);

// Caps the stick's strength at 1 so a modified client can't move faster.
function sanitizeStick(stick: any): Stick {
  if (
    !stick ||
    typeof stick.x != "number" ||
    typeof stick.y != "number" ||
    !isFinite(stick.x) ||
    !isFinite(stick.y)
  ) {
    return { x: 0, y: 0 };
  }
  const length = Math.hypot(stick.x, stick.y);
  return length > 1
    ? { x: stick.x / length, y: stick.y / length }
    : { x: stick.x, y: stick.y };
}

export function decodeInput(data: unknown): InputMessage | null {
  const message = parse(data);
  if (!message || typeof message.n != "number" || !Array.isArray(message.keys)) {
    return null;
  }
  return {
    n: message.n,
    keys: message.keys.filter((key: unknown) => VALID_KEYS.has(key as number)),
    stick: sanitizeStick(message.stick),
  };
}

// ---------- Clicks (guest -> host, JSON on the events channel) ----------
//
// The shooter isn't sent: the host decides who a click belongs to, so a guest
// can't fire bullets as the host.

export const encodeClick = ({ x, y }: Click) => JSON.stringify({ x, y });

export function decodeClick(data: unknown, entityId: string): Click | null {
  const message = parse(data);
  if (
    !message ||
    typeof message.x != "number" ||
    typeof message.y != "number" ||
    !isFinite(message.x) ||
    !isFinite(message.y)
  ) {
    return null;
  }
  return { entityId, x: message.x, y: message.y };
}

function parse(data: unknown): any {
  try {
    return JSON.parse(data as string);
  } catch (err) {
    return null;
  }
}
