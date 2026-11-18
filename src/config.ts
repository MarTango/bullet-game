import { Role } from "./types";

export const HOST: Role = "host";
export const GUEST: Role = "guest";

export const opponentOf = (role: Role): Role => (role == HOST ? GUEST : HOST);

export const PLAYER_NAMES: { [role in Role]: string } = {
  host: "Red",
  guest: "Yellow",
};

export const PLAYER_COLORS: { [role in Role]: string } = {
  host: "red",
  guest: "yellow",
};

// Speeds are in pixels per millisecond.
export const PLAYER_RADIUS = 10;
export const PLAYER_SPEED = 0.2;
export const BULLET_RADIUS = 3;
export const BULLET_SPEED = 0.4;
// Bullets spawn this far beyond the shooter's edge so they don't hit them.
export const BULLET_SPAWN_GAP = 4;
export const BULLET_COLOR = "black";

// Longest frame gap we simulate. After a background-tab pause dt can be
// seconds long, which would teleport entities through walls and each other.
export const MAX_DT = 50;

// Don't queue more than this many bytes on a slow connection.
export const MAX_BUFFERED = 16 * 1024;
