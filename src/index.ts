import { start, display, init } from "./game";
import {
  getClickStream,
  getLocalKeysPressedStream,
  getRemoteClickStream,
  getLocalStickStream,
  getRemoteKeysPressedStream,
  getRemoteStickStream,
  setStick,
} from "./streams";
import { initChat } from "./chat";
import { decodeFrame, encodeFrame, isNewer } from "./protocol";
import { decodeCode, encodeCode, waitForIce } from "./signaling";

const w: any = window;

// STUN finds each player's public address for a direct connection. The Metered
// TURN relay is the fallback for networks where that fails (strict NATs, some
// mobile carriers). The credential is injected at build time from .env or CI
// secrets, so it isn't in the repo, but it is readable in the deployed bundle:
// rotate it in the Metered dashboard if it's abused. Without it we use STUN only.
const TURN_URLS = [
  "turn:global.relay.metered.ca:80",
  "turn:global.relay.metered.ca:80?transport=tcp",
  "turn:global.relay.metered.ca:443",
  "turns:global.relay.metered.ca:443?transport=tcp",
];

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.relay.metered.ca:80" },
  ...(__TURN_USERNAME__ && __TURN_CREDENTIAL__
    ? TURN_URLS.map((urls) => ({
        urls,
        username: __TURN_USERNAME__,
        credential: __TURN_CREDENTIAL__,
      }))
    : []),
];

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const setStatus = (msg: string, isError = false) => {
  const el = $("status");
  el.textContent = msg;
  el.style.color = isError ? "crimson" : "";
};

const show = (id: string, visible = true) =>
  ($(id).style.display = visible ? "" : "none");

// Don't queue more than this many bytes of game state for a slow connection.
const MAX_BUFFERED = 16 * 1024;

let wasConnected = false;
let connectionEnded = false;
let unstable = false;

// The connection is gone for good: stop the game, put the controls away and
// offer a way back to the start. Safe to call more than once.
function endConnection() {
  if (connectionEnded) {
    return;
  }
  connectionEnded = true;
  setStick(0, 0);
  document.body.classList.remove("playing");
  ["reset", "stick", "chat-toggle", "chat"].forEach((id) => show(id, false));
  show("restart");
  setStatus(
    wasConnected
      ? "The other player disconnected."
      : "Connection failed. Some networks block direct connections, so try again.",
    true
  );
}

function newConnection(name: string) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  w.pc = pc;
  pc.addEventListener("connectionstatechange", () => {
    const state = pc.connectionState;
    if (state == "failed" || state == "closed") {
      endConnection();
    } else if (state == "disconnected" && wasConnected && !connectionEnded) {
      // Often a brief network blip that recovers by itself.
      unstable = true;
      setStatus("Connection unstable…", true);
    } else if (state == "connected" && unstable && !connectionEnded) {
      unstable = false;
      setStatus("Reconnected.");
    }
  });
  return pc;
}

// iOS Safari ignores `touch-action` for page scrolling in places, so also
// cancel touch scrolling directly while a game is running.
document.addEventListener(
  "touchmove",
  (e) => {
    const target = e.target as HTMLElement;
    if (
      document.body.classList.contains("playing") &&
      !target.closest("#chat-log")
    ) {
      e.preventDefault();
    }
  },
  { passive: false }
);

function onConnected(role: string) {
  wasConnected = true;
  document.body.classList.add("playing");
  show("setup", false);
  show("reset", role == "host");
  if (isTouchDevice) {
    show("stick");
    setStatus(
      `Connected! You are the ${role}. Use the stick to move and tap the arena to shoot.`
    );
  } else {
    setStatus(`Connected! You are the ${role}.`);
  }
}

const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;

// On-screen analog stick: drag the knob; tilt direction and strength set the
// movement direction and speed. Pointer capture keeps tracking the finger
// even if it slides outside the base.
(function wireStick() {
  const base = $("stick");
  const knob = $("knob");
  const DEAD_ZONE = 0.15;
  let activePointer: number | null = null;

  const update = (e: PointerEvent) => {
    const rect = base.getBoundingClientRect();
    const travel = rect.width / 2 - knob.offsetWidth / 2;
    let nx = (e.clientX - (rect.left + rect.width / 2)) / travel;
    let ny = (e.clientY - (rect.top + rect.height / 2)) / travel;
    const len = Math.hypot(nx, ny);
    if (len > 1) {
      nx /= len;
      ny /= len;
    }
    knob.style.transform = `translate(${nx * travel}px, ${ny * travel}px)`;
    // Screen y points down, board y points up.
    setStick(
      Math.hypot(nx, ny) < DEAD_ZONE ? 0 : nx,
      Math.hypot(nx, ny) < DEAD_ZONE ? 0 : -ny
    );
  };

  const release = (e: PointerEvent) => {
    if (e.pointerId !== activePointer) {
      return;
    }
    activePointer = null;
    knob.style.transform = "";
    setStick(0, 0);
  };

  base.addEventListener("pointerdown", (e) => {
    if (activePointer !== null) {
      return;
    }
    e.preventDefault();
    activePointer = e.pointerId;
    base.setPointerCapture(e.pointerId);
    update(e);
  });
  base.addEventListener("pointermove", (e) => {
    if (e.pointerId === activePointer) {
      update(e);
    }
  });
  base.addEventListener("pointerup", release);
  base.addEventListener("pointercancel", release);
  base.addEventListener("contextmenu", (e) => e.preventDefault());
})();

function wireCopy(buttonId: string, textareaId: string) {
  $(buttonId).onclick = async () => {
    const ta = $<HTMLTextAreaElement>(textareaId);
    ta.select();
    try {
      await navigator.clipboard.writeText(ta.value);
      setStatus("Copied to clipboard.");
    } catch (e) {
      document.execCommand("copy");
    }
  };
}

let reset = false;
let busy = false;

// Runs an async UI action, preventing double clicks and reporting errors.
function guarded(fn: () => Promise<void>) {
  return async () => {
    if (busy) {
      return;
    }
    busy = true;
    try {
      await fn();
    } catch (err) {
      console.error(err);
      setStatus(err.message || String(err), true);
    } finally {
      busy = false;
    }
  };
}

// ---------- Host ----------

let hostPc: RTCPeerConnection;

async function createGame() {
  show("choose", false);
  show("host-flow");
  setStatus("Creating game code…");

  const pc = (hostPc = newConnection("host"));

  // Game state is sent every frame, so a lost packet is better skipped than
  // retransmitted (the next frame replaces it): unordered, no retries.
  const channel = pc.createDataChannel("entities", {
    ordered: false,
    maxRetransmits: 0,
  });
  // Clicks are one-off events, so they get a reliable channel of their own.
  const events = pc.createDataChannel("events");
  initChat(pc.createDataChannel("chat"), "Red", "Yellow");
  const remoteKeysStream = getRemoteKeysPressedStream(channel);
  const remoteStickStream = getRemoteStickStream(channel);
  const remoteClickStream = getRemoteClickStream(events);

  channel.onclose = endConnection;
  events.onclose = endConnection;
  let seq = 0;

  channel.onopen = () => {
    console.log("HOST: Channel open, starting game and sending entities");
    onConnected("host");
    start({
      board: init(),
      onBoardUpdate: (board) => {
        display(board);
        // Skip a frame rather than queue it if the link can't keep up.
        if (channel.readyState == "open" && channel.bufferedAmount < MAX_BUFFERED) {
          channel.send(encodeFrame(seq++, board.score, board.entities));
        }
      },
      remoteKeysStream,
      remoteStickStream,
      remoteClickStream,
      shouldReset: () => reset,
      reset: () => (reset = false),
      shouldStop: () => connectionEnded,
    });
  };

  $("reset").onclick = () => (reset = true);

  await pc.setLocalDescription(await pc.createOffer());
  await waitForIce(pc);

  $<HTMLTextAreaElement>("offer-out").value = await encodeCode(
    "O",
    pc.localDescription
  );
  setStatus(
    "Send the game code to your friend, then paste the answer code they send back."
  );
}

async function acceptAnswer() {
  const answer = await decodeCode(
    "A",
    $<HTMLTextAreaElement>("answer-in").value
  );
  await hostPc.setRemoteDescription(answer);
  setStatus("Connecting…");
}

// ---------- Guest ----------

async function createAnswer() {
  const offer = await decodeCode("O", $<HTMLTextAreaElement>("offer-in").value);
  setStatus("Creating answer code…");

  const pc = newConnection("guest");
  let events: RTCDataChannel;
  pc.ondatachannel = (e) => {
    console.log("Got datachannel from host", e);
    const channel = e.channel;
    if (channel.label == "chat") {
      initChat(channel, "Yellow", "Red");
      return;
    }
    if (channel.label == "events") {
      events = channel;
      channel.addEventListener("close", endConnection);
      return;
    }

    const canvas: HTMLCanvasElement = document.querySelector("canvas");
    const ctx = canvas.getContext("2d");

    channel.binaryType = "arraybuffer";
    channel.addEventListener("close", endConnection);
    let lastSeq: number | null = null;
    channel.addEventListener("message", (b: MessageEvent) => {
      if (!(b.data instanceof ArrayBuffer)) {
        return;
      }
      const frame = decodeFrame(b.data);
      // Drop malformed frames, and frames that arrive after a newer one.
      if (!frame || (lastSeq !== null && !isNewer(frame.seq, lastSeq))) {
        return;
      }
      lastSeq = frame.seq;
      display({ ctx, entities: frame.entities, score: frame.score });
    });

    const clickStream = getClickStream("guest", canvas);
    const keysPressedStream = getLocalKeysPressedStream();
    const stickStream = getLocalStickStream();
    let n = 0;
    const beginSending = () => {
      onConnected("guest");
      requestAnimationFrame(function send() {
        if (channel.readyState != "open") {
          return;
        }
        // Input state goes out every frame (a lost one is replaced by the
        // next), numbered so the host can ignore any that arrive out of order.
        if (channel.bufferedAmount < MAX_BUFFERED) {
          channel.send(
            JSON.stringify({
              n: n++,
              keysPressed: Array.from(keysPressedStream.next().value),
              stick: { ...stickStream.next().value },
            })
          );
        }
        // Clicks are events and must not be lost: reliable channel, and
        // drain every click queued since the last frame.
        let click;
        while ((click = clickStream.next().value)) {
          if (events && events.readyState == "open") {
            events.send(JSON.stringify({ click }));
          }
        }
        requestAnimationFrame(send);
      });
    };
    if (channel.readyState == "open") {
      beginSending();
    } else {
      channel.addEventListener("open", beginSending);
    }
  };

  await pc.setRemoteDescription(offer);
  await pc.setLocalDescription(await pc.createAnswer());
  await waitForIce(pc);

  $<HTMLTextAreaElement>("answer-out").value = await encodeCode(
    "A",
    pc.localDescription
  );
  show("answer-out-wrap");
  setStatus("Send this answer code back to the host. The game starts once they paste it.");
}

// ---------- UI wiring ----------

$("restart").onclick = () => location.reload();
$("create-game").onclick = guarded(createGame);
$("accept-answer").onclick = guarded(acceptAnswer);
$("join-game").onclick = () => {
  show("choose", false);
  show("guest-flow");
  setStatus("Paste the game code from the host.");
};
$("create-answer").onclick = guarded(createAnswer);
wireCopy("copy-offer", "offer-out");
wireCopy("copy-answer", "answer-out");
