// Small helpers for the page's DOM.

export const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

export const setStatus = (message: string, isError = false) => {
  const el = $("status");
  el.textContent = message;
  el.style.color = isError ? "crimson" : "";
};

export const show = (id: string, visible = true) =>
  ($(id).style.display = visible ? "" : "none");

export const canvas = document.querySelector("canvas");
export const ctx = canvas.getContext("2d");

export const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;

let busy = false;

// Runs an async UI action, preventing double clicks and reporting errors.
export function guarded(action: () => Promise<void>) {
  return async () => {
    if (busy) {
      return;
    }
    busy = true;
    try {
      await action();
    } catch (err) {
      console.error(err);
      setStatus(err.message || String(err), true);
      show("restart");
    } finally {
      busy = false;
    }
  };
}

// Wires the Reset button. Returns a function that says, once, whether it was
// pressed since it was last asked.
export function watchReset() {
  let requested = false;
  $("reset").onclick = () => (requested = true);
  return () => {
    const was = requested;
    requested = false;
    return was;
  };
}
