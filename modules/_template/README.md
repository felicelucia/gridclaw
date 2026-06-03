# ⑂ Country module template

Copy this folder to bootstrap a new GridClaw country module.

```bash
cp -r modules/_template modules/<your-country>
```

1. Set `code` to the ISO 3166-1 alpha-2 code (e.g. `ES`, `DE`, `GR`), `name`, `flag`, `status: "active"`.
2. Fill `authorities` — regulator, TSO, DSO, ministry, incentive agency, market operator.
3. Fill `schemes` — every revenue scheme available to projects (capacity market, auctions, merchant, tolling).
4. Fill `permitting` — one entry per project type, with iter, competent authority, EIA trigger, typical months.
5. Fill `grid` — what the binding connection answer is, and the grid's saturation reality.
6. Fill `finance.defaults` — localized capex and revenue stack.
7. Fill `refNorms` — the living norms (laws + rulings) with `source` and `date`.
8. Optionally add `constraints.js` exporting `constraintScreen(lat, lon)`.

**Every field must carry a `source` and a `date`.** The Critic agent runs a temporal validity check on `refNorms` and verifies source presence on each block. Honest provenance is the product.

Open a PR — the kernel auto-registers modules by their ISO `code`.
