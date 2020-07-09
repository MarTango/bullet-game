import * as io from "socket.io-client";
import { start, display, init } from "./game";
import {
  getClickStream,
  getLocalKeysPressedStream,
  getRemoteClickStream,
  getRemoteKeysPressedStream,
} from "./streams";

let w: any = window;

const _RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
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

document
  .querySelector<HTMLButtonElement>("button#host")
  .addEventListener("click", async function () {
    const sock = io(SIGNALING_SERVER);
    const emit = (msg: object) => sock.emit(ROOM, msg);

    const pc = new RTCPeerConnection(_RTC_CONFIG);
    w.local = pc;
    onTrack(pc, "HOST");
    await addTracks(pc);

    console.log("HOST Setting up datachannel");
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
        pc,
      });
    };

    pc.addEventListener("icecandidate", (e) => {
      if (!e.candidate) {
        return;
      }
      console.log("HOST Emitting icecandidate", e.candidate);
      emit({ candidate: e.candidate });
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    let offerPoll = setInterval(() => {
      if (pc.remoteDescription) {
        clearInterval(offerPoll);
      }
      console.log("HOST emitting offer");
      emit({ offer });
    }, 1000);
    const myOffer = offer;

    // @ts-ignore
    sock.on(ROOM, async ({ offer, candidate, answer }) => {
      console.log("HOST", { offer, candidate, answer });
      if (answer && offer.sdp == myOffer.sdp) {
        console.log("HOST setting remote description");
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        return;
      }
      if (candidate) {
        console.log("HOST got candidate");
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });
  });

document
  .querySelector<HTMLButtonElement>("button#join")
  .addEventListener("click", async function () {
    const sock = io(SIGNALING_SERVER);
    const emit = (msg: any) => sock.emit(ROOM, msg);

    const pc = new RTCPeerConnection(_RTC_CONFIG);
    w.remote = pc;

    pc.addEventListener("icecandidate", ({ candidate }) => {
      if (!candidate) {
        return;
      }
      console.log("REMOTE emitting ice candidate", candidate);
      emit({ candidate });
    });

    onTrack(pc, "REMOTE");
    await addTracks(pc);
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

    // @ts-ignore
    sock.on(ROOM, async ({ offer, candidate }) => {
      console.log("REMOTE", { offer, candidate });
      if (offer && !pc.remoteDescription) {
        console.log("REMOTE got offer");
        console.log("REMOTE setting remote description");
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        console.log("REMOTE Creating answer");
        const answer = await pc.createAnswer();
        console.log("REMOTE setting local description", answer);
        await pc.setLocalDescription(answer);
        console.log("REMOTE emitting answer");
        emit({ answer, offer });
      } else if (candidate) {
        console.log("REMOTE got ice candidate");
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });
  });
