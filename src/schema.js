// The JSON shape we force Gemini's final answer to follow ("structured output").
// This is a JSON Schema: it lists every field, its type, and which are required.
// Because the model must obey it, the UI can rely on the data always looking like this.

const money = { type: "number", description: "Amount in British pounds (GBP)" };

export const TRIP_SCHEMA = {
  type: "object",
  properties: {
    destination: { type: "string", description: "City and country" },
    summary: { type: "string", description: "2-3 sentence overview of the trip" },
    budget: {
      type: "object",
      properties: {
        total_gbp: { ...money, description: "The user's budget in GBP" },
        estimated_cost_gbp: { ...money, description: "Estimated total trip cost in GBP" },
        remaining_gbp: { ...money, description: "total_gbp minus estimated_cost_gbp" },
        within_budget: { type: "boolean" },
        exchange_rate_note: {
          type: "string",
          description: "Which currencies were converted and the live rate used",
        },
      },
      required: ["total_gbp", "estimated_cost_gbp", "remaining_gbp", "within_budget"],
    },
    itinerary: {
      type: "array",
      description: "One entry per day, in order",
      items: {
        type: "object",
        properties: {
          day: { type: "integer", description: "Day number starting at 1" },
          date: { type: "string", description: "YYYY-MM-DD if known, otherwise empty" },
          title: { type: "string" },
          weather: {
            type: "object",
            properties: {
              conditions: { type: "string" },
              min_c: { type: "number" },
              max_c: { type: "number" },
            },
            required: ["conditions"],
          },
          activities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time: { type: "string", description: "e.g. Morning, 14:00" },
                description: { type: "string" },
                original_price: {
                  type: "string",
                  description: "Price in local currency, e.g. '25 EUR'. Empty if free.",
                },
                cost_gbp: money,
              },
              required: ["time", "description", "cost_gbp"],
            },
          },
          daily_cost_gbp: money,
        },
        required: ["day", "title", "activities", "daily_cost_gbp"],
      },
    },
    tips: { type: "array", items: { type: "string" } },
  },
  required: ["destination", "summary", "budget", "itinerary"],
};
