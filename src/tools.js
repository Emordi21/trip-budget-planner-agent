// ---------------------------------------------------------------------------
// The "function calling" tools.
//
// Each tool has two parts:
//   1. A DECLARATION  – a description of the tool that we send to Gemini, so the
//      model knows the tool exists, what it does and which arguments it needs.
//      (Same shape as the declarations in your example.)
//   2. An IMPLEMENTATION – a normal JavaScript function that runs in the browser
//      when the model asks for it. The model never runs code itself; it only
//      *asks* us to run it and we send the result back.
// ---------------------------------------------------------------------------

// ---- Declarations ---------------------------------------------------------

export const get_weather_forecast_declaration = {
  type: "function",
  name: "get_weather_forecast",
  description:
    "Gets the daily weather forecast (min/max temperature in Celsius, rain chance, conditions) " +
    "for a location, starting today. Forecasts only reach 16 days ahead.",
  parameters: {
    type: "object",
    properties: {
      location: { type: "string", description: "City name, e.g. 'Lisbon' or 'Kyoto, Japan'" },
      days: {
        type: "integer",
        description: "How many days of forecast to return, 1-16. Defaults to 7.",
      },
    },
    required: ["location"],
  },
};

export const convert_to_gbp_declaration = {
  type: "function",
  name: "convert_to_gbp",
  description:
    "Converts a price in a foreign currency into British pounds (GBP) using a live exchange rate. " +
    "Always use this for prices quoted in non-GBP currencies instead of guessing the rate.",
  parameters: {
    type: "object",
    properties: {
      amount: { type: "number", description: "The price in the foreign currency" },
      currency: {
        type: "string",
        description: "3-letter ISO currency code, e.g. EUR, USD, JPY",
      },
    },
    required: ["amount", "currency"],
  },
};

// Google web search is a *built-in* tool: Google runs it for us, so there is
// nothing to implement – we only switch it on.
export const google_search_tool = { type: "google_search" };

export const TOOLS = [
  google_search_tool,
  get_weather_forecast_declaration,
  convert_to_gbp_declaration,
];

// ---- Implementations ------------------------------------------------------

// Open-Meteo turns a numeric "weather code" into a condition. Here is the lookup table.
const WEATHER_CODES = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Freezing fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow",
  80: "Light showers", 81: "Showers", 82: "Violent showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
};

// Small helper: fetch JSON and throw a readable error if something goes wrong.
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status}) for ${new URL(url).host}`);
  return res.json();
}

export async function get_weather_forecast({ location, days = 7 }) {
  // Step 1: turn the place name into latitude/longitude ("geocoding").
  const geo = await fetchJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`,
  );
  const place = geo.results?.[0];
  if (!place) throw new Error(`Could not find a place called "${location}"`);

  // Step 2: ask for the daily forecast at those coordinates.
  const n = Math.min(Math.max(Math.round(Number(days)) || 7, 1), 16);
  const forecast = await fetchJson(
    "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${place.latitude}&longitude=${place.longitude}` +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      `&timezone=auto&forecast_days=${n}`,
  );

  const d = forecast.daily;
  return {
    location: `${place.name}, ${place.country ?? ""}`.replace(/, $/, ""),
    days: d.time.map((date, i) => ({
      date,
      conditions: WEATHER_CODES[d.weather_code[i]] ?? "Unknown",
      max_c: d.temperature_2m_max[i],
      min_c: d.temperature_2m_min[i],
      rain_chance_percent: d.precipitation_probability_max[i],
    })),
  };
}

export async function convert_to_gbp({ amount, currency }) {
  const code = String(currency).trim().toUpperCase();
  const value = Number(amount);
  if (!Number.isFinite(value)) throw new Error(`"${amount}" is not a valid amount`);
  if (code === "GBP") return { amount_gbp: round2(value), rate: 1, currency: "GBP", date: "today" };

  // Frankfurter serves live European Central Bank exchange rates. Free, no API key.
  const data = await fetchJson(
    `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(code)}&symbols=GBP`,
  );
  const rate = data.rates?.GBP;
  if (!rate) throw new Error(`No GBP exchange rate available for "${code}"`);
  return {
    original_amount: value,
    currency: code,
    rate_to_gbp: rate,
    amount_gbp: round2(value * rate),
    rate_date: data.date,
  };
}

const round2 = (n) => Math.round(n * 100) / 100;

// A lookup so the agent can find the right function from the name the model gives us.
export const TOOL_IMPLEMENTATIONS = { get_weather_forecast, convert_to_gbp };
