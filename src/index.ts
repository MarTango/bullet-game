import * as io from "socket.io-client";
import { start, display, init } from "./game";
import {
  getClickStream,
  getLocalKeysPressedStream,
  getRemoteClickStream,
  getRemoteKeysPressedStream,
} from "./streams";

let w: any = window;

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302"] },
    {
      urls: ["turn:relay.backups.cz"],
      credential: "webrtc",
      username: "webrtc",
    },
  ],
};
const SIGNALING_SERVER = "https://marchat.herokuapp.com";

async function addTracks(pc: RTCPeerConnection) {
  try {
    await navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        console.log("Added Track");
      });
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

const ROOM = "alpha";
const sock = io(SIGNALING_SERVER);
const emit = (msg: object) => sock.emit(ROOM, msg);

let pc: RTCPeerConnection;

let reset = false;

setTimeout(() => {
  emit({ connected: "Yep, I connected" });
  // @ts-ignore
  sock.on(ROOM, async ({ from, connected, candidate, to, offer, answer }) => {
    console.log({ from, connected, candidate, to, offer, answer });
    if (connected && !pc) {
      pc = new RTCPeerConnection(RTC_CONFIG);
      w.pc = pc;
      await addTracks(pc);
      onTrack(pc, "HOST");
      const channel = pc.createDataChannel("entities");
      const remoteKeysStream = getRemoteKeysPressedStream(channel);
      const remoteClickStream = getRemoteClickStream(channel);

      channel.onopen = () => {
        console.log("HOST: Channel open, starting game and sending entities");
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

      document.querySelector<HTMLButtonElement>("button#reset").onclick = () =>
        (reset = true);

      pc.onicecandidate = ({ candidate }) => {
        if (!candidate) {
          return;
        }
        emit({ candidate, to: from });
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      emit({ to: connected, offer });
    } else if (candidate && pc && to == sock.id) {
      await pc.addIceCandidate(candidate);
    } else if (offer && !pc) {
      pc = new RTCPeerConnection(RTC_CONFIG);
      w.pc = pc;
      pc.ondatachannel = (e) => {
        console.log("Got datachannel from host", e);
        const canvas: HTMLCanvasElement = document.querySelector("canvas");
        const ctx = canvas.getContext("2d");
        e.channel.addEventListener("message", (b: MessageEvent) => {
          const entities = JSON.parse(b.data);
          const board = {
            ctx,
            entities,
          };
          display(board);
        });
        const clickStream = getClickStream("guest", canvas);
        const keysPressedStream = getLocalKeysPressedStream();
        requestAnimationFrame(function send() {
          e.channel.send(
            JSON.stringify({
              keysPressed: [...keysPressedStream.next().value],
              click: clickStream.next().value,
            })
          );
          requestAnimationFrame(send);
        });
      };

      await addTracks(pc);
      onTrack(pc, "GUEST");
      pc.onicecandidate = ({ candidate }) => {
        if (!candidate) {
          return;
        }
        emit({ candidate, to: from });
      };
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      emit({ answer, to: from });
    } else if (answer && pc && to == sock.id) {
      await pc.setRemoteDescription(answer);
    }
  });
}, 1000);
