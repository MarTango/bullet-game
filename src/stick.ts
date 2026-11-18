import { setStick } from "./streams";
import { $ } from "./ui";

const DEAD_ZONE = 0.15;

// On-screen analog stick: drag the knob; tilt direction and strength set the
// movement direction and speed. Pointer capture keeps tracking the finger
// even if it slides outside the base.
export function initStick() {
  const base = $("stick");
  const knob = $("knob");
  let activePointer: number | null = null;

  const track = (e: PointerEvent) => {
    const rect = base.getBoundingClientRect();
    const travel = rect.width / 2 - knob.offsetWidth / 2;
    let x = (e.clientX - (rect.left + rect.width / 2)) / travel;
    let y = (e.clientY - (rect.top + rect.height / 2)) / travel;
    const tilt = Math.hypot(x, y);
    if (tilt > 1) {
      x /= tilt;
      y /= tilt;
    }
    knob.style.transform = `translate(${x * travel}px, ${y * travel}px)`;
    // Screen y points down, board y points up.
    const live = Math.hypot(x, y) >= DEAD_ZONE;
    setStick(live ? x : 0, live ? -y : 0);
  };

  const release = (e: PointerEvent) => {
    if (e.pointerId !== activePointer) {
      return;
    }
    activePointer = null;
    knob.style.transform = "";
    setStick(0, 0);
  };

  base.addEventListener("pointerdown", (e) => {
    if (activePointer !== null) {
      return;
    }
    e.preventDefault();
    activePointer = e.pointerId;
    base.setPointerCapture(e.pointerId);
    track(e);
  });
  base.addEventListener("pointermove", (e) => {
    if (e.pointerId === activePointer) {
      track(e);
    }
  });
  base.addEventListener("pointerup", release);
  base.addEventListener("pointercancel", release);
  base.addEventListener("contextmenu", (e) => e.preventDefault());
}
