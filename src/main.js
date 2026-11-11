import "./style.css";
import { planTrip } from "./agent.js";

const $ = (selector) => document.querySelector(selector);
const KEY_NAME = "gemini_api_key";

// ---------------------------------------------------------------------------
// API key handling
// sessionStorage = forgotten when you close the tab (safer default).
// localStorage   = kept on this device, only if the user ticks "Remember".
// ---------------------------------------------------------------------------
function loadKey() {
  return sessionStorage.getItem(KEY_NAME) || localStorage.getItem(KEY_NAME) || "";
}

function saveKey(key, remember) {
  sessionStorage.setItem(KEY_NAME, key);
  if (remember) localStorage.setItem(KEY_NAME, key);
  else localStorage.removeItem(KEY_NAME);
}

function updateKeyStatus() {
  const hasKey = Boolean(loadKey());
  $("#key-status").textContent = hasKey ? "✅ Key saved." : "Enter your key to get started.";
  $("#plan-btn").disabled = !hasKey;
}

$("#key-form").addEventListener("submit", (event) => {
  event.preventDefault(); // stop the browser reloading the page
  saveKey($("#api-key").value.trim(), $("#remember").checked);
  $("#api-key").value = ""; // don't leave the key sitting in the input box
  updateKeyStatus();
});

// ---------------------------------------------------------------------------
// Building the page safely.
// h() creates elements and uses textContent, which treats everything as plain
// text. We avoid innerHTML because the model's output is untrusted text.
// ---------------------------------------------------------------------------
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  const { className, text } = props;
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  for (const child of children.flat()) if (child) el.append(child);
  return el;
}

const gbp = (n) => `£${(Number(n) || 0).toFixed(2)}`;

function renderResult(plan) {
  const root = $("#result");

  // Off-topic requests just get the assistant's polite redirect.
  if (plan.status === "off_topic") {
    root.replaceChildren(h("div", { className: "card" }, h("p", { text: plan.message })));
    root.hidden = false;
    return;
  }

  const { trip, location: loc, weather, budget: b } = plan;
  const sections = [
    h("div", { className: "card" },
      h("h2", { text: trip.title }),
      h("p", { className: "hint", text: `${loc.city}, ${loc.country} · ${trip.duration_days} days · ${trip.travellers} traveller(s)` }),
      h("p", { text: trip.summary }),
      h("div", { className: "summary-grid" },
        stat("Budget", gbp(b.total_gbp)),
        stat("Estimated cost", gbp(b.estimated_cost_gbp)),
        stat(b.within_budget ? "Left over" : "Over budget", gbp(Math.abs(b.remaining_gbp)), b.within_budget ? "ok" : "bad"),
      ),
    ),
    weather && h("div", { className: "card" },
      h("h2", { text: "Weather" }),
      h("p", { text: weather.summary }),
      h("ul", {}, (weather.daily ?? []).map((d) =>
        h("li", { text: `${d.date}: ${d.conditions}${d.max_c != null ? `, ${d.min_c ?? "?"}–${d.max_c}°C` : ""}${d.rain_chance_percent != null ? `, ${d.rain_chance_percent}% rain` : ""}` }))),
    ),
    plan.price_conversions?.length > 0 && h("div", { className: "card" },
      h("h2", { text: "Price conversions" }),
      h("ul", {}, plan.price_conversions.map((c) =>
        h("li", { text: `${c.item}: ${c.original_amount} ${c.original_currency} → ${gbp(c.amount_gbp)}${c.rate_to_gbp ? ` (rate ${c.rate_to_gbp}${c.rate_date ? `, ${c.rate_date}` : ""})` : ""}` }))),
    ),
    plan.itinerary.map(renderDay),
    plan.tips?.length > 0 &&
      h("div", { className: "card" }, h("h2", { text: "Tips" }), h("ul", {}, plan.tips.map((t) => h("li", { text: t })))),
    h("details", {}, h("summary", { text: "View raw JSON" }), h("pre", { text: JSON.stringify(plan, null, 2) })),
  ];
  root.replaceChildren(...sections.flat().filter(Boolean));
  root.hidden = false;
}

function stat(label, value, cls = "") {
  return h("div", { className: "stat" }, h("b", { className: cls, text: value }), h("span", { text: label }));
}

function renderDay(day) {
  return h("div", { className: "card day" },
    h("h3", { text: `Day ${day.day}: ${day.title}` }),
    h("div", { className: "meta", text: day.date || "" }),
    h("ul", {}, day.activities.map((a) =>
      h("li", {},
        h("span", { text: `${a.time}: ${a.description}` }),
        h("span", { className: "cost" }, gbp(a.cost_gbp), a.original_price && h("span", { className: "orig", text: a.original_price })),
      ))),
    h("div", { className: "total", text: `Day total: ${gbp(day.daily_cost_gbp)}` }),
  );
}

// ---------------------------------------------------------------------------
// Submitting the trip form
// ---------------------------------------------------------------------------
$("#trip-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const request = {
    destination: data.destination.trim(),
    budget: Number(data.budget),
    days: Number(data.days),
    travellers: Number(data.travellers),
    startDate: data.startDate,
    interests: data.interests.trim(),
  };

  const button = $("#plan-btn");
  const list = $("#progress-list");
  button.disabled = true;
  list.replaceChildren();
  $("#progress").hidden = false;
  $("#error").hidden = true;
  $("#result").hidden = true;

  try {
    const plan = await planTrip({
      apiKey: loadKey(),
      request,
      onProgress: (message) => list.append(h("li", { text: message })),
    });
    renderResult(plan);
  } catch (err) {
    $("#error").textContent = friendlyError(err);
    $("#error").hidden = false;
  } finally {
    button.disabled = false;
  }
});

function friendlyError(err) {
  const msg = String(err?.message ?? err);
  if (/API key|401|403|PERMISSION_DENIED|UNAUTHENTICATED/i.test(msg)) {
    return "Gemini rejected your API key. Check it and save it again. (" + msg + ")";
  }
  return msg;
}

updateKeyStatus();
