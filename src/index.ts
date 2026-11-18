import { start, display, init } from "./game";
import {
  getClickStream,
  getLocalKeysPressedStream,
  getRemoteClickStream,
  getRemoteKeysPressedStream,
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

async function addTracks(pc: RTCPeerConnection) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    console.log("Added Track");
  } catch (err) {
    console.error(err);
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

function onConnected(role: string) {
  show("setup", false);
  show("reset", role == "host");
  setStatus(`Connected! You are the ${role}.`);
}

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
  await addTracks(pc);
  onTrack(pc, "HOST");

  const channel = pc.createDataChannel("entities");
  const remoteKeysStream = getRemoteKeysPressedStream(channel);
  const remoteClickStream = getRemoteClickStream(channel);

  channel.onopen = () => {
    console.log("HOST: Channel open, starting game and sending entities");
    onConnected("host");
    start({
      board: init(),
      onBoardUpdate: (board) => {
        display(board);
        channel.send(JSON.stringify(board.entities));
      },
      remoteKeysStream,
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
      display({ ctx, entities: JSON.parse(b.data) });
    });

    const clickStream = getClickStream("guest", canvas);
    const keysPressedStream = getLocalKeysPressedStream();
    const beginSending = () => {
      onConnected("guest");
      requestAnimationFrame(function send() {
        if (channel.readyState != "open") {
          return;
        }
        channel.send(
          JSON.stringify({
            keysPressed: Array.from(keysPressedStream.next().value),
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
