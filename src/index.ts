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
import { decodeCode, encodeCode, waitForIce } from "./signaling";

const w: any = window;

// STUN only. Without a TURN relay, a minority of strict NATs can't connect.
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
};

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const setStatus = (msg: string, isError = false) => {
  const el = $("status");
  el.textContent = msg;
  el.style.color = isError ? "crimson" : "";
};

const show = (id: string, visible = true) =>
  ($(id).style.display = visible ? "" : "none");

const MIC_TIMEOUT_MS = 15000;

// Our own mic tracks, kept so the mute button can switch them off.
const localTracks: MediaStreamTrack[] = [];

function setMuted(muted: boolean) {
  // Disabling a track sends silence without renegotiating the connection.
  localTracks.forEach((t) => (t.enabled = !muted));
  $("mute").textContent = muted ? "Unmute mic" : "Mute mic";
  $("mic-note").textContent = muted
    ? "Microphone muted."
    : "Microphone on: voice chat enabled.";
}

// Adds the local mic to the connection. Resolves false (never throws) if the
// mic is denied, missing, or the permission prompt is left unanswered, so the
// game can always continue without voice chat.
async function addTracks(pc: RTCPeerConnection): Promise<boolean> {
  let timedOut = false;
  let timer: number;
  try {
    $("mic-note").textContent =
      "Waiting for microphone permission (you can play without it)…";
    const request = navigator.mediaDevices.getUserMedia({ audio: true });
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => {
        timedOut = true;
        reject(new Error("Microphone permission prompt timed out"));
      }, MIC_TIMEOUT_MS);
    });
    // If the prompt is answered after we gave up, release the mic again.
    request.then(
      (s) => timedOut && s.getTracks().forEach((t) => t.stop()),
      () => {}
    );
    const stream = await Promise.race([request, timeout]);
    stream.getTracks().forEach((t) => {
      pc.addTrack(t, stream);
      localTracks.push(t);
    });
    $("mic-note").textContent = "Microphone on: voice chat enabled.";
    return true;
  } catch (err) {
    console.error(err);
    $("mic-note").textContent = "Microphone unavailable: voice chat is off for you.";
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function onTrack(pc: RTCPeerConnection, name: string) {
  pc.addEventListener("track", (e) => {
    console.log(`${name} got track`, e);
    const elt = document.createElement("audio");
    elt.srcObject = e.streams[0];
    elt.autoplay = true;
    elt.controls = true;
    document.body.appendChild(elt);
  });
}

function newConnection(name: string) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  w.pc = pc;
  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState == "failed") {
      setStatus(
        "Connection failed. Reload the page and try again (some networks block direct connections).",
        true
      );
    } else if (pc.connectionState == "disconnected") {
      setStatus("Disconnected.", true);
    }
  });
  return pc;
}

// iOS Safari ignores `touch-action` for page scrolling in places, so also
// cancel touch scrolling directly while a game is running.
document.addEventListener(
  "touchmove",
  (e) => {
    if (document.body.classList.contains("playing")) {
      e.preventDefault();
    }
  },
  { passive: false }
);

function onConnected(role: string) {
  document.body.classList.add("playing");
  show("setup", false);
  show("reset", role == "host");
  show("mute", localTracks.length > 0);
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
  // Without a mic we still need an audio section in the offer, otherwise a
  // guest with a mic would have nowhere to send their audio.
  if (!(await addTracks(pc))) {
    pc.addTransceiver("audio", { direction: "recvonly" });
  }
  onTrack(pc, "HOST");

  const channel = pc.createDataChannel("entities");
  const remoteKeysStream = getRemoteKeysPressedStream(channel);
  const remoteStickStream = getRemoteStickStream(channel);
  const remoteClickStream = getRemoteClickStream(channel);

  channel.onopen = () => {
    console.log("HOST: Channel open, starting game and sending entities");
    onConnected("host");
    start({
      board: init(),
      onBoardUpdate: (board) => {
        display(board);
        channel.send(
          JSON.stringify({ entities: board.entities, score: board.score })
        );
      },
      remoteKeysStream,
      remoteStickStream,
      remoteClickStream,
      shouldReset: () => reset,
      reset: () => (reset = false),
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
  pc.ondatachannel = (e) => {
    console.log("Got datachannel from host", e);
    const channel = e.channel;
    const canvas: HTMLCanvasElement = document.querySelector("canvas");
    const ctx = canvas.getContext("2d");

    channel.addEventListener("message", (b: MessageEvent) => {
      const { entities, score } = JSON.parse(b.data);
      display({ ctx, entities, score });
    });

    const clickStream = getClickStream("guest", canvas);
    const keysPressedStream = getLocalKeysPressedStream();
    const stickStream = getLocalStickStream();
    const beginSending = () => {
      onConnected("guest");
      requestAnimationFrame(function send() {
        if (channel.readyState != "open") {
          return;
        }
        channel.send(
          JSON.stringify({
            keysPressed: Array.from(keysPressedStream.next().value),
            stick: { ...stickStream.next().value },
            click: clickStream.next().value,
          })
        );
        requestAnimationFrame(send);
      });
    };
    if (channel.readyState == "open") {
      beginSending();
    } else {
      channel.addEventListener("open", beginSending);
    }
  };

  await addTracks(pc);
  onTrack(pc, "GUEST");

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

$("mute").onclick = () => setMuted(localTracks.some((t) => t.enabled));
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
