// The JSON shape we force Gemini's final answer to follow ("structured output").
// This is a JSON Schema: it lists every field, its type, and which are required.
// Because the model must obey it, the UI can rely on the data always looking like this.

const gbp = (description) => ({ type: "number", description });

export const TRIP_SCHEMA = {
  type: "object",
  properties: {
    // Every answer says which kind it is. Off-topic questions get "off_topic"
    // plus a friendly message steering the user back to travel.
    status: { type: "string", enum: ["trip_plan", "off_topic"] },
    message: {
      type: "string",
      description:
        "For off_topic: a polite sentence bringing the user back to travel. For trip_plan: a short friendly intro.",
    },

    trip: {
      type: "object",
      properties: {
        title: { type: "string" },
        summary: { type: "string", description: "2-3 sentence overview" },
        start_date: { type: "string", description: "YYYY-MM-DD, or empty if unknown" },
        duration_days: { type: "integer" },
        travellers: { type: "integer" },
      },
      required: ["title", "summary", "duration_days", "travellers"],
    },

    location: {
      type: "object",
      properties: {
        city: { type: "string" },
        country: { type: "string" },
        local_currency: { type: "string", description: "3-letter ISO code, e.g. EUR" },
      },
      required: ["city", "country", "local_currency"],
    },

    weather: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One sentence on what to expect and what to pack" },
        daily: {
          type: "array",
          items: {
            type: "object",
            properties: {
              date: { type: "string" },
              conditions: { type: "string" },
              min_c: { type: "number" },
              max_c: { type: "number" },
              rain_chance_percent: { type: "number" },
            },
            required: ["date", "conditions"],
          },
        },
      },
      required: ["summary", "daily"],
    },

    // Every foreign price that was converted, showing both the original and GBP amounts.
    price_conversions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string", description: "What the price is for" },
          original_amount: { type: "number" },
          original_currency: { type: "string", description: "3-letter ISO code" },
          rate_to_gbp: { type: "number" },
          amount_gbp: gbp("Converted amount in GBP"),
          rate_date: { type: "string" },
        },
        required: ["item", "original_amount", "original_currency", "amount_gbp"],
      },
    },

    budget: {
      type: "object",
      properties: {
        total_gbp: gbp("The user's budget in GBP"),
        estimated_cost_gbp: gbp("Estimated total trip cost in GBP"),
        remaining_gbp: gbp("total_gbp minus estimated_cost_gbp"),
        within_budget: { type: "boolean" },
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
                cost_gbp: gbp("Cost in GBP"),
              },
              required: ["time", "description", "cost_gbp"],
            },
          },
          daily_cost_gbp: gbp("Total for the day in GBP"),
        },
        required: ["day", "title", "activities", "daily_cost_gbp"],
      },
    },
    tips: { type: "array", items: { type: "string" } },
  },
  // Only these are always required. The trip fields are required when status is "trip_plan"
  // (the UI checks this), so an off-topic reply doesn't have to invent a fake trip.
  required: ["status", "message"],
};
