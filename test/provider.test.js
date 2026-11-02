import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSUMED_CONTEXT, createCircuitProvider, toModel } from "../src/provider.js";

const BASE = "http://10.0.0.2:3030/openai/v1";
const config = { models: { providers: { circuit: { baseUrl: BASE } } } };
const ctx = (over = {}) => ({ config, resolveProviderAuth: () => ({ apiKey: "k" }), ...over });

test("a row becomes a free model named for its computer", () => {
  const m = toModel({ id: "pc/q", name: "q", owned_by: "PC", supports_images: true, supports_tools: true, reasoning: true, context_window: 163840 });
  assert.equal(m.name, "q on PC");
  assert.deepEqual(m.input, ["text", "image"]);
  assert.equal(m.reasoning, true);
  assert.equal(m.contextWindow, 163840);
  assert.equal(m.cost.input, 0);
  assert.equal(toModel({ id: "gemma4", owned_by: "this computer" }).name, "gemma4");
});

test("context: the person's setting, then the running server, then a safe guess", () => {
  const row = { id: "m", context_window: 100000 };
  assert.equal(toModel(row, { contextWindows: { m: 50000 } }).contextWindow, 50000);
  assert.equal(toModel(row).contextWindow, 100000);
  assert.equal(toModel({ id: "m" }, { defaultContextWindow: 64000 }).contextWindow, 64000);
  assert.equal(toModel({ id: "m" }).contextWindow, ASSUMED_CONTEXT);
  assert.ok(toModel({ id: "m" }, { maxTokens: 999999 }).maxTokens <= ASSUMED_CONTEXT);
});

test("tools are on unless the Circuit says the model can't", () => {
  assert.equal(toModel({ id: "m" }).compat.supportsTools, true);
  assert.equal(toModel({ id: "m", supports_tools: false }).compat.supportsTools, false);
});

test("not paired: no catalog and nothing sent", async () => {
  let called = 0;
  const p = createCircuitProvider({ fetchImpl: async () => { called++; return new Response("{}"); } });
  assert.equal(await p.catalog.run(ctx({ config: {} })), null);
  assert.equal(await p.catalog.run(ctx({ resolveProviderAuth: () => ({}) })), null);
  assert.equal(called, 0);
});

test("the catalog asks with the key and lists what the Circuit shares", async () => {
  let auth;
  const p = createCircuitProvider({ fetchImpl: async (_u, init) => { auth = init.headers.Authorization; return new Response(JSON.stringify({ data: [{ id: "gemma4" }] })); } });
  const r = await p.catalog.run(ctx());
  assert.equal(auth, "Bearer k");
  assert.equal(r.provider.baseUrl, BASE);
  assert.deepEqual(r.provider.models.map((m) => m.id), ["gemma4"]);
});

test("a key in OpenClaw's protected store: the list asks with the key itself, never its marker", async () => {
  let auth;
  const p = createCircuitProvider({ fetchImpl: async (_u, init) => { auth = init.headers.Authorization; return new Response(JSON.stringify({ data: [] })); } });
  const r = await p.catalog.run(ctx({ resolveProviderAuth: () => ({ apiKey: "secretref-marker", discoveryApiKey: "real" }) }));
  assert.equal(auth, "Bearer real");
  assert.equal(r.provider.apiKey, "secretref-marker");
});

test("a sleeping Circuit keeps the provider, and a chosen model still resolves", async () => {
  const warnings = [];
  const p = createCircuitProvider({ logger: { warn: (m) => warnings.push(m) }, fetchImpl: async () => { throw new TypeError("fetch failed"); } });
  const r = await p.catalog.run(ctx());
  assert.deepEqual(r.provider.models, []);
  assert.equal(warnings.length, 1);
  const m = p.resolveDynamicModel({ config, modelId: "pc/q" });
  assert.equal(m.baseUrl, BASE);
  assert.equal(m.provider, "circuit");
  assert.equal(p.resolveDynamicModel({ config: {}, modelId: "x" }), undefined);
});
