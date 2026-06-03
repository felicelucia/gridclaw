# 🇮🇹 Italy module (reference)

The reference GridClaw country module, maintained by a renewable-energy developer with a ~100 MW BESS pipeline in Campania.

## What it covers

- **Authorities** — ARERA (regulator), Terna (TSO), e-distribuzione (DSO), MASE (ministry / single-authorization), GSE (incentives), GME (power exchange).
- **Schemes** — MACSE (15-yr storage tolling), Capacity Market, merchant + ancillary (MSD), FER-X.
- **Permitting** — Autorizzazione Unica for standalone BESS via MASE (portal live 2 Dec 2024), PAUR when regional VIA is triggered.
- **Grid** — STMG is the binding answer; Southern Italy HV grid is saturated.
- **Living norms** — DM 190/2024 (MACSE), D.Lgs 199/2021 (RED II), TICA (connections), D.L. 7/2002, D.Lgs 152/2006 (VIA/PAUR).
- **Finance defaults** — 2025 Italian LFP turnkey capex and a MACSE-tolled + merchant revenue stack.

## Files

- `module.json` — structured knowledge consumed by the kernel.
- `constraints.js` — coordinate → landscape / hydrogeological / substation screen.

## Sources

- Terna — MACSE & Capacity Market: <https://www.terna.it>
- MASE — single-authorization guidelines (16 Apr 2024) and portal (2 Dec 2024): <https://www.mase.gov.it>
- ARERA — TICA connection rules & STMG: <https://www.arera.it>
- *Energy-Storage.news*, "Terna is the big winner" (28 Oct 2025): <https://www.energy-storage.news/terna-is-the-big-winner-taking-stock-of-italys-macse-auction/>
- *ess-news*, "Italy launches new one-stop application system for battery projects" (12 Nov 2024): <https://www.ess-news.com/2024/11/12/italy-launches-new-one-stop-application-system-for-battery-projects/>

## Disclaimer

Decision-support only. Confirm with the competent authority and Terna's STMG. Norms change — keep `date` fields current.
