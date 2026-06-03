/* ==========================================================================
   GridClaw — Model Providers
   --------------------------------------------------------------------------
   A thin, uniform adapter over the three "Trinity" reasoning models plus a
   web-search provider. Every provider exposes the SAME async signature:

       await provider.chat({ system, prompt, json })  ->  { text, model, ok }

   so the orchestrator can treat Claude, GPT and DeepSeek interchangeably.
   Keys are read from environment variables ONLY (see .env.example). Nothing
   is ever hard-coded and nothing is exposed to the browser.
   ========================================================================== */

"use strict";

const TIMEOUT_MS = 60000;

async function withTimeout(promise, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await promise(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

function stripJsonFence(s) {
  if (!s) return s;
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : s).trim();
}

/* ----------------------------- Anthropic (Claude) ----------------------------- */
const claude = {
  id: "claude",
  label: "Claude",
  model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
  available: () => !!process.env.ANTHROPIC_API_KEY,
  async chat({ system, prompt, json }) {
    const body = {
      model: this.model,
      max_tokens: 1500,
      system: system || "",
      messages: [{ role: "user", content: prompt }],
    };
    const r = await withTimeout((signal) =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      })
    );
    if (!r.ok) throw new Error(`claude ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    let text = (d.content || []).map((c) => c.text || "").join("").trim();
    if (json) text = stripJsonFence(text);
    return { text, model: this.model, provider: this.id, ok: true };
  },
};

/* ------------------------------- OpenAI (GPT) -------------------------------- */
const gpt = {
  id: "gpt",
  label: "GPT",
  model: process.env.OPENAI_MODEL || "gpt-4o",
  available: () => !!process.env.OPENAI_API_KEY,
  async chat({ system, prompt, json }) {
    const body = {
      model: this.model,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    };
    const r = await withTimeout((signal) =>
      fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(body),
      })
    );
    if (!r.ok) throw new Error(`gpt ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    let text = (d.choices?.[0]?.message?.content || "").trim();
    if (json) text = stripJsonFence(text);
    return { text, model: this.model, provider: this.id, ok: true };
  },
};

/* ------------------------------- DeepSeek ------------------------------------ */
const deepseek = {
  id: "deepseek",
  label: "DeepSeek",
  model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  available: () => !!process.env.DEEPSEEK_API_KEY,
  async chat({ system, prompt, json }) {
    const body = {
      model: this.model,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    };
    const r = await withTimeout((signal) =>
      fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify(body),
      })
    );
    if (!r.ok) throw new Error(`deepseek ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    let text = (d.choices?.[0]?.message?.content || "").trim();
    if (json) text = stripJsonFence(text);
    return { text, model: this.model, provider: this.id, ok: true };
  },
};

/* --------------------- Web search (Perplexity Sonar) ------------------------- */
/* Returns grounded text WITH citations so the Source Finder cites real URLs.   */
const websearch = {
  id: "perplexity",
  label: "Perplexity Sonar",
  model: process.env.PERPLEXITY_MODEL || "sonar",
  available: () => !!process.env.PERPLEXITY_API_KEY,
  async search({ query, system }) {
    const body = {
      model: this.model,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: query },
      ],
      return_citations: true,
    };
    const r = await withTimeout((signal) =>
      fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        },
        body: JSON.stringify(body),
      })
    );
    if (!r.ok) throw new Error(`perplexity ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    const text = (d.choices?.[0]?.message?.content || "").trim();
    const citations = d.citations || d.search_results?.map((s) => s.url) || [];
    return { text, citations, model: this.model, ok: true };
  },
};

const TRINITY = [claude, gpt, deepseek];

function availableModels() {
  return TRINITY.filter((p) => p.available());
}

module.exports = { claude, gpt, deepseek, websearch, TRINITY, availableModels };
