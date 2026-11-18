// Manual signaling: WebRTC session descriptions are turned into short,
// copy-pasteable codes that players exchange out-of-band (chat, etc.).
//
// Code format: <kind><compressed>.<base64url payload>
//   kind:       "O" (offer, host -> guest) or "A" (answer, guest -> host)
//   compressed: "1" if deflate-raw compressed, "0" if plain UTF-8

export type CodeKind = "O" | "A";

const w: any = window;

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

async function pipe(
  stream: any,
  bytes: Uint8Array
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export async function encodeCode(
  kind: CodeKind,
  desc: RTCSessionDescriptionInit
): Promise<string> {
  const raw = new TextEncoder().encode(desc.sdp);
  if (w.CompressionStream) {
    const packed = await pipe(new w.CompressionStream("deflate-raw"), raw);
    return `${kind}1.${toBase64Url(packed)}`;
  }
  return `${kind}0.${toBase64Url(raw)}`;
}

export async function decodeCode(
  kind: CodeKind,
  code: string
): Promise<RTCSessionDescriptionInit> {
  // Chat apps like to insert whitespace and line breaks.
  const match = /^([OA])([01])\.([A-Za-z0-9_-]+)$/.exec(code.replace(/\s+/g, ""));
  if (!match) {
    throw new Error("That doesn't look like a valid code.");
  }
  const [, gotKind, compressed, payload] = match;
  if (gotKind != kind) {
    throw new Error(
      kind == "O"
        ? "That's an answer code. Paste the host's game code here."
        : "That's a game code. Paste the guest's answer code here."
    );
  }
  let bytes = fromBase64Url(payload);
  if (compressed == "1") {
    if (!w.DecompressionStream) {
      throw new Error(
        "This browser can't read the code. Try a recent Chrome, Edge, Firefox or Safari."
      );
    }
    bytes = await pipe(new w.DecompressionStream("deflate-raw"), bytes);
  }
  return {
    type: kind == "O" ? "offer" : "answer",
    sdp: new TextDecoder().decode(bytes),
  };
}

// Resolves once ICE gathering is done, so the SDP already contains every
// candidate (there is no server to trickle them through). Falls back after a
// timeout so a slow STUN server can't hang the UI forever.
export function waitForIce(pc: RTCPeerConnection, timeoutMs = 4000) {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState == "complete") {
      return resolve();
    }
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => pc.iceGatheringState == "complete" && done();
    const timer = setTimeout(done, timeoutMs);
    pc.addEventListener("icegatheringstatechange", check);
  });
}
