import { CircuitError, listModels } from "./client.js";
import { PROVIDER_ID, runPairing } from "./pair.js";

/** What to assume when a model's server can't say. Only a loaded model reports its context. */
export const ASSUMED_CONTEXT = 32768;
const MAX_REPLY_TOKENS = 8192;
const NO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** One OpenClaw model from one row of the Circuit's list. */
export function toModel(row, pluginConfig = {}) {
  const contextWindow = pluginConfig.contextWindows?.[row.id] ?? row.context_window ?? pluginConfig.defaultContextWindow ?? ASSUMED_CONTEXT;
  const host = row.owned_by && row.owned_by !== "this computer" ? row.owned_by : null;
  return {
    id: row.id,
    name: host ? `${row.name || row.id} on ${host}` : row.name || row.id,
    reasoning: row.reasoning === true,
    input: row.supports_images ? ["text", "image"] : ["text"],
    cost: NO_COST,
    contextWindow,
    maxTokens: Math.min(pluginConfig.maxTokens ?? MAX_REPLY_TOKENS, contextWindow),
    compat: { supportsTools: row.supports_tools !== false, supportsUsageInStreaming: true },
  };
}

export const pairedBaseUrl = (config) => config?.models?.providers?.[PROVIDER_ID]?.baseUrl;

export function createCircuitProvider({ pluginConfig = {}, fetchImpl, logger = console } = {}) {
  return {
    id: PROVIDER_ID,
    label: "Circuit",
    auth: [
      {
        id: "pair",
        label: "Pair with Circuit",
        hint: "Type the code your Circuit shows",
        kind: "custom",
        run: (ctx) => runPairing(ctx, { fetchImpl }),
      },
    ],
    catalog: {
      order: "profile",
      run: async (ctx) => {
        const baseUrl = pairedBaseUrl(ctx.config);
        // The key is kept in OpenClaw's protected store: `apiKey` may be a marker for it, and only `discoveryApiKey` is the key itself.
        const { apiKey, discoveryApiKey } = ctx.resolveProviderAuth(PROVIDER_ID);
        if (!baseUrl || !apiKey) return null;
        let rows;
        try {
          rows = await listModels(baseUrl, discoveryApiKey ?? apiKey, { signal: ctx.signal, fetchImpl });
        } catch (err) {
          // Asleep or off: the provider stays, and a chat says why when it reaches the Circuit.
          logger.warn?.(`[circuit] ${err instanceof CircuitError ? err.message : "Could not list models."}`);
          rows = [];
        }
        return { provider: { baseUrl, apiKey, api: "openai-completions", request: { allowPrivateNetwork: true }, models: rows.map((row) => toModel(row, pluginConfig)) } };
      },
    },
    // A model chosen while the Circuit was unreachable still resolves: its list isn't the only proof it exists.
    resolveDynamicModel: (ctx) => {
      const baseUrl = pairedBaseUrl(ctx.config);
      if (!baseUrl) return undefined;
      return { ...toModel({ id: ctx.modelId }, pluginConfig), provider: PROVIDER_ID, api: "openai-completions", baseUrl };
    },
  };
}
