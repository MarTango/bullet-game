import { ARENA } from "./config";
import { initLobbyView } from "./lobby-view";
import { lockPageWhilePlaying } from "./session";
import { initStick } from "./stick";
import { $, canvas } from "./ui";

canvas.width = ARENA.width;
canvas.height = ARENA.height;
lockPageWhilePlaying();
initStick();
initLobbyView();

$("restart").onclick = () => location.reload();
