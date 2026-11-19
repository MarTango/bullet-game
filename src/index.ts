import { ARENA } from "./config";
import { initLobbyView } from "./lobby-view";
import { initPractice } from "./practice";
import { lockPageWhilePlaying } from "./session";
import { initStick } from "./stick";
import { $, canvas } from "./ui";

canvas.width = ARENA.width;
canvas.height = ARENA.height;
lockPageWhilePlaying();
initStick();
initLobbyView();
initPractice();

$("restart").onclick = () => location.reload();
