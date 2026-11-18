# Bullet Game

A two-player bullet-hell duel that runs in the browser, peer to peer. No game
server: the two browsers connect directly with WebRTC.

## Play

Go to <https://martango.github.io/bullet-game> to play.

One player clicks **Host a game** and sends the code to a friend. The friend
clicks **Join a game**, pastes it, and sends back the answer code. Paste that
into the host's page and the game starts.

- **Move:** WASD, or the on-screen stick on a phone
- **Shoot:** click or tap the arena
- **Score:** touching anything destroys it, players included. The survivor
  scores a point and a new round starts immediately.
- **Chat:** the Chat button opens a text chat

Deployed using [GitHub Pages Action](https://github.com/marketplace/actions/github-pages-action)

## How it works

The host runs the whole simulation and the guest just draws what it's sent.

| Channel  | Reliability | Carries |
|----------|-------------|---------|
| `state`  | unreliable  | host → guest: game frames (compact binary); guest → host: input |
| `events` | reliable    | guest → host: clicks |
| `chat`   | reliable    | text messages |

There is no signaling server: the connection codes are exchanged by hand.
STUN (and a TURN relay for networks that block direct connections) is
configured in `src/ice.ts`.

### Code layout

| File | Role |
|------|------|
| `src/transformations.ts` | The game rules, as pure functions over a `Msg` |
| `src/round.ts` | Starting rounds and scoring, as pure functions (randomness passed in) |
| `src/game.ts` | Host game loop: the impure shell around the pure rules |
| `src/render.ts` | Canvas drawing |
| `src/streams.ts` | Per-frame input sources (keyboard, stick, clicks, network) |
| `src/protocol.ts` | Everything sent over the network, with validation |
| `src/config.ts` | Gameplay constants, including the arena size |
| `src/host.ts`, `src/guest.ts` | Each role's connection setup |
| `src/session.ts` | Connection lifecycle: connected, unstable, ended |
| `src/signaling.ts` | Turns connection descriptions into copy-pasteable codes |
| `src/chat.ts`, `src/stick.ts`, `src/ui.ts` | Chat panel, on-screen stick, DOM helpers |

## Setting up

Requires:
- node
- npm

### Installing dependencies
`npm install`

### TURN relay credentials (optional)

Without a relay, players on strict networks may fail to connect. To enable one,
copy `.env.example` to `.env` and fill in the
[Metered](https://www.metered.ca/tools/openrelay/) TURN username and credential.
They are injected at build time and `.env` is gitignored. In CI they come from
the `TURN_USERNAME` and `TURN_CREDENTIAL` repository secrets. If unset, the game
builds with STUN only.

The credential is baked into the deployed JavaScript, so it is not private:
rotate it in the Metered dashboard if it's abused.

### Building
`npm run build`

### Dev server
`npm run dev`

To try it from a phone on the same network: `npm run dev -- --host 0.0.0.0`.
