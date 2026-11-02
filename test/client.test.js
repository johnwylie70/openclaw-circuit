import assert from "node:assert/strict";
import { test } from "node:test";
import { CircuitError, MIN_PROTOCOL, checkCircuit, normaliseAddress } from "../src/client.js";

test("addresses get a scheme and Circuit's port", () => {
  assert.equal(normaliseAddress("192.168.1.20"), "http://192.168.1.20:3030");
  assert.equal(normaliseAddress(" mac.local:3031 "), "http://mac.local:3031");
  assert.equal(normaliseAddress("http://10.0.0.5:3030/"), "http://10.0.0.5:3030");
  assert.equal(normaliseAddress(""), null);
  assert.equal(normaliseAddress("http://"), null);
});

const reply = (status, body) => async () => new Response(JSON.stringify(body), { status });

test("an old Circuit is told apart from a missing one", async () => {
  await assert.doesNotReject(checkCircuit("http://a:3030", reply(200, { protocolVersion: MIN_PROTOCOL })));
  await assert.rejects(checkCircuit("http://a:3030", reply(200, { protocolVersion: MIN_PROTOCOL - 1 })), (e) => e.code === "too_old");
  await assert.rejects(checkCircuit("http://a:3030", reply(200, { something: "else" })), (e) => e.code === "unreachable");
  await assert.rejects(checkCircuit("http://a:3030", async () => { throw new TypeError("fetch failed"); }), (e) => e instanceof CircuitError && e.code === "unreachable");
});
