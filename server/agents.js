/* ==========================================================================
   GridClaw — Agent Pipeline (LIVE)
   --------------------------------------------------------------------------
   The real multi-agent swarm. Each agent uses the Trinity orchestrator for
   reasoning and the Italy module for ground truth. The Market & IRR agent does
   NOT ask an LLM for numbers — it runs the deterministic finance core in
   engine.js (real bisection IRR/NPV). The Critic re-checks the math and the
   temporal validity of cited norms.

   The whole pipeline streams Server-Sent Events through `emit` so the existing
   front-end swarm animation can render real reasoning instead of a mock.

   If no model keys are configured, run() returns { offline:true } and the
   caller serves the deterministic offline analysis from engine.js — so the
   site is never broken, it just isn't "live".
   ========================================================================== */

"use strict";

const path = require("path");
const { trinityStep } = require("./trinity");
const { websearch, availableModels } = require("./providers");

// Reuse the browser engine (real IRR + Italy knowledge) on the server.
require(path.join(__dirname, "..", "site", "engine.js"));
const GridClaw = globalThis.GridClaw;

const ITALY_CONTEXT = `You are part of GridClaw, an energy project engine. Jurisdiction: ITALY.
Ground-truth authorities: Regulator=ARERA, TSO=Terna (HV grid, STMG, MACSE storage mechanism),
DSO=e-distribuzione (MV/LV), Ministry=MASE (single authorization for standalone BESS), Incentives=GSE.
Key living norms: DM 190/2024 (MACSE), TICA art.20 (STMG connection procedure), D.Lgs 152/2006 (VIA/EIA),
MASE single-authorization portal live since 2 Dec 2024. Southern Italy HV grid is saturated — only Terna's
STMG gives a binding connection answer. ALWAYS attach a source and a date to every claim. Be concise.`;

async function run({ brief, emit }) {
  const models = availableModels();
  if (models.length === 0) {
    return { offline: true };
  }
  emit("models", { active: models.map((m) => m.label), websearch: websearch.available() });

  const out = {};

  /* ---------------- AGENT 1: Source Finder (REAL web search) ---------------- */
  emit("agent_start", { id: "source", name: "Source Finder" });
  let sources = [];
  if (websearch.available()) {
    try {
      const q = `Current official authorities, permitting iter and grid connection rules for a ${brief.tech} ` +
        `(${brief.mw} MW / ${brief.mwh} MWh) project in ${brief.location}. ` +
        `Include the regulator, TSO, ministry/permitting authority, the latest MACSE storage auction status, ` +
        `and the connection procedure. Cite official sources with dates.`;
      const ws = await websearch.search({ query: q, system: ITALY_CONTEXT });
      sources = ws.citations || [];
      emit("source_web", { text: ws.text, citations: sources });
    } catch (e) {
      emit("model_error", { agentId: "source", model: websearch.label, error: String(e).slice(0, 160) });
    }
  } else {
    emit("source_web", { text: "Web search key not set — using Italy module ground truth.", citations: [] });
  }
  out.source = { citations: sources };
  emit("agent_done", { id: "source" });

  /* ---------------- AGENT 2: Permitting (Trinity) ---------------- */
  emit("agent_start", { id: "permitting", name: "Permitting" });
  const perm = await trinityStep({
    agentId: "permitting",
    system: ITALY_CONTEXT,
    emit,
    prompt: `Classify the authorization iter for a standalone ${brief.tech} (${brief.mw} MW / ${brief.mwh} MWh) ` +
      `in ${brief.location}. State: (1) the iter and authority, (2) whether VIA/EIA is triggered and why ` +
      `(consider Cilento national park proximity), (3) an estimated timeline in months, ` +
      `(4) the exact norms with dates. Flag anything that needs a human expert.`,
  });
  out.permitting = perm;
  emit("agent_done", { id: "permitting" });

  /* ---------------- AGENT 3: Grid (Trinity) ---------------- */
  emit("agent_start", { id: "grid", name: "Grid" });
  const grid = await trinityStep({
    agentId: "grid",
    system: ITALY_CONTEXT,
    emit,
    prompt: `Assess grid connection for a ${brief.mw} MW ${brief.tech} near ${brief.location}. ` +
      `Explain: voltage level (HV/MV), why a preliminary estimate is non-binding and STMG is required, ` +
      `the saturation situation in Southern Italy, and the nearest plausible Terna HV node. ` +
      `Be explicit that only the STMG from Terna gives the binding truth.`,
  });
  out.grid = grid;
  emit("agent_done", { id: "grid" });

  /* ---------------- AGENT 4: Market & IRR (REAL math, not LLM) ---------------- */
  emit("agent_start", { id: "market", name: "Market & IRR" });
  // Deterministic finance core — identical to the offline engine, real bisection IRR.
  const analysis = GridClaw.analyze(brief.raw || `${brief.mw}MW ${brief.mwh}MWh ${brief.tech} ${brief.location}`);
  const fin = analysis.format.block6_finance;
  emit("market_numbers", {
    capex: fin.capex, equity: fin.equity, debt: fin.debt,
    projectIRR: fin.projectIRR, equityIRR: fin.equityIRR, projectNPV: fin.projectNPV,
    projectIRRpct: fin.projectIRRpct, equityIRRpct: fin.equityIRRpct,
    payback: fin.paybackYears, scenarios: fin.scenarios,
  });
  // Trinity interprets the numbers (revenue stack, risk) — but never invents them.
  const market = await trinityStep({
    agentId: "market",
    system: ITALY_CONTEXT,
    emit,
    prompt: `These are FIXED, independently computed financials for the project (do not change the numbers, ` +
      `interpret them): Capex €${(fin.capex / 1e6).toFixed(1)}M, project IRR ${fin.projectIRRpct}, ` +
      `equity IRR ${fin.equityIRRpct}, payback ${fin.paybackYears} yrs. ` +
      `Scenarios: ${fin.scenarios.map((s) => `${s.label}=${s.projectIRRpct}`).join(", ")}. ` +
      `Explain the revenue stack (MACSE 15-yr tolling + merchant/ancillary), which scenario is most bankable, ` +
      `and the main financial risk. Keep it under 120 words.`,
  });
  out.market = { ...market, numbers: fin };
  emit("agent_done", { id: "market" });

  /* ---------------- AGENT 5: Critic (verify, don't generate) ---------------- */
  emit("agent_start", { id: "critic", name: "Critic" });
  // Independent IRR recompute (math truth check).
  const recomputed = GridClaw.irr(fin.cashflows || analysis.format.block6_finance.cashflows || []);
  const irrMatch =
    recomputed != null && fin.projectIRR != null
      ? Math.abs(recomputed - fin.projectIRR) < 1e-6
      : null;
  const critic = await trinityStep({
    agentId: "critic",
    system: ITALY_CONTEXT + "\n\nYou are the CRITIC. Verify claims; do not invent new ones.",
    emit,
    prompt: `Review the prior agents' outputs for this project. Check: (a) are all cited norms still in force ` +
      `with correct dates? (b) is any figure unsupported? (c) which items genuinely need a human expert ` +
      `(landscape/PAI/STMG)? The project IRR was independently recomputed and ` +
      `${irrMatch === true ? "MATCHES within 1e-6 ✓" : irrMatch === false ? "DID NOT match — flag it" : "could not be re-derived"}. ` +
      `Output a short verdict + a bullet list of '⚠️ needs human' items.`,
  });
  out.critic = { ...critic, irrMatch, recomputed };
  emit("agent_done", { id: "critic" });

  // Final structured Format = deterministic skeleton + live narrative overlays.
  out.format = analysis.format;
  out.verdict = analysis.verdict;
  out.brief = brief;
  out.live = true;
  return out;
}

module.exports = { run, parseBrief: (t) => GridClaw.parseBrief(t) };
