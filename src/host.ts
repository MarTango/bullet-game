import { initChat } from "./chat";
import { GUEST, HOST, MAX_BUFFERED } from "./config";
import { start } from "./game";
import { display } from "./render";
import { CHANNELS, encodeFrame } from "./protocol";
import { endSession, hasEnded, newConnection, onConnected } from "./session";
import { Link } from "./lobby";
import { waitForIce } from "./signaling";
import { getRemoteClickStream, getRemoteInputStream } from "./streams";
import { $, canvas, ctx, setStatus } from "./ui";

let resetRequested = false;

// Host: the player who sent the challenge. Opens the channels, offers the
// connection and finishes it with the answer.
export async function hostGame(link: Link) {
  setStatus("Connecting…");
  const pc = newConnection();

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
  link.send({ type: "offer", sdp: pc.localDescription.sdp });

  const answer = await link.next("answer");
  await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
  link.leave();
}
