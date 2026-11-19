import { initChat } from "./chat";
import { GUEST, MAX_BUFFERED } from "./config";
import { display } from "./render";
import {
  CHANNELS,
  decodeFrame,
  encodeClick,
  encodeInput,
  isNewer,
} from "./protocol";
import { endSession, newConnection, onConnected } from "./session";
import { Link } from "./lobby";
import { waitForIce } from "./signaling";
import { drain, getClickStream, getLocalInputStream } from "./streams";
import { canvas, ctx, setStatus } from "./ui";

// Draws each game frame the host sends, skipping malformed or out-of-date ones.
function showHostState(state: RTCDataChannel) {
  let lastSeq: number | null = null;

  state.binaryType = "arraybuffer";
  state.addEventListener("message", ({ data }) => {
    const frame = data instanceof ArrayBuffer ? decodeFrame(data) : null;
    if (!frame || (lastSeq !== null && !isNewer(frame.seq, lastSeq))) {
      return;
    }
    lastSeq = frame.seq;
    display(ctx, frame);
  });
}

// Every frame, tells the host what this player's controls are doing.
function sendInput(state: RTCDataChannel, getEvents: () => RTCDataChannel) {
  const input = getLocalInputStream();
  const clicks = getClickStream(GUEST, canvas);
  let n = 0;

  requestAnimationFrame(function send() {
    if (state.readyState != "open") {
      return;
    }
    // Input is state: a lost message is replaced by the next one, and the
    // number lets the host ignore any that arrive out of order.
    if (state.bufferedAmount < MAX_BUFFERED) {
      const { keys, stick } = input.next().value;
      state.send(encodeInput({ n: n++, keys: Array.from(keys), stick }));
    }
    // Clicks are events and must not be lost: they go on the reliable
    // channel, every one queued since the last frame.
    const events = getEvents();
    if (events && events.readyState == "open") {
      drain(clicks).forEach((click) => events.send(encodeClick(click)));
    }
    requestAnimationFrame(send);
  });
}

// Guest: the player who accepted a challenge. Waits for the host's offer and
// answers it.
export async function joinGame(link: Link) {
  setStatus("Connecting…");
  const pc = newConnection();
  let events: RTCDataChannel;

  pc.ondatachannel = ({ channel }) => {
    switch (channel.label) {
      case CHANNELS.chat:
        initChat(channel, GUEST);
        break;
      case CHANNELS.events:
        events = channel;
        channel.addEventListener("close", endSession);
        break;
      case CHANNELS.state: {
        showHostState(channel);
        channel.addEventListener("close", endSession);
        const begin = () => {
          onConnected(GUEST);
          sendInput(channel, () => events);
        };
        if (channel.readyState == "open") {
          begin();
        } else {
          channel.addEventListener("open", begin);
        }
        break;
      }
    }
  };

  const offer = await link.next("offer");
  await pc.setRemoteDescription({ type: "offer", sdp: offer.sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await waitForIce(pc);
  link.send({ type: "answer", sdp: pc.localDescription.sdp });
  link.leave();
}
