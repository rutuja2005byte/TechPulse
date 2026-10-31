# TechPulse

## Phase 3: AI story processing

1. Apply `supabase/migrations/20261031003000_add_ai_story_processing.sql` to the Supabase project.
2. Add `GEMINI_API_KEY` to the private `.env` file. `GEMINI_MODEL` defaults to `gemini-2.5-flash` and `AI_MAX_ARTICLES_PER_RUN` defaults to `100`.
3. Run `npm run process:ai` to group unprocessed articles into stories, rank those stories on one shared score, and save story/article links.

The Gemini key is used only by the server-side processor. Do not put it in client-side code or commit `.env`.
