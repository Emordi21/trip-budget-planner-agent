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

// Pick an icon for a card banner from a weather description.
function weatherIcon(conditions = "") {
  const c = conditions.toLowerCase();
  if (c.includes("thunder")) return "⛈️";
  if (c.includes("snow")) return "❄️";
  if (/rain|shower|drizzle/.test(c)) return "🌧️";
  if (c.includes("fog")) return "🌫️";
  if (/cloud|overcast/.test(c)) return "⛅";
  if (/clear|sun/.test(c)) return "☀️";
  return "🧭";
}

// One card in the grid: gradient banner on top, text below, a footer row at the bottom.
function card({ icon, badge, title, meta, body, footLeft, footRight }) {
  return h("article", { className: "card" },
    h("div", { className: "card-banner" }, badge && h("span", { className: "badge", text: badge }), icon),
    h("div", { className: "card-body" },
      h("h3", { text: title }),
      meta && h("div", { className: "meta", text: meta }),
      body,
      h("div", { className: "card-foot" }, footLeft, footRight),
    ),
  );
}

function renderResult(plan) {
  const root = $("#result");

  // Off-topic requests just get the assistant's polite redirect.
  if (plan.status === "off_topic") {
    root.replaceChildren(h("div", { className: "panel" }, h("p", { text: plan.message })));
    root.hidden = false;
    return;
  }

  const { trip, location: loc, weather, budget: b } = plan;
  // Look up each day's weather by date so the day cards can show it.
  const weatherByDate = new Map((weather?.daily ?? []).map((d) => [d.date, d]));

  const sections = [
    h("div", { className: "summary" },
      h("h2", { text: trip.title }),
      h("div", { className: "meta", text: `${loc.city}, ${loc.country} · ${trip.duration_days} days · ${trip.travellers} traveller(s)` }),
      h("p", { text: trip.summary }),
      h("div", { className: "summary-grid" },
        stat("Budget", gbp(b.total_gbp)),
        stat("Estimated cost", gbp(b.estimated_cost_gbp)),
        stat(b.within_budget ? "Left over" : "Over budget", gbp(Math.abs(b.remaining_gbp)), b.within_budget ? "" : "bad"),
      ),
    ),
    h("div", { className: "info-row" },
      weather && h("div", { className: "panel" },
        h("h2", { text: "Weather" }),
        h("p", { text: weather.summary }),
        h("ul", {}, (weather.daily ?? []).map((d) =>
          h("li", { text: `${weatherIcon(d.conditions)} ${d.date}: ${d.conditions}${d.max_c != null ? `, ${d.min_c ?? "?"}–${d.max_c}°C` : ""}${d.rain_chance_percent != null ? `, ${d.rain_chance_percent}% rain` : ""}` }))),
      ),
      plan.price_conversions?.length > 0 && h("div", { className: "panel" },
        h("h2", { text: "Price conversions" }),
        h("ul", {}, plan.price_conversions.map((c) =>
          h("li", { text: `${c.item}: ${c.original_amount} ${c.original_currency} → ${gbp(c.amount_gbp)}${c.rate_to_gbp ? ` (rate ${c.rate_to_gbp}${c.rate_date ? `, ${c.rate_date}` : ""})` : ""}` }))),
      ),
    ),
    h("h2", { className: "section-title", text: "Your day-by-day itinerary" }),
    h("div", { className: "grid" }, plan.itinerary.map((day) => renderDay(day, weatherByDate.get(day.date)))),
    plan.tips?.length > 0 &&
      h("div", { className: "panel" }, h("h2", { text: "Tips" }), h("ul", {}, plan.tips.map((t) => h("li", { text: t })))),
    h("details", {}, h("summary", { text: "View raw JSON" }), h("pre", { text: JSON.stringify(plan, null, 2) })),
  ];
  root.replaceChildren(...sections.flat().filter(Boolean));
  root.hidden = false;
}

function stat(label, value, cls = "") {
  return h("div", { className: "stat" }, h("b", { className: cls, text: value }), h("span", { text: label }));
}

function renderDay(day, w) {
  const temps = w?.max_c != null ? `, ${w.min_c ?? "?"}–${w.max_c}°C` : "";
  return card({
    icon: weatherIcon(w?.conditions),
    badge: `Day ${day.day}`,
    title: day.title,
    meta: [day.date, w && `${w.conditions}${temps}`].filter(Boolean).join(" · "),
    body: h("ul", { className: "activities" }, day.activities.map((a) =>
      h("li", {},
        h("span", { text: `${a.time}: ${a.description}` }),
        h("span", { className: "cost" }, gbp(a.cost_gbp), a.original_price && h("span", { className: "orig", text: a.original_price })),
      ))),
    footLeft: h("span", { className: "nights", text: `${day.activities.length} activities` }),
    footRight: h("span", { className: "price" }, "Day total ", h("b", { text: gbp(day.daily_cost_gbp) })),
  });
}

// ---------------------------------------------------------------------------
// Inspiration cards. Clicking one only fills in the form - the budgets are
// starting points for you to adjust, not real prices.
// ---------------------------------------------------------------------------
const IDEAS = [
  { icon: "🏰", title: "Eastern European City Break", place: "Prague, Czech Republic", days: 4, budget: 500 },
  { icon: "❄️", title: "Arctic Lights", place: "Rovaniemi, Finland", days: 4, budget: 950 },
  { icon: "🏖️", title: "Budget Med Classic", place: "Valencia, Spain", days: 7, budget: 1100 },
  { icon: "🛕", title: "Cultural Escape", place: "Chiang Mai, Thailand", days: 10, budget: 1850 },
  { icon: "🌊", title: "UK Coastal Staycation", place: "St Ives, United Kingdom", days: 5, budget: 450 },
  { icon: "🎲", title: "Surprise me", place: "Let the agent choose", days: 4, budget: 800, destination: "" },
];

function setBudget(value) {
  $("#budget").value = value;
  $("#budget-range").value = value;
}

$("#ideas-grid").replaceChildren(...IDEAS.map((idea) => {
  const button = h("button", { className: "btn-outline", text: "Use this" });
  button.type = "button";
  button.addEventListener("click", () => {
    const form = $("#trip-form");
    form.destination.value = idea.destination ?? idea.place;
    form.days.value = idea.days;
    setBudget(idea.budget);
    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  return card({
    icon: idea.icon,
    title: idea.title,
    meta: idea.place,
    footLeft: h("span", {}, h("span", { className: "nights", text: `${idea.days} days` }), h("br"), h("span", { className: "price" }, "Budget ", h("b", { text: `£${idea.budget}` }))),
    footRight: button,
  });
}));

// Keep the slider and the number box showing the same budget.
$("#budget-range").addEventListener("input", (e) => ($("#budget").value = e.target.value));
$("#budget").addEventListener("input", (e) => ($("#budget-range").value = e.target.value));

// ---------------------------------------------------------------------------
// Submitting the trip form
// ---------------------------------------------------------------------------
$("#trip-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const data = Object.fromEntries(formData);
  // Interests = every ticked chip plus anything typed in the box.
  const interests = [...formData.getAll("interest"), data.interests.trim()].filter(Boolean).join(", ");
  const request = {
    destination: data.destination.trim(),
    budget: Number(data.budget),
    days: Number(data.days),
    travellers: Number(data.travellers),
    startDate: data.startDate,
    interests,
  };

  const button = $("#plan-btn");
  const list = $("#progress-list");
  button.disabled = true;
  list.replaceChildren();
  $("#progress").hidden = false;
  $("#error").hidden = true;
  $("#result").hidden = true;
  $("#ideas").hidden = true;

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
