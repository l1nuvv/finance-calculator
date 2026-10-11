# Web Typography Skill

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Expert front-end web typography guidance for AI coding agents working in HTML,
CSS, JSX, Tailwind, design systems, and web app interfaces.

This skill helps agents choose and pair fonts, build fluid type scales, set
readable measure and rhythm, fix heading wraps, improve web-font loading, reduce
font-driven layout shift, and run an accessibility pass against WCAG text
requirements.

## What It Includes

- `SKILL.md` - core workflow and trigger guidance.
- `assets/starter.css` - accessible system-font and web-font starter CSS.
- `references/foundations.md` - classical typography principles for the web.
- `references/fluid-scale.md` - modular and fluid type scales with `clamp()`.
- `references/font-loading.md` - web-font performance and CLS prevention.
- `references/accessibility.md` - WCAG-oriented typography checks.
- `references/modern-css.md` - progressive enhancement with modern CSS type features.
- `references/decision-records.md` - rationale and decision records.

## Install

For Codex:

```bash
./scripts/install-codex-skill.sh
```

Manual install:

```bash
mkdir -p ~/.codex/skills/web-typography
rsync -a --delete ./ ~/.codex/skills/web-typography/
```

For other agents that use filesystem skills, copy this folder into that agent's
skills directory.

## Example Prompts

```text
Use $web-typography to set up a readable type scale for this landing page.
```

```text
Use $web-typography to fix the body copy, heading wraps, and font loading CLS in this React app.
```

## Provenance

This is an independent synthesis of widely taught typographic principles and
modern web implementation practices. It credits the lineage of ideas where useful,
but does not reproduce source prose, layouts, or proprietary examples.

See [ATTRIBUTION.md](ATTRIBUTION.md) and [LICENSE-REVIEW.md](LICENSE-REVIEW.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
