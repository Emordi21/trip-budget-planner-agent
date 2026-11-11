import { GoogleGenAI } from "@google/genai";
import { MODEL, MAX_TOOL_ROUNDS } from "./config.js";
import { TOOLS, TOOL_IMPLEMENTATIONS } from "./tools.js";
import { TRIP_SCHEMA } from "./schema.js";

const SYSTEM_INSTRUCTION = `You are a careful travel-planning agent.
- Use Google Search to find real attractions, typical prices and travel costs.
- Use get_weather_forecast to check the weather for the destination and plan around it.
- Prices you find in foreign currencies MUST be converted with convert_to_gbp. Never guess exchange rates.
- Keep the whole trip (activities, food, local transport and accommodation) within the user's GBP budget.
- If the user has not chosen a destination, pick the best one for their budget, dates and interests.`;

// Pull the plain text out of an interaction's "steps".
function getText(interaction) {
  return interaction.steps
    .filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function buildPrompt(req) {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `Today's date is ${today}.`,
    req.destination
      ? `Destination: ${req.destination}`
      : "Destination: not decided - please choose a good one.",
    `Budget: £${req.budget} GBP in total for ${req.travellers} traveller(s).`,
    `Length of trip: ${req.days} day(s)${req.startDate ? `, starting ${req.startDate}` : ""}.`,
    req.interests ? `Interests: ${req.interests}` : "",
    "Plan the trip.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Runs the agent and returns the trip plan as a JavaScript object.
 *
 * @param {object}   options
 * @param {string}   options.apiKey      The user's Gemini API key
 * @param {object}   options.request     { destination, budget, days, travellers, startDate, interests }
 * @param {function} options.onProgress  Called with a short message each time something happens
 * @param {object}   [options.client]    Lets tests pass in a fake client
 */
export async function planTrip({ apiKey, request, onProgress = () => {}, client }) {
  const ai = client ?? new GoogleGenAI({ apiKey });

  // ---- Phase 1: research ---------------------------------------------------
  // Give the model its tools and let it decide which ones to use.
  onProgress("Thinking about your trip...");
  let interaction = await ai.interactions.create({
    model: MODEL,
    system_instruction: SYSTEM_INSTRUCTION,
    input: buildPrompt(request),
    tools: TOOLS,
  });

  // The agent loop: while the model asks for functions, run them and send the results back.
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const calls = interaction.steps.filter((step) => step.type === "function_call");
    if (calls.length === 0) break; // The model is done researching.

    // The model may ask for several tools at once (e.g. weather + 3 currency conversions),
    // so we run them all in parallel.
    const results = await Promise.all(
      calls.map(async (call) => {
        onProgress(describeCall(call));
        try {
          const fn = TOOL_IMPLEMENTATIONS[call.name];
          if (!fn) throw new Error(`Unknown tool "${call.name}"`);
          return { type: "function_result", call_id: call.id, name: call.name, result: await fn(call.arguments) };
        } catch (err) {
          // Don't crash - tell the model what went wrong so it can recover or work around it.
          return { type: "function_result", call_id: call.id, name: call.name, is_error: true, result: { error: err.message } };
        }
      }),
    );

    // Send the results back. previous_interaction_id links this call to the
    // conversation so far, so we don't have to resend the history ourselves.
    interaction = await ai.interactions.create({
      model: MODEL,
      system_instruction: SYSTEM_INSTRUCTION,
      previous_interaction_id: interaction.id,
      input: results,
      tools: TOOLS,
    });
  }

  if (interaction.steps.some((step) => step.type === "function_call")) {
    throw new Error("The agent used too many tool rounds without finishing. Please try again.");
  }

  // ---- Phase 2: structured output -----------------------------------------
  // Now ask for the final answer, forced to match TRIP_SCHEMA.
  onProgress("Writing your day-by-day itinerary...");
  const final = await ai.interactions.create({
    model: MODEL,
    system_instruction: SYSTEM_INSTRUCTION,
    previous_interaction_id: interaction.id,
    input:
      "Using everything you found, produce the final trip plan. " +
      "Every cost must be in GBP and the daily costs must add up to the estimated total.",
    response_format: { type: "text", mime_type: "application/json", schema: TRIP_SCHEMA },
  });

  const text = getText(final);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The model did not return valid JSON. Please try again.");
  }
}

function describeCall(call) {
  const args = call.arguments ?? {};
  if (call.name === "get_weather_forecast") return `Checking the weather in ${args.location}...`;
  if (call.name === "convert_to_gbp") return `Converting ${args.amount} ${args.currency} to GBP...`;
  return `Running ${call.name}...`;
}
