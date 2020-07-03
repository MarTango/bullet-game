import { Msg, Entity } from "./types";

export function afterGravity({ dt, board, ...msg }: Msg): Msg {
  const ppl = board.entities.filter((e) => e.id);
  const bullets = board.entities.filter((e) => !e.id);

  const g = 0.000981;

  return {
    ...msg,
    dt,
    board: {
      ...board,
      entities: [
        ...ppl,
        ...bullets.map((e) => ({
          ...e,
          vy: e.vy - g * dt,
        })),
      ],
    },
  };
}

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

export function afterKeysPressed({ board, keysPressed, ...rest }: Msg): Msg {
  const v = 0.2;
  const mapping: { [s: string]: Partial<Entity> } = {
    w: { vy: v },
    a: { vx: -v },
    s: { vy: -v },
    d: { vx: v },
  };

  // @ts-ignore
  const keys: (keyof typeof mapping)[] = Array.from(keysPressed).filter(
    (k) => k in mapping
  );
  // @ts-ignore
  const players: Entity[] = board.entities
    .filter((e) => e.id)
    .map((p) =>
      keys
        .map((k) => mapping[k])
        .reduce(
          (prev: Entity, cur) => {
            return {
              ...prev,
              ...cur,
            } as Entity;
          },
          { ...p, vx: 0, vy: 0 }
        )
    );

  return {
    board: {
      ...board,
      entities: [...players, ...board.entities.filter((e) => !e.id)],
    },
    keysPressed,
    ...rest,
  };
}

export function afterMouseDown({ board, click, ...msg }: Msg): Msg {
  if (!click) {
    return { ...msg, board };
  }
  const { x: mx, y: my } = click;
  const players = board.entities.filter((e) => e.id);

  const bullets = players.map((p) => {
    const relx = mx - p.x;
    const rely = my - p.y;
    const magnitude = Math.sqrt(relx * relx + rely * rely);

    const v = 0.4;
    const vx = relx / magnitude;
    const vy = rely / magnitude;

    const r = p.r + 2 + 2;

    return Bullet(p.x + r * vx, p.y + r * vy, v * vx, v * vy);
  });

  return {
    ...msg,
    click,
    board: { ...board, entities: [...board.entities, ...bullets] },
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
