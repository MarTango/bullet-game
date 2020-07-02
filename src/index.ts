import movement from "./movement";

export interface State {
  ctx: CanvasRenderingContext2D;
  entities: Entity[];
}

export interface Entity {
  id?: number;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
}

interface Click {
  x: number;
  y: number;
}

export interface Msg {
  board: State;
  dt?: number;
  keysPressed?: Set<string>;
  click?: Click;
}

export function Bullet(x: number, y: number, vx: number, vy: number): Entity {
  return {
    r: 3,
    color: "black",
    x,
    y,
    vx,
    vy,
  };
}

const keysPressedStream: Iterator<Set<string>> = (function* () {
  const keys = new Set<string>();
  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (!keys.has(key)) {
      keys.add(key);
    }
  });
  window.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    if (keys.has(key)) {
      keys.delete(key);
    }
  });
  while (true) {
    yield keys;
  }
})();

const dtStream: Iterator<number> = (function* () {
  let prev = Date.now();
  while (true) {
    let next = Date.now();
    const dt = next - prev;
    prev = next;
    yield dt;
  }
})();

(function main() {
  // STATE :grimacing:
  let board = init();

  const update = (e: Msg): Msg =>
    movement.afterMouseDown(
      movement.afterKeysPressed(
        afterCollisions(afterBouncing(afterTimeStep(e)))
      )
    );

  const clickStream = (function* () {
    const queue: Click[] = [];
    window.addEventListener("mousedown", ({ offsetX: x, offsetY }) => {
      queue.push({ x, y: board.ctx.canvas.height - offsetY });
    });
    while (true) {
      yield queue.pop();
    }
  })();

  requestAnimationFrame(async function frame() {
    await new Promise((r, _) => setTimeout(r, 10));

    const msg: Msg = {
      board,
      dt: dtStream.next().value,
      keysPressed: keysPressedStream.next().value,
      click: clickStream.next().value,
    };
    board = update(msg).board;
    display(board);
    requestAnimationFrame(frame);
  });
})();

function afterGravity({ dt, board, ...msg }: Msg): Msg {
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

function afterTimeStep({ dt = 0, board, ...msg }: Msg): Msg {
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

function afterCollisions({ board, ...msg }: Msg): Msg {
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

function afterBouncing({ board, ...msg }: Msg): Msg {
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

function display(s: State) {
  const { height: h, width: w } = s.ctx.canvas;
  s.ctx.clearRect(0, 0, w, h);
  s.entities.forEach((b) => {
    s.ctx.beginPath();
    s.ctx.arc(b.x, h - b.y, b.r, 0, 2 * Math.PI);
    s.ctx.fillStyle = b.color;
    s.ctx.fill();
    s.ctx.closePath();
  });
}

function init(): State {
  const canvas = document.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  const players: Entity[] = [
    {
      id: 1,
      x: Math.random() * w,
      y: Math.random() * h,
      r: 10,
      vx: 0,
      vy: 0,
      color: "red",
    },
  ];

  return {
    ctx,
    entities: players,
  };
}
