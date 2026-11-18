// Text chat over its own data channel, kept separate from the game channel so
// chat messages can never be mistaken for game input (or vice versa).

const MAX_LEN = 300;

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

export function initChat(channel: RTCDataChannel, me: string, them: string) {
  const panel = $("chat");
  const log = $("chat-log");
  const form = $<HTMLFormElement>("chat-form");
  const input = $<HTMLInputElement>("chat-input");
  const toggle = $("chat-toggle");
  let unread = 0;

  const isOpen = () => panel.style.display != "none";
  const renderToggle = () =>
    (toggle.textContent = unread > 0 ? `Chat (${unread})` : "Chat");

  // textContent only: messages come from the other player and are never
  // treated as HTML.
  const addLine = (who: string, text: string) => {
    const row = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = `${who}: `;
    row.appendChild(name);
    row.appendChild(document.createTextNode(text));
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  };

  channel.addEventListener("message", (e: MessageEvent) => {
    let text: unknown;
    try {
      text = JSON.parse(e.data).text;
    } catch (err) {
      return;
    }
    if (typeof text != "string") {
      return;
    }
    const clean = text.trim().slice(0, MAX_LEN);
    if (!clean) {
      return;
    }
    addLine(them, clean);
    if (!isOpen()) {
      unread++;
      renderToggle();
    }
  });

  form.onsubmit = (e) => {
    e.preventDefault();
    const text = input.value.trim().slice(0, MAX_LEN);
    if (!text || channel.readyState != "open") {
      return;
    }
    channel.send(JSON.stringify({ text }));
    addLine(me, text);
    input.value = "";
  };

  toggle.onclick = () => {
    const open = !isOpen();
    panel.style.display = open ? "" : "none";
    if (open) {
      unread = 0;
      renderToggle();
      log.scrollTop = log.scrollHeight;
      input.focus();
    }
  };

  toggle.style.display = "";
}
