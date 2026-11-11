import test from "node:test";
import assert from "node:assert/strict";
import { convert_to_gbp, get_weather_forecast } from "../src/tools.js";

// These two tests call the real, live APIs, so they need internet access.
test("GBP converts to itself without a network call", async () => {
  assert.equal((await convert_to_gbp({ amount: 12.345, currency: "gbp" })).amount_gbp, 12.35);
});

test("live EUR -> GBP conversion", async () => {
  const r = await convert_to_gbp({ amount: 100, currency: "EUR" });
  assert.ok(r.amount_gbp > 50 && r.amount_gbp < 150, JSON.stringify(r));
});

test("live weather forecast", async () => {
  const r = await get_weather_forecast({ location: "Lisbon", days: 3 });
  assert.equal(r.days.length, 3);
  assert.equal(typeof r.days[0].max_c, "number");
});
