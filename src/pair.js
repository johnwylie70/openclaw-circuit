import { hostname } from "node:os";
import { baseUrlOf, checkCircuit, CircuitError, confirmPairing, listModels, normaliseAddress, startPairing } from "./client.js";

export const PROVIDER_ID = "circuit";
export const PROFILE_ID = "circuit:paired";

/** The provider's address once paired. The key lives in OpenClaw's auth profile, never here. */
export function providerConfigFor(address) {
  return {
    baseUrl: baseUrlOf(address),
    api: "openai-completions",
    // The Circuit is on the person's own network, which OpenClaw's request guard otherwise refuses.
    request: { allowPrivateNetwork: true },
    models: [],
  };
}

/**
 * The pairing sequence, as `openclaw models auth login --provider circuit` runs it:
 * ask for the address, have the Circuit show a code on its own screen, take the code
 * from the person, and receive a key that reaches models and nothing else.
 */
export async function runPairing(ctx, { fetchImpl, device = hostname() } = {}) {
  const { prompter } = ctx;
  const answer = await prompter.text({
    message: "Address of your Circuit (use the lead computer to reach your whole cluster)",
    placeholder: "192.168.1.20",
    validate: (v) => (normaliseAddress(v) ? undefined : "Use its address on your network, like 192.168.1.20"),
  });
  const address = normaliseAddress(answer);
  await checkCircuit(address, fetchImpl);

  const pairing = await startPairing(address, { app: "OpenClaw", device }, fetchImpl);
  let result;
  for (;;) {
    const code = await prompter.text({
      message: `Type the code showing on ${pairing.circuitName}`,
      placeholder: "123 456",
      validate: (v) => (/^\s*\d{3}\s*\d{3}\s*$/.test(String(v)) ? undefined : "The code is 6 digits"),
    });
    try {
      result = await confirmPairing(address, { requestId: pairing.requestId, code: String(code).replace(/\s+/g, "") }, fetchImpl);
      break;
    } catch (err) {
      if (!(err instanceof CircuitError) || err.code !== "wrong_code") throw err;
      await prompter.note(err.message, "Wrong code");
    }
  }

  const baseUrl = baseUrlOf(address);
  const models = await listModels(baseUrl, result.key, { fetchImpl }).catch(() => []);
  return {
    profiles: [
      {
        profileId: PROFILE_ID,
        credential: { type: "api_key", provider: PROVIDER_ID, key: result.key },
        secretStorage: { kind: "store", namePrefix: "CIRCUIT_MODELS_KEY" },
      },
    ],
    configPatch: { models: { providers: { [PROVIDER_ID]: providerConfigFor(address) } } },
    notes: [
      `Paired with ${result.circuitName}. Remove OpenClaw any time under Cluster… in its Circuit menu.`,
      models.length
        ? `Models: ${models.map((m) => `${PROVIDER_ID}/${m.id}`).join(", ")}`
        : "It shares no models yet. Add one in Circuitry's Settings, or join another computer to its cluster.",
    ],
  };
}
