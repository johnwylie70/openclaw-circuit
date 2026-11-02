import assert from "node:assert/strict";
import { test } from "node:test";
import { runPairing } from "../src/pair.js";

/** A Circuit that follows the pairing protocol, and a person typing the given answers. */
function rig({ code = "482913", protocol = 44, typed }) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, body, auth: init.headers?.Authorization });
    if (path === "/ping") return new Response(JSON.stringify({ protocolVersion: protocol }));
    if (path === "/model-clients/pair") return new Response(JSON.stringify({ requestId: "req", expiresInMs: 300000, circuitName: "Mac" }));
    if (path === "/model-clients/pair/confirm") {
      return body.code === code
        ? new Response(JSON.stringify({ key: "models-key", clientId: "c1", circuitId: "m", circuitName: "Mac" }))
        : new Response(JSON.stringify({ error: "That is not the code.", code: "wrong_code", attemptsLeft: 4 }), { status: 401 });
    }
    if (path === "/openai/v1/models") return new Response(JSON.stringify({ data: [{ id: "pc/qwen3:30b" }, { id: "gemma4" }] }));
    return new Response("{}", { status: 404 });
  };
  const answers = [...typed];
  const notes = [];
  const prompter = {
    text: async ({ validate }) => {
      const v = answers.shift();
      assert.equal(validate(v), undefined, `"${v}" should pass validation`);
      return v;
    },
    note: async (m) => notes.push(m),
  };
  return { fetchImpl, calls, notes, ctx: { prompter } };
}

test("pairs: the code goes back to the Circuit, the key lands in the auth profile, not in config", async () => {
  const { ctx, fetchImpl, calls } = rig({ typed: ["10.0.0.2", "482 913"] });
  const r = await runPairing(ctx, { fetchImpl, device: "PC" });
  assert.deepEqual(calls.find((c) => c.path === "/model-clients/pair").body, { app: "OpenClaw", device: "PC" });
  assert.deepEqual(calls.find((c) => c.path === "/model-clients/pair/confirm").body, { requestId: "req", code: "482913" });
  assert.equal(r.profiles[0].credential.key, "models-key");
  assert.equal(r.profiles[0].secretStorage.kind, "store");
  assert.equal(r.configPatch.models.providers.circuit.baseUrl, "http://10.0.0.2:3030/openai/v1");
  assert.ok(!JSON.stringify(r.configPatch).includes("models-key"));
  assert.ok(r.notes.join().includes("circuit/pc/qwen3:30b"));
});

test("a wrong code asks again", async () => {
  const { ctx, fetchImpl, notes } = rig({ typed: ["10.0.0.2", "111111", "482913"] });
  const r = await runPairing(ctx, { fetchImpl, device: "PC" });
  assert.equal(r.profiles[0].credential.key, "models-key");
  assert.equal(notes.length, 1);
});

test("an old Circuit stops before anything shows on its screen", async () => {
  const { ctx, fetchImpl, calls } = rig({ protocol: 43, typed: ["10.0.0.2"] });
  await assert.rejects(runPairing(ctx, { fetchImpl }), (e) => e.code === "too_old");
  assert.ok(!calls.some((c) => c.path === "/model-clients/pair"));
});
