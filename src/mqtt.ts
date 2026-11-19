// A tiny MQTT 3.1.1 client over WebSocket, with just what signaling needs:
// connect, subscribe and publish (all at QoS 0). It exists so the game can use
// a free public broker as a message relay without pulling in a library.

const CONNECT = 0x10;
const CONNACK = 0x20;
const PUBLISH = 0x30;
const SUBSCRIBE = 0x82;
const SUBACK = 0x90;
const PINGREQ = 0xc0;
const DISCONNECT = 0xe0;

const KEEP_ALIVE_S = 30;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const string = (s: string) => {
  const bytes = encoder.encode(s);
  return [bytes.length >> 8, bytes.length & 0xff, ...bytes];
};

// The "remaining length" field: 7 bits per byte, high bit means "more follows".
function lengthBytes(n: number) {
  const out: number[] = [];
  do {
    const byte = n & 0x7f;
    n >>= 7;
    out.push(n > 0 ? byte | 0x80 : byte);
  } while (n > 0);
  return out;
}

function packet(type: number, body: ArrayLike<number>) {
  return Uint8Array.from([type, ...lengthBytes(body.length), ...Array.from(body)]);
}

export type MessageHandler = (topic: string, payload: string) => void;

export class MqttClient {
  private pending = new Uint8Array(0);
  private onMessage: MessageHandler = () => {};
  private onClosed: () => void = () => {};
  private acks = new Map<number, () => void>();
  private nextId = 1;
  private onConnack: (returnCode: number) => void = () => {};
  private pinger: ReturnType<typeof setInterval>;
  private closed = false;

  private constructor(private ws: WebSocket) {
    ws.binaryType = "arraybuffer";
    ws.onmessage = (e) => this.receive(new Uint8Array(e.data));
    ws.onclose = () => {
      const unexpected = !this.closed;
      this.stop();
      if (unexpected) {
        this.onClosed();
      }
    };
  }

  // Called if the broker connection drops (not when we close it ourselves).
  onClose(handler: () => void) {
    this.onClosed = handler;
  }

  // Opens a connection, rejecting if the broker can't be reached in time.
  static connect(url: string, timeoutMs = 8000): Promise<MqttClient> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url, "mqtt");
      } catch (err) {
        return reject(err);
      }
      const client = new MqttClient(ws);
      const fail = () => {
        clearTimeout(timer);
        client.close();
        reject(new Error("Couldn't reach the matchmaking server. Try again."));
      };
      const timer = setTimeout(fail, timeoutMs);
      ws.onerror = fail;
      client.onConnack = (code) => (code == 0 ? ok() : fail());
      const ok = () => {
        clearTimeout(timer);
        ws.onerror = null;
        client.pinger = setInterval(
          () => client.send(packet(PINGREQ, [])),
          (KEEP_ALIVE_S * 1000) / 2
        );
        resolve(client);
      };
      ws.onopen = () => {
        const id = "bullet-" + Math.random().toString(36).slice(2, 12);
        client.send(
          packet(CONNECT, [
            ...string("MQTT"),
            4, // protocol level 3.1.1
            0x02, // clean session
            0,
            KEEP_ALIVE_S,
            ...string(id),
          ])
        );
      };
    });
  }

  onPublish(handler: MessageHandler) {
    this.onMessage = handler;
  }

  // Resolves once the broker confirms the subscription, so nothing published
  // afterwards can be missed.
  subscribe(topic: string): Promise<void> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("The matchmaking server didn't respond.")),
        8000
      );
      this.acks.set(id, () => {
        clearTimeout(timer);
        resolve();
      });
      this.send(
        packet(SUBSCRIBE, [id >> 8, id & 0xff, ...string(topic), 0 /* QoS 0 */])
      );
    });
  }

  publish(topic: string, payload: string) {
    this.send(packet(PUBLISH, [...string(topic), ...encoder.encode(payload)]));
  }

  close() {
    if (this.closed) {
      return;
    }
    this.send(packet(DISCONNECT, []));
    this.stop();
    this.ws.close();
  }

  private stop() {
    this.closed = true;
    clearInterval(this.pinger);
  }

  private send(bytes: Uint8Array) {
    if (this.ws.readyState == WebSocket.OPEN) {
      this.ws.send(bytes);
    }
  }

  // Packets can be split or joined arbitrarily, so buffer and cut them out.
  private receive(chunk: Uint8Array) {
    const all = new Uint8Array(this.pending.length + chunk.length);
    all.set(this.pending);
    all.set(chunk, this.pending.length);

    let pos = 0;
    while (pos < all.length) {
      let length = 0;
      let shift = 0;
      let i = pos + 1;
      let byte: number;
      do {
        if (i >= all.length) {
          this.pending = all.slice(pos);
          return;
        }
        byte = all[i++];
        length |= (byte & 0x7f) << shift;
        shift += 7;
      } while (byte & 0x80);
      if (i + length > all.length) {
        break;
      }
      this.handle(all[pos], all.subarray(i, i + length));
      pos = i + length;
    }
    this.pending = all.slice(pos);
  }

  private handle(header: number, body: Uint8Array) {
    const type = header & 0xf0;
    if (type == CONNACK) {
      this.onConnack(body[1]);
    } else if (type == SUBACK) {
      const id = (body[0] << 8) | body[1];
      const ack = this.acks.get(id);
      this.acks.delete(id);
      ack?.();
    } else if (type == PUBLISH) {
      const topicLength = (body[0] << 8) | body[1];
      const qos = (header >> 1) & 3;
      const payloadStart = 2 + topicLength + (qos > 0 ? 2 : 0);
      this.onMessage(
        decoder.decode(body.subarray(2, 2 + topicLength)),
        decoder.decode(body.subarray(payloadStart))
      );
    }
  }
}
