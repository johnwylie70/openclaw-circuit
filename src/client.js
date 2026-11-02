/** The Circuit's side of the conversation: finding it, pairing with it, listing what it shares. */

export const DEFAULT_PORT = 3030;
/** The first Circuit protocol with app pairing and the /openai/v1 routes. */
export const MIN_PROTOCOL = 44;

const REQUEST_MS = 8000;

/** A failure to show the person as it is. `code` is the Circuit's, or "unreachable" / "too_old". */
export class CircuitError extends Error {
  constructor(message, code, extra = {}) {
    super(message);
    this.name = "CircuitError";
    this.code = code;
    Object.assign(this, extra);
  }
}

/** "192.168.1.20", "mac.local:3031", "http://10.0.0.5:3030/" → "http://10.0.0.5:3030", or null. */
export function normaliseAddress(input) {
  let s = typeof input === "string" ? input.trim() : "";
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (!u.hostname) return null;
  if (!u.port) u.port = String(DEFAULT_PORT);
  return `${u.protocol}//${u.host}`;
}

export const baseUrlOf = (address) => `${address}/openai/v1`;

async function call(url, init = {}, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_MS), ...init });
  } catch {
    throw new CircuitError(`Nothing answered at ${new URL(url).host}. Is Circuit running there, and allowed through its firewall?`, "unreachable");
  }
  let body = {};
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  return { status: res.status, ok: res.ok, body };
}

const post = (url, payload, fetchImpl) =>
  call(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, fetchImpl);

/** Is a new enough Circuit at this address? */
export async function checkCircuit(address, fetchImpl) {
  const { ok, body } = await call(`${address}/ping`, {}, fetchImpl);
  if (!ok || typeof body.protocolVersion !== "number") throw new CircuitError(`${new URL(address).host} did not answer like a Circuit.`, "unreachable");
  if (body.protocolVersion < MIN_PROTOCOL) throw new CircuitError(`That Circuit is too old to pair with apps. Update it from the Circuit menu, then try again.`, "too_old");
  return body;
}

/** Ask the Circuit to show a code on its screen. Resolves to { requestId, expiresInMs, circuitName }. */
export async function startPairing(address, { app, device }, fetchImpl) {
  const { ok, body } = await post(`${address}/model-clients/pair`, { app, device }, fetchImpl);
  if (!ok) throw new CircuitError(body.error || "The Circuit refused to pair.", body.code || "refused");
  return body;
}

/** Hand back the code the person read. Resolves to { key, clientId, circuitId, circuitName }. */
export async function confirmPairing(address, { requestId, code }, fetchImpl) {
  const { ok, body } = await post(`${address}/model-clients/pair/confirm`, { requestId, code }, fetchImpl);
  if (!ok) throw new CircuitError(body.error || "The Circuit refused that code.", body.code || "refused", { attemptsLeft: body.attemptsLeft });
  return body;
}

/** The text models this Circuit shares, its cluster's included. */
export async function listModels(baseUrl, apiKey, { signal, fetchImpl } = {}) {
  const init = { headers: { Authorization: `Bearer ${apiKey}` } };
  if (signal) init.signal = AbortSignal.any([signal, AbortSignal.timeout(REQUEST_MS)]);
  const { status, ok, body } = await call(`${baseUrl}/models`, init, fetchImpl);
  if (status === 401 || status === 403) throw new CircuitError("This Circuit no longer accepts OpenClaw's key. Pair again: openclaw models auth login --provider circuit", "auth");
  if (!ok || !Array.isArray(body.data)) throw new CircuitError("The Circuit did not list its models.", "unreachable");
  return body.data;
}
