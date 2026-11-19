// What players say to each other while finding a game and connecting.
//
// Two kinds of message travel through the public MQTT broker:
//   announcements  to the shared lobby topic, heard by everyone ("I'm here")
//   direct         to one player's own inbox topic (a challenge, a connection
//                  offer, ...)
//
// Everything arrives from the network, so the parsers accept only the exact
// shapes we send and clean up what they accept.

export const BROKER_URL = "wss://broker.hivemq.com:8884/mqtt";

const TOPIC_PREFIX = "bullet-game/v1";
const MAX_SDP_LENGTH = 50_000;
const MAX_NAME_LENGTH = 20;

export const lobbyTopic = (room: string) => `${TOPIC_PREFIX}/${room}/lobby`;
export const inboxTopic = (room: string, id: string) =>
  `${TOPIC_PREFIX}/${room}/player/${id}`;

export type Announcement =
  | { type: "presence"; name: string; busy: boolean }
  | { type: "who" }
  | { type: "bye" };

export type Direct =
  | { type: "challenge"; name: string }
  | { type: "accept" }
  | { type: "decline" }
  | { type: "cancel" }
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string };

// Every message says who it's from.
export type From<T> = T & { from: string };

export const newPlayerId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");

const ID_PATTERN = /^[0-9a-f]{16}$/;

export function cleanName(name: unknown): string {
  const clean =
    typeof name == "string"
      ? name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH)
      : "";
  return clean || "Player";
}

function parseJson(payload: string): any {
  try {
    const message = JSON.parse(payload);
    return message && ID_PATTERN.test(message.from) ? message : null;
  } catch (err) {
    return null;
  }
}

export function parseAnnouncement(payload: string): From<Announcement> | null {
  const m = parseJson(payload);
  switch (m?.type) {
    case "presence":
      return { type: "presence", from: m.from, name: cleanName(m.name), busy: m.busy === true };
    case "who":
    case "bye":
      return { type: m.type, from: m.from };
  }
  return null;
}

export function parseDirect(payload: string): From<Direct> | null {
  const m = parseJson(payload);
  switch (m?.type) {
    case "challenge":
      return { type: "challenge", from: m.from, name: cleanName(m.name) };
    case "accept":
    case "decline":
    case "cancel":
      return { type: m.type, from: m.from };
    case "offer":
    case "answer":
      return typeof m.sdp == "string" && m.sdp.length <= MAX_SDP_LENGTH
        ? { type: m.type, from: m.from, sdp: m.sdp }
        : null;
  }
  return null;
}

// Holds messages until someone asks for them, so one that arrives before we
// start waiting isn't lost.
export class Mailbox {
  private inbox: Direct[] = [];
  private waiting: { type: string; resolve: (m: Direct) => void }[] = [];

  push(message: Direct) {
    const i = this.waiting.findIndex((w) => w.type == message.type);
    if (i >= 0) {
      this.waiting.splice(i, 1)[0].resolve(message);
    } else {
      this.inbox.push(message);
    }
  }

  // The next message of this type, or an error if none comes in time.
  next<T extends Direct["type"]>(
    type: T,
    timeoutMs: number
  ): Promise<Extract<Direct, { type: T }>> {
    return new Promise<any>((resolve, reject) => {
      const i = this.inbox.findIndex((m) => m.type == type);
      if (i >= 0) {
        return resolve(this.inbox.splice(i, 1)[0]);
      }
      const entry = {
        type: type as string,
        resolve: (m: Direct) => {
          clearTimeout(timer);
          resolve(m);
        },
      };
      const timer = setTimeout(() => {
        this.waiting.splice(this.waiting.indexOf(entry), 1);
        reject(new Error("The other player didn't respond. Try again."));
      }, timeoutMs);
      this.waiting.push(entry);
    });
  }
}

// Resolves once ICE gathering is done, so the session description already
// contains every candidate and can go out as a single message. Falls back
// after a timeout so a slow STUN server can't hang the UI forever.
export function waitForIce(pc: RTCPeerConnection, timeoutMs = 4000) {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState == "complete") {
      return resolve();
    }
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => pc.iceGatheringState == "complete" && done();
    const timer = setTimeout(done, timeoutMs);
    pc.addEventListener("icegatheringstatechange", check);
  });
}
