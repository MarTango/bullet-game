// STUN finds each player's public address for a direct connection. The Metered
// TURN relay is the fallback for networks where that fails (strict NATs, some
// mobile carriers). The credential is injected at build time from .env or CI
// secrets, so it isn't in the repo, but it is readable in the deployed bundle:
// rotate it in the Metered dashboard if it's abused. Without it we use STUN only.
const TURN_URLS = [
  "turn:global.relay.metered.ca:80",
  "turn:global.relay.metered.ca:80?transport=tcp",
  "turn:global.relay.metered.ca:443",
  "turns:global.relay.metered.ca:443?transport=tcp",
];

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.relay.metered.ca:80" },
  ...(__TURN_USERNAME__ && __TURN_CREDENTIAL__
    ? TURN_URLS.map((urls) => ({
        urls,
        username: __TURN_USERNAME__,
        credential: __TURN_CREDENTIAL__,
      }))
    : []),
];
