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
    } finally {
      busy = false;
    }
  };
}

export function wireCopy(buttonId: string, textareaId: string) {
  $(buttonId).onclick = async () => {
    const textarea = $<HTMLTextAreaElement>(textareaId);
    textarea.select();
    try {
      await navigator.clipboard.writeText(textarea.value);
      setStatus("Copied to clipboard.");
    } catch (err) {
      // Clipboard API needs a secure context; fall back to the old way.
      document.execCommand("copy");
    }
  };
}
