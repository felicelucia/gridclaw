/* ==========================================================================
   GridClaw — Server
   --------------------------------------------------------------------------
   Express server that:
     • serves the static front-end (site/)
     • exposes  GET /api/status         → which models are live
     • exposes  GET /api/run?prompt=...  → Server-Sent Events stream of the
                                           live multi-agent Trinity swarm
   Keys live ONLY in the environment (.env). Without keys the server still
   runs and the front-end falls back to the offline deterministic engine.
   ========================================================================== */

"use strict";

require("dotenv").config();
const path = require("path");
const express = require("express");

const { run, parseBrief } = require("./agents");
const { availableModels, websearch } = require("./providers");

const app = express();
const PORT = process.env.PORT || 8099;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "site")));

// Which models are live right now?
app.get("/api/status", (_req, res) => {
  const models = availableModels().map((m) => ({ id: m.id, label: m.label, model: m.model }));
  res.json({
    live: models.length > 0,
    models,
    websearch: websearch.available(),
    trinity: models.length >= 2, // cross-critique needs ≥2 models
  });
});

// Live run — Server-Sent Events.
app.get("/api/run", async (req, res) => {
  const prompt = String(req.query.prompt || "").slice(0, 2000);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const emit = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data || {})}\n\n`);
  };

  try {
    const brief = parseBrief(prompt);
    emit("brief", brief);
    const result = await run({ brief, emit });
    if (result.offline) {
      emit("offline", { reason: "no model keys configured" });
    } else {
      emit("result", result);
    }
  } catch (e) {
    emit("error", { message: String(e).slice(0, 300) });
  } finally {
    emit("end", {});
    res.end();
  }
});

app.listen(PORT, () => {
  const models = availableModels().map((m) => m.label);
  console.log(`GridClaw server on http://localhost:${PORT}`);
  console.log(
    models.length
      ? `Live models: ${models.join(", ")}${websearch.available() ? " + web search" : ""}`
      : "No model keys set — running in OFFLINE demo mode (deterministic engine)."
  );
});
