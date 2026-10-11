# Project workflow

- For frontend work, use `.codex/skills/frontend-design/SKILL.md`. Read its required project documents before editing the interface. For substantial visual or responsive changes, follow its reference checklists as well.
- For accessibility audits and changes to keyboard navigation, dialog focus, form labels, contrast or status announcements, also use `.codex/skills/wcag-audit-patterns/SKILL.md` and its relevant references. Combine automated checks with manual verification of the affected interactions.
- For changes to text sizes, line spacing, wrapping, numeric alignment or font loading, also use `.codex/skills/web-typography/SKILL.md` and its relevant references. Adapt its guidance to Kontur's existing compact interface and design tokens; do not copy its starter stylesheet wholesale. Project design documents take priority over generic skill defaults.
- Write interface text, hints and help in simple Russian for people without financial training. Explain what to do and use everyday examples. Explain unavoidable financial terms.
- Keep the shared budget, light/dark themes, keyboard access and phone usability working.
- For routine development and verification, use the narrowest relevant build and tests. Do not create or recreate ZIP archives, release packages, or standalone candidates unless the user directly asks for an archive/package or a release. Reuse existing artifacts when sufficient.
- This repository is public. Never commit personal budget exports, account credentials, private keys or real user data. Run `node scripts/check-public.cjs` before publication.
