import { Entity, Bullet, Msg } from "./index";

export default {
  afterKeysPressed: ({ board, keysPressed, ...rest }: Msg): Msg => {
    const v = 0.2;

    /**
     * Map from key to partial Entity
     */
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
  },
  afterMouseDown: ({ board, click, ...msg }: Msg): Msg => {
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
  },
};
