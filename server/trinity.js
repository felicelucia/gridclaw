/* ==========================================================================
   GridClaw — Trinity Orchestrator
   --------------------------------------------------------------------------
   The "Trinity" idea: don't trust a single model. For each reasoning step we
   run Claude + GPT + DeepSeek and let them improve one another:

     ROUND 1  DRAFT      — all available models answer the same prompt in
                           parallel (independent first opinions).
     ROUND 2  CRITIQUE   — each model is shown the OTHER models' drafts and
                           asked to find errors and produce a better answer.
     ROUND 3  FUSE       — a designated "judge" model synthesises a single,
                           reconciled answer + a confidence note. If only one
                           model is available, Trinity degrades gracefully to
                           a single pass; if none are available the caller
                           uses the offline deterministic engine instead.

   Every public function streams progress events via the `emit` callback so the
   UI can show the swarm thinking live.
   ========================================================================== */

"use strict";

const { availableModels } = require("./providers");

function settle(promises) {
  return Promise.allSettled(promises);
}

/**
 * Run one Trinity step.
 * @param {Object}   o
 * @param {string}   o.system   shared system prompt (role of the agent)
 * @param {string}   o.prompt   the task
 * @param {boolean}  o.json     ask models to answer in JSON
 * @param {function} o.emit     (event, payload) => void  — progress stream
 * @param {string}   o.agentId  agent id for event tagging
 * @returns {Promise<{answer:string, drafts:Array, models:Array, single:boolean}>}
 */
async function trinityStep({ system, prompt, json = false, emit = () => {}, agentId = "agent" }) {
  const models = availableModels();

  // No keys at all → signal the caller to fall back to the offline engine.
  if (models.length === 0) {
    return { answer: null, drafts: [], models: [], single: false, offline: true };
  }

  /* ---------- ROUND 1: independent drafts (parallel) ---------- */
  emit("round", { agentId, round: "draft", models: models.map((m) => m.label) });
  const draftRes = await settle(
    models.map((m) =>
      m.chat({ system, prompt, json }).then((r) => ({ ...r, label: m.label }))
    )
  );
  const drafts = draftRes
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);

  draftRes.forEach((r, i) => {
    if (r.status === "fulfilled") {
      emit("draft", { agentId, model: models[i].label, text: r.value.text });
    } else {
      emit("model_error", { agentId, model: models[i].label, error: String(r.reason).slice(0, 160) });
    }
  });

  if (drafts.length === 0) return { answer: null, drafts: [], models: [], single: false, offline: true };
  if (drafts.length === 1) {
    return { answer: drafts[0].text, drafts, models: drafts.map((d) => d.label), single: true };
  }

  /* ---------- ROUND 2: cross-critique (each model sees the others) ---------- */
  emit("round", { agentId, round: "critique", models: drafts.map((d) => d.label) });
  const critiqueSystem =
    (system || "") +
    "\n\nYou are now in a multi-model review. You will see answers from peer models. " +
    "Identify any factual errors, missing caveats, or hallucinated norms/figures. " +
    "Then output your IMPROVED, reconciled answer only — no preamble.";

  const peerBlock = drafts
    .map((d, i) => `--- Peer ${i + 1} (${d.label}) ---\n${d.text}`)
    .join("\n\n");

  const critiqued = await settle(
    drafts.map((d, idx) => {
      const others = drafts.filter((_, i) => i !== idx);
      const peers = others
        .map((p) => `--- Peer (${p.label}) ---\n${p.text}`)
        .join("\n\n");
      const cp = `Original task:\n${prompt}\n\nYour earlier answer:\n${d.text}\n\nPeer answers to review:\n${peers}\n\nReturn your improved answer.`;
      const model = availableModels().find((m) => m.label === d.label);
      return model
        ? model.chat({ system: critiqueSystem, prompt: cp, json }).then((r) => ({ ...r, label: d.label }))
        : Promise.resolve(d);
    })
  );
  const improved = critiqued
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);
  improved.forEach((v) => emit("critique", { agentId, model: v.label, text: v.text }));

  const pool = improved.length ? improved : drafts;

  /* ---------- ROUND 3: fuse into one answer (judge = first available) ---------- */
  emit("round", { agentId, round: "fuse", judge: pool[0].label });
  const judge = availableModels()[0];
  const fuseSystem =
    (system || "") +
    "\n\nYou are the FUSION judge. Reconcile the reviewed peer answers into ONE " +
    "final answer. Prefer claims that multiple models agree on; drop unsupported " +
    "figures; keep every source/date. If models disagree on a number, state the range. " +
    (json ? "Output valid JSON only." : "");
  const fusePrompt =
    `Original task:\n${prompt}\n\nReviewed peer answers:\n` +
    pool.map((p, i) => `--- ${p.label} ---\n${p.text}`).join("\n\n") +
    `\n\nProduce the single reconciled final answer.`;

  let answer = pool[0].text;
  try {
    const f = await judge.chat({ system: fuseSystem, prompt: fusePrompt, json });
    answer = f.text || answer;
    emit("fused", { agentId, judge: judge.label });
  } catch (e) {
    emit("model_error", { agentId, model: judge.label, error: "fuse failed: " + String(e).slice(0, 120) });
  }

  return {
    answer,
    drafts,
    improved,
    models: drafts.map((d) => d.label),
    single: false,
    agreement: drafts.length, // how many models contributed
  };
}

module.exports = { trinityStep };
