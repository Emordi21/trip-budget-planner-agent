import test from "node:test";
import assert from "node:assert/strict";
import { planTrip } from "../src/agent.js";

// A pretend Gemini client. It replays scripted responses and records what we sent.
function fakeClient(responses) {
  const calls = [];
  return {
    calls,
    interactions: { create: async (params) => { calls.push(params); return responses.shift(); } },
  };
}

const PLAN = { destination: "Lisbon, Portugal", summary: "x", budget: { total_gbp: 800, estimated_cost_gbp: 500, remaining_gbp: 300, within_budget: true }, itinerary: [] };
const request = { destination: "Lisbon", budget: 800, days: 3, travellers: 1, startDate: "", interests: "" };

test("runs requested tools, sends results back, then returns structured JSON", async () => {
  const client = fakeClient([
    { id: "i1", steps: [{ type: "function_call", id: "c1", name: "convert_to_gbp", arguments: { amount: 10, currency: "GBP" } }] },
    { id: "i2", steps: [{ type: "model_output", content: [{ type: "text", text: "researched" }] }] },
    { id: "i3", steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify(PLAN) }] }] },
  ]);
  const progress = [];
  const plan = await planTrip({ client, request, onProgress: (m) => progress.push(m) });

  assert.deepEqual(plan, PLAN);
  // 2nd call returns the tool result, linked to the first interaction
  assert.equal(client.calls[1].previous_interaction_id, "i1");
  assert.equal(client.calls[1].input[0].type, "function_result");
  assert.equal(client.calls[1].input[0].call_id, "c1");
  assert.equal(client.calls[1].input[0].result.amount_gbp, 10);
  // final call asks for JSON with a schema and no tools
  assert.equal(client.calls[2].response_format.mime_type, "application/json");
  assert.equal(client.calls[2].tools, undefined);
  assert.ok(progress.some((m) => m.includes("Converting")));
});

test("a failing tool is reported to the model instead of crashing", async () => {
  const client = fakeClient([
    { id: "i1", steps: [{ type: "function_call", id: "c1", name: "nope", arguments: {} }] },
    { id: "i2", steps: [] },
    { id: "i3", steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify(PLAN) }] }] },
  ]);
  await planTrip({ client, request });
  const result = client.calls[1].input[0];
  assert.equal(result.is_error, true);
  assert.match(result.result.error, /Unknown tool/);
});

test("invalid JSON from the model gives a clear error", async () => {
  const client = fakeClient([
    { id: "i1", steps: [] },
    { id: "i2", steps: [{ type: "model_output", content: [{ type: "text", text: "not json" }] }] },
  ]);
  await assert.rejects(planTrip({ client, request }), /valid JSON/);
});
