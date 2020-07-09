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

async function addTracks(pc: RTCPeerConnection) {
  try {
    await navigator.mediaDevices
      .getUserMedia({
        video: true,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      .then((stream) => {
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        const elt = document.querySelector<HTMLVideoElement>("video#host");
        elt.srcObject = stream;
        elt.autoplay = true;
        elt.muted = true;
        console.log("Added Track");
      });
  } catch (err) {
    console.error(err);
  }
}

function getTrackHandler(name: string) {
  const streams: MediaStream[] = [];
  return (e: RTCTrackEvent) => {
    console.log(`${name} got track`, e);
    const stream = e.streams[0];

    if (streams.indexOf(stream) != -1) {
      return;
    }
    streams.push(stream);

    const elt = document.querySelector<HTMLVideoElement>("video#guest");
    elt.srcObject = stream;
    elt.autoplay = true;
  };
}

const ROOM = "alpha";

document
  .querySelector<HTMLButtonElement>("button#host")
  .addEventListener("click", async function () {
    const sock = io();
    const emit = (msg: object) => sock.emit(ROOM, msg);

    const pc = new RTCPeerConnection(_RTC_CONFIG);
    w.local = pc;
    pc.ontrack = getTrackHandler("HOST");
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
      emit({ to: guest, candidate: e.candidate });
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    let guest: string | undefined;

    let offerPoll = setInterval(() => {
      if (pc.remoteDescription) {
        clearInterval(offerPoll);
      }
      console.log("HOST emitting offer");
      emit({ offer });
    }, 1000);

    // @ts-ignore
    sock.on(ROOM, async ({ to, from, candidate, answer }) => {
      if (to != sock.id) {
        return;
      }
      if (answer) {
        console.log("HOST setting remote description");
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        guest = from;
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
    const sock = io();
    const emit = (msg: any) => sock.emit(ROOM, msg);

    const pc = new RTCPeerConnection(_RTC_CONFIG);
    w.remote = pc;

    pc.addEventListener("icecandidate", ({ candidate }) => {
      if (!candidate) {
        return;
      }
      console.log("REMOTE emitting ice candidate", candidate);
      emit({ to: host, candidate });
    });

    pc.ontrack = getTrackHandler("REMOTE");
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

    let host: number;

    // @ts-ignore
    sock.on(ROOM, async ({ offer, candidate, to, from }) => {
      console.log("REMOTE", { offer, candidate, to, from });
      if (offer && !pc.remoteDescription) {
        host = from;
        console.log("REMOTE got offer");
        console.log("REMOTE setting remote description");
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        console.log("REMOTE Creating answer");
        const answer = await pc.createAnswer();
        console.log("REMOTE setting local description", answer);
        await pc.setLocalDescription(answer);
        console.log("REMOTE emitting answer");
        emit({ to: from, answer, offer });
      } else if (candidate && to == sock.id) {
        console.log("REMOTE got ice candidate");
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });
  });
