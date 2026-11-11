// Central place for settings you may want to change later.
export const MODEL = "gemini-3.8-flash";

// The agent stops looping after this many "model asks for a tool -> we run it" rounds.
// It's a safety net so a confused model can never loop (and bill you) forever.
export const MAX_TOOL_ROUNDS = 8;
