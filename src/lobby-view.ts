// The lobby screen: pick a name, see who is online, challenge someone or
// accept a challenge. The challenger hosts the game; whoever accepts is the
// guest.

import { joinGame } from "./guest";
import { hostGame } from "./host";
import { enterLobby, Lobby, Player } from "./lobby";
import { cleanName, Direct, From } from "./signaling";
import { $, guarded, setStatus, show } from "./ui";

const CHALLENGE_TIMEOUT_MS = 30000;
const NAME_KEY = "bullet-game-name";

interface Pending {
  name: string;
  timer: ReturnType<typeof setTimeout>;
}

// Everyone in the same lobby sees each other. `?lobby=friends` in the address
// makes a separate one, to play with people you've shared the link with.
function lobbyRoom() {
  const wanted = new URLSearchParams(location.search).get("lobby") || "";
  return /^[a-z0-9-]{1,20}$/i.test(wanted) ? wanted.toLowerCase() : "public";
}

const remembered = () => {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch (err) {
    return null;
  }
};

const remember = (name: string) => {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch (err) {}
};

export function initLobbyView() {
  const nameInput = $<HTMLInputElement>("name-input");
  nameInput.value =
    remembered() || `Player ${Math.floor(1000 + Math.random() * 9000)}`;

  let lobby: Lobby;
  let myName = "";
  let players: Player[] = [];
  let outgoing: (Pending & { id: string }) | null = null;
  const incoming = new Map<string, Pending>();
  let connecting = false; // a game is being set up, so no new challenges
  let lastView = "";

  const busy = () => connecting || outgoing !== null;

  const clearOutgoing = () => {
    if (outgoing) {
      clearTimeout(outgoing.timer);
      outgoing = null;
    }
    lobby.setBusy(connecting);
  };

  // ---------- Drawing ----------

  const button = (label: string, onClick: () => void, disabled = false) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.disabled = disabled;
    b.onclick = onClick;
    return b;
  };

  // Names are typed by other players: always text, never HTML.
  const row = (tag: string, text: string, ...buttons: HTMLElement[]) => {
    const el = document.createElement(tag);
    const label = document.createElement("span");
    label.textContent = text;
    el.append(label, ...buttons);
    return el;
  };

  // Redrawing while someone is clicking would eat the click, so only redraw
  // when something visible changed.
  const render = () => {
    const view = JSON.stringify([players, outgoing?.id, [...incoming], connecting]);
    if (view == lastView) {
      return;
    }
    lastView = view;

    $("players").replaceChildren(
      ...players.map((p) =>
        row(
          "li",
          p.busy ? `${p.name} (busy)` : p.name,
          outgoing?.id == p.id
            ? button("Cancel", cancelChallenge)
            : button("Challenge", () => challenge(p), p.busy || busy())
        )
      )
    );
    show("players-empty", players.length == 0);

    $("invites").replaceChildren(
      ...[...incoming].map(([id, { name }]) =>
        row(
          "div",
          `${name} wants to play`,
          button("Accept", () => accept(id), connecting),
          button("Decline", () => decline(id))
        )
      )
    );
  };

  // ---------- Challenging someone ----------

  function challenge(player: Player) {
    outgoing = {
      id: player.id,
      name: player.name,
      timer: setTimeout(() => {
        lobby.send(player.id, { type: "cancel" });
        clearOutgoing();
        setStatus(`${player.name} didn't respond.`);
        render();
      }, CHALLENGE_TIMEOUT_MS),
    };
    lobby.setBusy(true);
    lobby.send(player.id, { type: "challenge", name: myName });
    setStatus(`Waiting for ${player.name} to accept…`);
    render();
  }

  function cancelChallenge() {
    if (outgoing) {
      lobby.send(outgoing.id, { type: "cancel" });
      clearOutgoing();
      setStatus("Challenge cancelled.");
      render();
    }
  }

  // ---------- Being challenged ----------

  function dropInvite(id: string) {
    clearTimeout(incoming.get(id)?.timer);
    incoming.delete(id);
  }

  function decline(id: string) {
    lobby.send(id, { type: "decline" });
    dropInvite(id);
    render();
  }

  function accept(id: string) {
    incoming.forEach((_, other) => other != id && decline(other));
    dropInvite(id);
    startConnecting();
    lobby.send(id, { type: "accept" });
    setStatus("Connecting…");
    guarded(() => joinGame(lobby.link(id)))();
  }

  function startConnecting() {
    connecting = true;
    lobby.setBusy(true);
    show("lobby", false);
    render();
  }

  // ---------- Messages from other players ----------

  function onChallenge(from: string, name: string) {
    if (connecting) {
      return lobby.send(from, { type: "decline" });
    }
    if (outgoing) {
      if (outgoing.id != from) {
        return lobby.send(from, { type: "decline" });
      }
      // We challenged each other at the same moment. The higher id gives way
      // and accepts, so exactly one of the two ends up hosting.
      if (lobby.id > from) {
        clearOutgoing();
        return accept(from);
      }
      return;
    }
    dropInvite(from);
    incoming.set(from, {
      name,
      // They'll have given up by then.
      timer: setTimeout(() => {
        dropInvite(from);
        render();
      }, CHALLENGE_TIMEOUT_MS + 5000),
    });
    setStatus(`${name} wants to play.`);
    render();
  }

  function onDirect(message: From<Direct>) {
    const { from } = message;
    switch (message.type) {
      case "challenge":
        return onChallenge(from, message.name);
      case "cancel":
        dropInvite(from);
        return render();
      case "decline":
        if (outgoing?.id == from) {
          const { name } = outgoing;
          clearOutgoing();
          setStatus(`${name} can't play right now.`);
          render();
        }
        return;
      case "accept":
        if (outgoing?.id == from) {
          clearTimeout(outgoing.timer);
          outgoing = null;
          startConnecting();
          setStatus("Connecting…");
          guarded(() => hostGame(lobby.link(from)))();
        }
        return;
    }
  }

  // ---------- Entering the lobby ----------

  $<HTMLFormElement>("name-form").onsubmit = (e) => {
    e.preventDefault();
    $("enter-lobby").click();
  };

  $("enter-lobby").onclick = guarded(async () => {
    myName = cleanName(nameInput.value);
    remember(myName);
    show("choose", false);
    setStatus("Connecting…");

    lobby = await enterLobby({
      room: lobbyRoom(),
      name: myName,
      onPlayers: (list) => {
        players = list;
        render();
      },
      onDirect,
      onLost: () => {
        if (!connecting) {
          show("lobby", false);
          show("restart");
          setStatus("Lost connection to the matchmaking server.", true);
        }
      },
    });

    $("lobby-name").textContent =
      lobbyRoom() == "public" ? "Players online" : `Lobby: ${lobbyRoom()}`;
    show("lobby");
    setStatus(`You're in as ${myName}. Click a player to challenge them.`);
    render();
  });
}
