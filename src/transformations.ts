import { Msg, Entity } from "./types";
import { keycodes } from "./controls";

export function afterTimeStep({ dt = 0, board, ...msg }: Msg): Msg {
  return {
    ...msg,
    dt,
    board: {
      ...board,
      entities: board.entities.map((c) => ({
        ...c,
        x: c.x + c.vx * dt,
        y: c.y + c.vy * dt,
      })),
    },
  };
}

export function afterCollisions({ board, ...msg }: Msg): Msg {
  return {
    ...msg,
    board: {
      ...board,
      entities: board.entities.filter((b1, i) => {
        const collisions = board.entities.filter(
          (b2, j) =>
            i != j &&
            Math.pow(b1.x - b2.x, 2) + Math.pow(b1.y - b2.y, 2) <
              Math.pow(b1.r + b2.r, 2)
        );
        return collisions.length == 0;
      }),
    },
  };
}

export function afterBouncing({ board, ...msg }: Msg): Msg {
  const { width: w, height: h } = board.ctx.canvas;

  return {
    ...msg,
    board: {
      ...board,
      entities: board.entities.map(({ vx, vy, ...b }) => ({
        ...b,
        x: b.x < 0 ? 0 : b.x > w ? w : b.x,
        y: b.y < 0 ? 0 : b.y > h ? w : b.y,
        vx: b.x - b.r < 0 ? Math.abs(vx) : b.x + b.r > w ? -Math.abs(vx) : vx,
        vy: b.y - b.r < 0 ? Math.abs(vy) : b.y + b.r > h ? -Math.abs(vy) : vy,
      })),
    },
  };
}

const v = 0.2;
const [mvup, mvleft, mvright, mvdown] = [
  { vy: v },
  { vx: -v },
  { vx: v },
  { vy: -v },
];

export function afterKeysPressed({ board, keys, ...rest }: Msg): Msg {
  const mapping: { [s: number]: Partial<Entity> } = {
    [keycodes.w]: mvup,
    [keycodes.a]: mvleft,
    [keycodes.s]: mvdown,
    [keycodes.d]: mvright,
  };

  // @ts-ignore
  const movedPlayers: Entity[] = Object.entries(keys)
    .map(([id, keysPressed]) => {
      const player = board.entities.filter((e) => e.id == id).pop();
      return (
        player &&
        Array.from(keysPressed)
          .map((k) => mapping[k])
          .reduce(
            (prev, cur) => ({
              ...prev,
              ...cur,
            }),
            { ...player, vx: 0, vy: 0 }
          )
      );
    })
    .filter((p) => p);

  return {
    board: {
      ...board,
      entities: [
        ...movedPlayers,
        ...board.entities.filter((e) => !(e.id in keys)),
      ].filter((e) => e),
    },
    keys,
    ...rest,
  };
}

export function afterClicks({ board, clicks, ...msg }: Msg): Msg {
  const newBullets = clicks
    .map((click) => {
      const { x: mx, y: my, entityId } = click;

      // player
      const p = board.entities.filter((e) => e.id == entityId).pop();
      if (!p) {
        return;
      }
      const relx = mx - p.x;
      const rely = my - p.y;
      const magnitude = Math.sqrt(relx * relx + rely * rely);

      const v = 0.4;
      const vx = relx / magnitude;
      const vy = rely / magnitude;

      const r = p.r + 2 + 2;

      return Bullet(p.x + r * vx, p.y + r * vy, v * vx, v * vy);
    })
    .filter((b) => b);

  return {
    ...msg,
    clicks,
    board: { ...board, entities: [...board.entities, ...newBullets] },
  };
}

function Bullet(x: number, y: number, vx: number, vy: number): Entity {
  return {
    r: 3,
    color: "black",
    x,
    y,
    vx,
    vy,
  };
}
