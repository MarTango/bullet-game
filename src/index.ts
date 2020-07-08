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

document
  .querySelector<HTMLButtonElement>("button#host")
  .addEventListener("click", async function () {
    const sock = io(SIGNALING_SERVER);

    const pc = new RTCPeerConnection(_RTC_CONFIG);
    w.local = pc;
    onTrack(pc, "HOST");
    await addTracks(pc);

    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        return;
      }
      console.log("HOST Emitting icecandidate for guest", e.candidate);
      sock.emit("icecandidate", e.candidate);
    };

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

    console.log("creating offer");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const offerPoll = setInterval(() => {
      console.log("HOST: emitting offer");
      sock.emit("offer", offer);
    }, 500);

    sock.on("icecandidate", (c: object) => {
      console.log("HOST got icecandidate", c);
      pc.addIceCandidate(c);
    });

    sock.once("answer", async (s: object) => {
      clearInterval(offerPoll);
      console.log("HOST got an answer");
      await pc.setRemoteDescription(s);
      this.disabled = true;
    });

    // pc.onicegatheringstatechange = () =>
    //   console.log("HOST ice gathering state", pc.iceGatheringState);
    // pc.oniceconnectionstatechange = () =>
    //   console.log("HOST ice conn state", pc.iceConnectionState);
    // pc.onconnectionstatechange = () =>
    //   console.log("HOST conn state", pc.connectionState);
    // pc.onsignalingstatechange = () =>
    //   console.log("HOST signaling state", pc.signalingState);
    // pc.onicecandidateerror = (e) =>
    //   console.log("HOST ice candidate error", e.errorText);
  });

document
  .querySelector<HTMLButtonElement>("button#join")
  .addEventListener("click", async function () {
    const sock = io(SIGNALING_SERVER);
    console.log("REMOTE listening for offer");
    sock.once("offer", async (offer: object) => {
      const pc = new RTCPeerConnection(_RTC_CONFIG);
      w.remote = pc;
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

      pc.onicecandidate = (e) => {
        // if (!e.candidate) {
        //   return;
        // }
        console.log("REMOTE emitting ice candidate", e.candidate);
        sock.emit("icecandidate", e.candidate);
      };

      sock.on("icecandidate", async (c: object) => {
        console.log("REMOTE got ice candidate", c);
        await pc.addIceCandidate(c);
      });

      console.log("REMOTE got offer");
      await pc.setRemoteDescription(offer);
      console.log("Creating answer");
      const answer = await pc.createAnswer();
      console.log("REMOTE setting local description", answer);
      await pc.setLocalDescription(answer);
      console.log("Replying with answer");
      sock.emit("answer", answer);
    });
    this.disabled = true;
  });
