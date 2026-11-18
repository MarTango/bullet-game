import { initChat } from "./chat";
import { GUEST, HOST, MAX_BUFFERED } from "./config";
import { start } from "./game";
import { display } from "./render";
import { CHANNELS, encodeFrame } from "./protocol";
import { endSession, hasEnded, newConnection, onConnected } from "./session";
import { decodeCode, encodeCode, waitForIce } from "./signaling";
import { getRemoteClickStream, getRemoteInputStream } from "./streams";
import { $, canvas, ctx, setStatus, show } from "./ui";

let pc: RTCPeerConnection;
let resetRequested = false;

// Step 1 for the host: open the channels, make an offer and show it as a code.
export async function createGame() {
  show("choose", false);
  show("host-flow");
  setStatus("Creating game code…");

  pc = newConnection();

  // Game state is sent every frame, so a lost packet is better skipped than
  // retransmitted (the next frame replaces it): unordered, no retries.
  const state = pc.createDataChannel(CHANNELS.state, {
    ordered: false,
    maxRetransmits: 0,
  });
  // Clicks are one-off events, so they get a reliable channel of their own.
  const events = pc.createDataChannel(CHANNELS.events);
  initChat(pc.createDataChannel(CHANNELS.chat), HOST);

  state.onclose = endSession;
  events.onclose = endSession;

  let seq = 0;
  state.onopen = () => {
    onConnected(HOST);
    start({
      canvas,
      onBoardUpdate: (board) => {
        display(ctx, board);
        // Skip a frame rather than queue it if the link can't keep up.
        if (state.readyState == "open" && state.bufferedAmount < MAX_BUFFERED) {
          state.send(encodeFrame(seq++, board.score, board.entities));
        }
      },
      remoteInput: getRemoteInputStream(state),
      remoteClicks: getRemoteClickStream(events, GUEST),
      consumeReset: () => {
        const requested = resetRequested;
        resetRequested = false;
        return requested;
      },
      shouldStop: hasEnded,
    });
  };

  $("reset").onclick = () => (resetRequested = true);

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

// Step 2 for the host: take the guest's answer code and finish connecting.
export async function acceptAnswer() {
  const answer = await decodeCode(
    "A",
    $<HTMLTextAreaElement>("answer-in").value
  );
  await pc.setRemoteDescription(answer);
  setStatus("Connecting…");
}
