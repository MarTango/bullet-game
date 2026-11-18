// The life of a connection: set up, playing, unstable, gone.

import { ICE_SERVERS } from "./ice";
import { setStick } from "./streams";
import { Role } from "./types";
import { isTouchDevice, setStatus, show } from "./ui";

let wasConnected = false;
let ended = false;
let unstable = false;

export const hasEnded = () => ended;

// The connection is gone for good: stop the game, put the controls away and
// offer a way back to the start. Safe to call more than once.
export function endSession() {
  if (ended) {
    return;
  }
  ended = true;
  setStick(0, 0);
  document.body.classList.remove("playing");
  ["reset", "stick", "chat-toggle", "chat"].forEach((id) => show(id, false));
  show("restart");
  setStatus(
    wasConnected
      ? "The other player disconnected."
      : "Connection failed. Some networks block direct connections, so try again.",
    true
  );
}

export function newConnection() {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  // Exposed so the connection can be inspected from the browser console.
  (window as any).pc = pc;

  pc.addEventListener("connectionstatechange", () => {
    const state = pc.connectionState;
    if (state == "failed" || state == "closed") {
      endSession();
    } else if (state == "disconnected" && wasConnected && !ended) {
      // Often a brief network blip that recovers by itself.
      unstable = true;
      setStatus("Connection unstable…", true);
    } else if (state == "connected" && unstable && !ended) {
      unstable = false;
      setStatus("Reconnected.");
    }
  });
  return pc;
}

// Both players are talking: hide the setup UI and show the game controls.
export function onConnected(role: Role) {
  wasConnected = true;
  document.body.classList.add("playing");
  show("setup", false);
  show("reset", role == "host");
  if (isTouchDevice) {
    show("stick");
  }
  setStatus(
    `Connected! You are the ${role}.` +
      (isTouchDevice ? " Use the stick to move and tap the arena to shoot." : "")
  );
}

// iOS Safari ignores `touch-action` for page scrolling in places, so also
// cancel touch scrolling directly while a game is running.
export function lockPageWhilePlaying() {
  document.addEventListener(
    "touchmove",
    (e) => {
      const target = e.target as HTMLElement;
      if (
        document.body.classList.contains("playing") &&
        !target.closest("#chat-log")
      ) {
        e.preventDefault();
      }
    },
    { passive: false }
  );
}
