// The lobby: who is online, and a way to message them. Players announce
// themselves on a shared topic every few seconds and drop off the list when
// the announcements stop. No DOM in here, only the network side.

import { MqttClient } from "./mqtt";
import {
  BROKER_URL,
  Direct,
  From,
  inboxTopic,
  lobbyTopic,
  Mailbox,
  newPlayerId,
  parseAnnouncement,
  parseDirect,
} from "./signaling";

const HEARTBEAT_MS = 8000;
const STALE_MS = 20000;
const OFFER_TIMEOUT_MS = 20000;

export interface Player {
  id: string;
  name: string;
  busy: boolean;
}

// A conversation with one other player, used to swap connection details.
export interface Link {
  send(message: Direct): void;
  next<T extends Direct["type"]>(
    type: T,
    timeoutMs?: number
  ): Promise<Extract<Direct, { type: T }>>;
  // Done with the lobby: tell everyone we're gone and drop the broker.
  leave(): void;
}

export interface Lobby {
  id: string;
  send(to: string, message: Direct): void;
  setBusy(busy: boolean): void;
  link(peerId: string): Link;
  leave(): void;
}

interface Options {
  room: string;
  name: string;
  onPlayers(players: Player[]): void;
  // A challenge, an acceptance, etc. (offers and answers go to `link` instead)
  onDirect(message: From<Direct>): void;
  onLost(): void;
}

export async function enterLobby(options: Options): Promise<Lobby> {
  const { room, name } = options;
  const id = newPlayerId();
  const lobbyT = lobbyTopic(room);
  const inboxT = inboxTopic(room, id);

  const client = await MqttClient.connect(BROKER_URL);
  const seen = new Map<string, Player & { lastSeen: number }>();
  const mailboxes = new Map<string, Mailbox>();
  const mailbox = (peer: string) => {
    if (!mailboxes.has(peer)) {
      mailboxes.set(peer, new Mailbox());
    }
    return mailboxes.get(peer);
  };
  let busy = false;
  let left = false;

  const say = (message: object) =>
    client.publish(lobbyT, JSON.stringify({ ...message, from: id }));
  const announce = () => say({ type: "presence", name, busy });
  const publishPlayers = () =>
    options.onPlayers(
      Array.from(seen.values(), ({ id, name, busy }) => ({ id, name, busy })).sort(
        (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
      )
    );

  client.onPublish((topic, payload) => {
    if (topic == lobbyT) {
      const message = parseAnnouncement(payload);
      if (!message || message.from == id) {
        return;
      }
      if (message.type == "presence") {
        seen.set(message.from, {
          id: message.from,
          name: message.name,
          busy: message.busy,
          lastSeen: Date.now(),
        });
        publishPlayers();
      } else if (message.type == "bye") {
        seen.delete(message.from) && publishPlayers();
      } else {
        announce(); // "who": a newcomer wants to know who is here
      }
    } else if (topic == inboxT) {
      const message = parseDirect(payload);
      if (!message) {
        return;
      }
      if (message.type == "offer" || message.type == "answer") {
        mailbox(message.from).push(message);
      } else {
        options.onDirect(message);
      }
    }
  });

  await client.subscribe(lobbyT);
  await client.subscribe(inboxT);
  announce();
  say({ type: "who" });

  const heartbeat = setInterval(() => {
    announce();
    let changed = false;
    seen.forEach((player, key) => {
      if (Date.now() - player.lastSeen > STALE_MS) {
        seen.delete(key);
        changed = true;
      }
    });
    changed && publishPlayers();
  }, HEARTBEAT_MS);

  const leave = () => {
    if (left) {
      return;
    }
    left = true;
    clearInterval(heartbeat);
    say({ type: "bye" });
    client.close();
  };
  client.onClose(() => {
    clearInterval(heartbeat);
    options.onLost();
  });
  window.addEventListener("pagehide", leave);

  const send = (to: string, message: Direct) =>
    client.publish(inboxTopic(room, to), JSON.stringify({ ...message, from: id }));

  return {
    id,
    send,
    setBusy(value) {
      busy = value;
      announce();
    },
    link: (peerId) => ({
      send: (message) => send(peerId, message),
      next: (type, timeoutMs = OFFER_TIMEOUT_MS) =>
        mailbox(peerId).next(type, timeoutMs),
      leave,
    }),
    leave,
  };
}
