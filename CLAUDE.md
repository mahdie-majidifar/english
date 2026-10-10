# AI English Coach: instructions for Claude

- The user speaks Persian. Answer in Persian; keep code, identifiers and prompts in English.
- **Start every session by reading `docs/PROGRESS.md`**, then `docs/README.md` (decisions, deviations, deferred list). Continue from where `PROGRESS.md` says the work stopped.
- **Keep `docs/PROGRESS.md` current**: update it whenever a task finishes or the plan changes, then commit and push (`origin` main). Commit and push after each finished chunk of work.
- UI language is English with short Persian explanations. Never use text smaller than 12px.
- Verify UI changes with screenshots (browser pane), not only DOM text.
- Never commit `.env`. AI keys stay server-side.
- Check: `pnpm turbo run typecheck test build` must pass before committing.
