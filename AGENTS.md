# Project workflow

- For frontend work, use `.codex/skills/frontend-design/SKILL.md`. Read its required project documents before editing the interface. For substantial visual or responsive changes, follow its reference checklists as well.
- Write interface text, hints and help in simple Russian for people without financial training. Explain what to do and use everyday examples. Explain unavoidable financial terms.
- Keep the shared budget, light/dark themes, keyboard access and phone usability working.
- For routine development and verification, use the narrowest relevant build and tests. Do not create or recreate ZIP archives, release packages, or standalone candidates unless the user directly asks for an archive/package or a release. Reuse existing artifacts when sufficient.
- This repository is public. Never commit personal budget exports, account credentials, private keys or real user data. Run `node scripts/check-public.cjs` before publication.
