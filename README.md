# Bullet Game

A two-player bullet-hell duel that runs in the browser, peer to peer. No game
server: the two browsers connect directly with WebRTC.

## Play

Go to <https://martango.github.io/bullet-game> to play.

Enter a name and click **Find players**. Everyone online is listed: click
**Challenge** next to someone, and the game starts if they **Accept**.

To play only with friends, share a link with your own lobby name, for example
`https://martango.github.io/bullet-game/?lobby=my-friends`. Only people who open
that link see each other.

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

There is no server of our own. Players find each other through a free public
MQTT broker (HiveMQ, see `src/signaling.ts`). Each player announces themselves
on a shared lobby topic every few seconds, and challenges and connection offers
go to a player's own inbox topic. That is a handful of small messages; once two
players are connected both leave the lobby and everything goes directly between
them. STUN (and a TURN relay for networks that block direct connections) is
configured in `src/ice.ts`.

The broker is a shared public service with no guarantees, and anyone can read
or send messages on it. If it goes down, change `BROKER_URL` in
`src/signaling.ts`.

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
| `src/lobby.ts`, `src/lobby-view.ts` | Who is online, and the challenge/accept screen |
| `src/signaling.ts` | Message formats and validation for the broker |
| `src/mqtt.ts` | Minimal MQTT client (connect, subscribe, publish) |
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
