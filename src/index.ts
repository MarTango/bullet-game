import * as io from "socket.io-client";

import {
  dtStream,
  getClickStream,
  getRemoteKeysPressedStream,
  getRemoteClickStream,
  getLocalKeysPressedStream,
} from "./streams";
import {
  afterBouncing,
  afterCollisions,
  afterTimeStep,
  afterKeysPressed,
  afterClicks,
} from "./transformations";
import { Entity, Msg, State } from "./types";

function startGame({
  board,
  onBoardUpdate,
  remoteKeysStream,
  remoteClickStream,
}: {
  board: State;
  onBoardUpdate: (b: State) => void;
  remoteKeysStream: ReturnType<typeof getLocalKeysPressedStream>;
  remoteClickStream: Iterator<Msg["clicks"][0]>;
}) {
  const id = "host";

  // Composition of all transformers
  const update: (e: Msg) => Msg = [
    afterClicks,
    afterKeysPressed,
    afterCollisions,
    afterBouncing,
    afterTimeStep,
  ].reduce((f, g) => {
    return (msg: Msg) => f(g(msg));
  });

  const clickStream = getClickStream(id, board.ctx.canvas);
  const keysPressedStream = getLocalKeysPressedStream();

  requestAnimationFrame(async function frame() {
    await new Promise((r, _) => setTimeout(r, 10));

    const msg: Msg = {
      board,
      dt: dtStream.next().value,
      keys: {
        host: keysPressedStream.next().value,
        guest: remoteKeysStream.next().value,
      },
      clicks: [clickStream.next().value, remoteClickStream.next().value].filter(
        (c) => c
      ),
    };
    board = update(msg).board;
    onBoardUpdate(board);

    requestAnimationFrame(frame);
  });
}

function display(s: State) {
  const { height: h, width: w } = s.ctx.canvas;
  s.ctx.clearRect(0, 0, w, h);
  s.entities.forEach((b) => {
    s.ctx.beginPath();
    s.ctx.arc(b.x, h - b.y, b.r, 0, 2 * Math.PI);
    s.ctx.fillStyle = b.color;
    s.ctx.fill();
    s.ctx.strokeStyle = "black";
    s.ctx.stroke();
    s.ctx.closePath();
  });
}

function init(): State {
  const canvas: HTMLCanvasElement = document.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  const players: Entity[] = [
    {
      id: "host",
      x: w / 8,
      y: Math.random() * h,
      r: 10,
      vx: 0,
      vy: 0,
      color: "red",
    },
    {
      id: "guest",
      x: (w * 7) / 8,
      y: Math.random() * h,
      r: 10,
      vx: 0,
      vy: 0,
      color: "yellow",
    },
  ];

  return {
    ctx,
    entities: players,
  };
}

const _RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
};

const SIGNALING_SERVER = "https://marchat.herokuapp.com";
document
  .querySelector<HTMLButtonElement>("button#host")
  .addEventListener("click", async function (_) {
    const sock = io(SIGNALING_SERVER);
    console.log("Setting up peer connection, creating offer");
    const pc = new RTCPeerConnection(_RTC_CONFIG);

    pc.ontrack = (e) => {
      console.log("Host got track", e);
      const elt = document.createElement("audio");
      elt.srcObject = e.streams[0];
      elt.autoplay = true;
      elt.controls = true;
      document.body.appendChild(elt);
    };

    pc.ondatachannel = (e) =>
      console.log("Received datachannel from remote", e);
    pc.onicegatheringstatechange = () =>
      console.log("Host ice gathering state", pc.iceGatheringState);

    pc.oniceconnectionstatechange = () => {
      console.log("Host ice conn state change", pc.iceConnectionState);
    };

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    const channel = pc.createDataChannel("entities");
    const remoteKeysStream = getRemoteKeysPressedStream(channel);
    const remoteClickStream = getRemoteClickStream(channel);

    channel.onopen = (_) => {
      console.log("Channel open, starting game and sending entities");
      startGame({
        board: init(),
        onBoardUpdate: (board) => {
          display(board);
          channel.send(JSON.stringify(board.entities));
        },
        remoteKeysStream,
        remoteClickStream,
      });
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const offerPoll = setInterval(() => {
      console.log("Emitting host offer");
      sock.emit("offer", JSON.stringify(offer));
    }, 500);

    sock.once("answer", async (s: string) => {
      console.log("Host got an answer");
      await pc.setRemoteDescription(JSON.parse(s));

      sock.on("icecandidate", (c: string) => {
        console.log("Host got icecandidate", c);
        pc.addIceCandidate(JSON.parse(c));
      });

      pc.onicecandidate = (e) => {
        console.log("Host Emitting icecandidate for guest", e.candidate);
        sock.emit("icecandidate", JSON.stringify(e.candidate));
      };

      clearInterval(offerPoll);
    });
    w.local = pc;

    pc.onnegotiationneeded = console.log;
    pc.onsignalingstatechange = () =>
      console.log("Host signaling state changed", pc.signalingState);
    pc.onicecandidateerror = (e) =>
      console.log("Host ice candidate error", e.errorText);
  });
let w: any = window;

document
  .querySelector<HTMLButtonElement>("button#join")
  .addEventListener("click", async function (_) {
    const sock = io(SIGNALING_SERVER);
    const id = "guest";
    console.log("Creating guest");
    const pc = new RTCPeerConnection(_RTC_CONFIG);

    pc.ontrack = (e) => {
      console.log("Remote got track", e);
      const elt = document.createElement("audio");
      elt.srcObject = e.streams[0];
      elt.autoplay = true;
      elt.controls = true;
      document.body.appendChild(elt);
    };
    w.remote = pc;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.oniceconnectionstatechange = () =>
      console.log("Remote: ICE connection state:", pc.iceConnectionState);
    pc.onicecandidateerror = (e) =>
      console.log("Remote ice candidate error", e.errorText);

    pc.onicecandidate = (e) => {
      console.log("Remote emitting ice candidate", e.candidate);
      sock.emit("icecandidate", JSON.stringify(e.candidate));
    };

    pc.onicegatheringstatechange = () =>
      console.log("Remote ice gathering state", pc.iceGatheringState);

    pc.ondatachannel = (e) => {
      console.log("Got datachannel from host", e);
      const canvas: HTMLCanvasElement = document.querySelector("canvas");
      const ctx = canvas.getContext("2d");

      e.channel.onmessage = (b: MessageEvent) => {
        const entities = JSON.parse(b.data);
        const board: State = {
          ctx,
          entities,
        };
        display(board);
      };

      const clickStream = getClickStream(id, canvas);
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

    console.log("Remote listening for offer");
    sock.once("offer", async (offer: string) => {
      console.log("Remote got offer");
      await pc.setRemoteDescription(JSON.parse(offer));
      console.log("Creating answer");
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sock.on("icecandidate", (c: string) => {
        console.log("Remote got ice candidate", c);
        pc.addIceCandidate(JSON.parse(c));
      });

      console.log("Replying with answer");
      sock.emit("answer", JSON.stringify(answer));
    });
  });
