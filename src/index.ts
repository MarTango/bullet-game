import { ARENA } from "./config";
import { createAnswer } from "./guest";
import { acceptAnswer, createGame } from "./host";
import { lockPageWhilePlaying } from "./session";
import { initStick } from "./stick";
import { $, canvas, guarded, setStatus, show, wireCopy } from "./ui";

canvas.width = ARENA.width;
canvas.height = ARENA.height;
lockPageWhilePlaying();
initStick();

// Host: create a game, then accept the guest's answer.
$("create-game").onclick = guarded(createGame);
$("accept-answer").onclick = guarded(acceptAnswer);
wireCopy("copy-offer", "offer-out");

// Guest: paste the host's code, then send an answer back.
$("join-game").onclick = () => {
  show("choose", false);
  show("guest-flow");
  setStatus("Paste the game code from the host.");
};
$("create-answer").onclick = guarded(createAnswer);
wireCopy("copy-answer", "answer-out");

$("restart").onclick = () => location.reload();
