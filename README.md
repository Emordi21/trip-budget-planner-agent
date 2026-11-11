# ✈️ Trip Budget Planner Agent

An AI agent that finds a trip within your budget, checks the weather, converts prices to GBP with a **live** exchange rate, and returns a **day-by-day itinerary as structured JSON**.

Built with **Vite** (vanilla JavaScript) and the **Google Gen AI SDK** (`@google/genai`), model `gemini-3.8-flash`.

## Run it

```bash
npm install
npm run dev        # open the printed http://localhost:5173 address
```

Paste your Gemini API key (free from https://aistudio.google.com/apikey) into the page, fill in the trip form, and click **Plan my trip**.

Other commands: `npm run build` (production build into `dist/`), `npm test` (tests; two of them call live APIs).

## How the agent works

```
You ──► Gemini ──asks──► get_weather_forecast ──► Open-Meteo (live weather)
          ▲     ──asks──► convert_to_gbp ───────► Frankfurter (live ECB rates)
          │     ──uses──► google_search (built in, runs on Google's side)
          └── results go back to Gemini, which keeps going until it has enough
                         │
                         ▼
        final call with a JSON schema ──► itinerary JSON ──► the page
```

1. **Research phase** – we send your request plus the tools. Gemini replies either with an answer or with `function_call` steps ("please run `convert_to_gbp` with 25 EUR"). We run the function in the browser and send a `function_result` back. This repeats (max 8 rounds) until Gemini stops asking.
2. **Structured-output phase** – one last call with a JSON schema (`response_format`) forces the answer into the exact shape the page needs.

## Files

| File | What it does |
| --- | --- |
| `src/config.js` | Model name and the loop safety limit |
| `src/tools.js` | Tool declarations (what Gemini sees) and implementations (what actually runs) |
| `src/schema.js` | The JSON schema for the itinerary |
| `src/agent.js` | The agent loop |
| `src/main.js` | The page: API key, form, progress log, rendering |
| `tests/` | Tests: a fake Gemini for the loop, live calls for the tools |

## Good to know

- **Your API key stays in your browser** (tab storage by default, or this device if you tick "Remember") and is sent only to Google. That's fine for a personal tool. If you ever publish this for other people, move the Gemini calls to a small backend so keys aren't exposed.
- Weather forecasts only reach 16 days ahead.
- Prices come from Google Search results and the model's reasoning, so treat them as estimates and check before booking.
