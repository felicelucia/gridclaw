# Contributing to GridClaw

GridClaw grows one country at a time. The highest-impact contribution is **a new country module**.

## Add your country (the main ask)

1. `cp -r modules/_template modules/<your-country>`
2. Fill `module.json` against [`format/project.schema.json`](format/project.schema.json):
   authorities, schemes, permitting iters, grid reality, finance defaults, and `refNorms`.
3. Every field needs a `source` and a `date`. The Critic agent depends on honest provenance.
4. Optionally add `constraints.js` exporting `constraintScreen(lat, lon)`.
5. Reference: [`modules/italy/module.json`](modules/italy/module.json) is the most complete example.
6. Open a PR. The kernel auto-registers modules by their ISO `code`.

## Improve the kernel

The kernel lives in [`site/engine.js`](site/engine.js): the IRR/NPV core is real; the reasoning layer is a swappable mock behind `GridClaw.reason()`. PRs welcome for:

- Live LLM backends (Claude / GPT / DeepSeek) behind the same interface.
- A persistent RAG store for living norms.
- Real connectors (grid maps, tender platforms, environmental WMS layers).

## Principles

- **Transparency over magic.** Every output is sourced and dated.
- **Generalist kernel, local truth in modules.** Don't hardcode one country into the kernel.
- **Honest about the stack.** We orchestrate open engines; credit them.

By contributing you agree your work is licensed under AGPL-3.0.
