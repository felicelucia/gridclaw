/* GridClaw UI — drives the swarm animation + renders the structured Format */
(function () {
  "use strict";
  const G = window.GridClaw;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const eur = (n) => "€" + (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.round(n).toLocaleString());
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let memCount = G.MEMORY.length;

  /* ---------- live GitHub stats ---------- */
  // Real, honest numbers pulled from the public GitHub API. No placeholders.
  const REPO = "felicelucia/gridclaw";

  function countUp(id, target) {
    const node = document.getElementById(id); if (!node) return;
    target = Number(target) || 0;
    let v = 0; const step = () => {
      v += Math.max(1, Math.ceil((target - v) / 12)); if (v >= target) v = target;
      node.textContent = v.toLocaleString();
      if (v < target) requestAnimationFrame(step);
    };
    if (target <= 0) { node.textContent = "0"; } else { step(); }
  }

  async function loadStats() {
    try {
      const r = await fetch("https://api.github.com/repos/" + REPO, { headers: { Accept: "application/vnd.github+json" } });
      if (!r.ok) throw new Error("gh " + r.status);
      const d = await r.json();
      const stars = d.stargazers_count || 0;
      const forks = d.forks_count || 0;
      countUp("navstars", stars);
      countUp("herostars", stars);
      countUp("heroforks", forks);
      // contributors: count via the contributors endpoint (fallback to 1)
      try {
        const cr = await fetch("https://api.github.com/repos/" + REPO + "/contributors?per_page=100&anon=1", { headers: { Accept: "application/vnd.github+json" } });
        if (cr.ok) { const cl = await cr.json(); const n = Array.isArray(cl) ? cl.length : 1; countUp("herocontrib", n); const lbl = document.getElementById("contriblabel"); if (lbl) lbl.textContent = n === 1 ? "contributor" : "contributors"; }
      } catch (e) { /* keep default */ }
    } catch (e) {
      // Offline / rate-limited: leave honest zeros in place.
      ["navstars", "herostars", "heroforks"].forEach(id => { const n = document.getElementById(id); if (n) n.textContent = "0"; });
    }
  }

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12 });
  document.querySelectorAll(".reveal").forEach(n => io.observe(n));

  /* ---------- render memory ---------- */
  function renderMemory() {
    const grid = $("#memgrid"); grid.innerHTML = "";
    G.MEMORY.forEach(m => {
      const c = el("div", "mem reveal");
      c.innerHTML = `<div class="mt">${m.country} ${m.name}</div>
        <div class="mmeta"><span class="mtag">${m.state}</span><span class="mtag">${m.date}</span></div>
        <div class="mn">${m.note}</div>`;
      grid.appendChild(c); io.observe(c);
    });
  }

  /* ---------- render module map ---------- */
  function renderModules() {
    const box = $("#modules"); box.innerHTML = "";
    const mods = [
      { flag: "🇮🇹", name: "Italy", st: "✅ active", cls: "active" },
      { flag: "🇪🇸", name: "Spain", st: "⑂ fork me", cls: "empty" },
      { flag: "🇩🇪", name: "Germany", st: "⑂ fork me", cls: "empty" },
      { flag: "🇬🇷", name: "Greece", st: "⑂ fork me", cls: "empty" },
      { flag: "🇫🇷", name: "France", st: "⑂ fork me", cls: "empty" },
      { flag: "🇬🇧", name: "UK", st: "⑂ fork me", cls: "empty" },
      { flag: "🇵🇹", name: "Portugal", st: "⑂ fork me", cls: "empty" },
      { flag: "🇺🇸", name: "USA", st: "⑂ fork me", cls: "empty" }
    ];
    mods.forEach(m => {
      const c = el("div", "modbox " + m.cls);
      c.innerHTML = `<div class="flag">${m.flag}</div><div class="cn">${m.name}</div><div class="cs">${m.st}</div>`;
      if (m.cls === "empty") c.onclick = () => window.open("https://github.com/felicelucia/gridclaw/tree/master/modules/_template", "_blank");
      box.appendChild(c);
    });
  }

  /* ---------- swarm scaffold ---------- */
  function renderSwarmCards(agents) {
    const sw = $("#swarm"); sw.innerHTML = "";
    agents.forEach((a, i) => {
      const c = el("div", "agent idle");
      c.id = "ag-" + a.id;
      c.innerHTML = `<div class="ag-top"><div class="ico">${a.icon}</div><span class="stepno">${i + 1}/${agents.length}</span></div>
        <div class="nm">${a.name}</div>
        <div class="st">queued</div><div class="log"></div><div class="bar"></div>`;
      sw.appendChild(c);
    });
  }

  /* ---------- LIVE vs OFFLINE mode ---------- */
  // On load we ask the backend which models are configured. If 1+ keys are
  // present we run the REAL Trinity swarm over SSE; otherwise we animate the
  // deterministic offline engine. The site is never broken either way.
  let LIVE = { live: false, models: [], websearch: false, trinity: false };
  async function probeStatus() {
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      if (r.ok) LIVE = await r.json();
    } catch (e) { /* static hosting / no backend → stay offline */ }
    const tag = $("#mode-tag");
    if (tag) {
      if (LIVE.live) {
        const names = LIVE.models.map(m => m.label).join(" + ");
        tag.innerHTML = `<span class="ld"></span> LIVE · ${names}` +
          (LIVE.trinity ? " · cross-critique on" : "") +
          (LIVE.websearch ? " · real web search" : "");
        tag.className = "live mode-tag on";
      } else {
        tag.innerHTML = '<span class="ld"></span> running offline · no API key · real IRR';
        tag.className = "live mode-tag";
      }
    }
  }

  /* ---------- run the swarm ---------- */
  let running = false;
  async function run() {
    if (running) return; running = true;
    const btn = $("#run"); btn.disabled = true; btn.textContent = "⚙ Running…";
    const text = $("#prompt").value.trim() || $("#prompt").value;
    $("#output").style.display = "none";
    $("#fmt").innerHTML = ""; $("#verdict").innerHTML = "";
    try {
      if (LIVE.live) { await runLive(text); }
      else { await runOffline(text); }
    } catch (e) {
      // any live failure → graceful offline fallback
      await runOffline(text);
    }
    memCount++;
    btn.disabled = false; btn.textContent = "⚡ Run engine"; running = false;
  }

  // OFFLINE: deterministic engine with the original staged animation.
  async function runOffline(text) {
    const res = G.reason(text);
    renderSwarmCards(res.agents);
    for (let i = 0; i < res.agents.length; i++) {
      const a = res.agents[i];
      const card = $("#ag-" + a.id);
      card.className = "agent active";
      $(".st", card).innerHTML = '<span class="spinner"></span> thinking…';
      const log = $(".log", card); const bar = $(".bar", card);
      for (let j = 0; j < a.thinking.length; j++) {
        const ln = el("div", "ln", "› " + a.thinking[j]);
        log.appendChild(ln);
        bar.style.width = Math.round(((j + 1) / a.thinking.length) * 100) + "%";
        await sleep(230);
      }
      card.className = "agent done"; $(".st", card).innerHTML = "✓ done";
      await sleep(120);
    }
    renderOutput(res);
  }

  // LIVE: consume the SSE stream from /api/run and render real reasoning.
  function runLive(text) {
    return new Promise((resolve, reject) => {
      // scaffold the 5 agents up front
      renderSwarmCards(G.reason(text).agents);
      const es = new EventSource("/api/run?prompt=" + encodeURIComponent(text));
      let done = false;
      const setStatus = (id, html) => { const c = $("#ag-" + id); if (c) $(".st", c).innerHTML = html; };
      const addLine = (id, txt, cls) => {
        const c = $("#ag-" + id); if (!c) return;
        const ln = el("div", "ln " + (cls || ""), txt); $(".log", c).appendChild(ln);
        const log = $(".log", c); log.scrollTop = log.scrollHeight;
      };
      const activate = (id) => { const c = $("#ag-" + id); if (c) { c.className = "agent active"; setStatus(id, '<span class=\"spinner\"></span> thinking…'); } };
      const finish = (id) => { const c = $("#ag-" + id); if (c) { c.className = "agent done"; setStatus(id, "✓ done"); $(".bar", c).style.width = "100%"; } };

      es.addEventListener("agent_start", (e) => { const d = JSON.parse(e.data); activate(d.id); });
      es.addEventListener("agent_done", (e) => { const d = JSON.parse(e.data); finish(d.id); });
      es.addEventListener("round", (e) => {
        const d = JSON.parse(e.data);
        const labels = (d.models || []).join(", ");
        const txt = d.round === "draft" ? `› drafting in parallel: ${labels}`
          : d.round === "critique" ? `› cross-critique: models reviewing each other`
          : `› fusing answers (judge: ${d.judge})`;
        addLine(d.agentId, txt, "round");
      });
      es.addEventListener("draft", (e) => { const d = JSON.parse(e.data); addLine(d.agentId, `  · ${d.model}: ${(d.text||"").slice(0,90)}…`, "dim"); });
      es.addEventListener("critique", (e) => { const d = JSON.parse(e.data); addLine(d.agentId, `  ↻ ${d.model} improved`, "dim"); });
      es.addEventListener("fused", (e) => { const d = JSON.parse(e.data); addLine(d.agentId, `  ✓ fused by ${d.judge}`, "ok"); });
      es.addEventListener("source_web", (e) => {
        const d = JSON.parse(e.data);
        addLine("source", "› " + (d.text || "").slice(0, 120) + "…");
        (d.citations || []).slice(0, 4).forEach(u => addLine("source", "  ↗ " + u, "cite"));
      });
      es.addEventListener("market_numbers", (e) => {
        const d = JSON.parse(e.data);
        addLine("market", `› real IRR: project ${d.projectIRRpct} · equity ${d.equityIRRpct} (bisection)`, "ok");
      });
      es.addEventListener("model_error", (e) => { const d = JSON.parse(e.data); addLine(d.agentId || "source", `  ⚠ ${d.model}: ${d.error}`, "warn"); });
      es.addEventListener("result", (e) => { liveResult = JSON.parse(e.data); });
      es.addEventListener("offline", () => { es.close(); runOffline(text).then(resolve); });
      es.addEventListener("error", (e) => { try { addLine("critic", "⚠ stream error", "warn"); } catch (_) {} });
      es.addEventListener("end", () => {
        if (done) return; done = true; es.close();
        if (liveResult) renderLive(liveResult);
        resolve();
      });
      es.onerror = () => { if (!done) { done = true; es.close(); reject(new Error("sse")); } };
    });
  }
  let liveResult = null;

  // Render the live result: deterministic 7-block Format + live narrative.
  function renderLive(r) {
    if (r.format && r.verdict) renderOutput({ format: r.format, verdict: r.verdict });
    // prepend the live model narratives above the structured Format
    const fmt = $("#fmt");
    const narr = [];
    if (r.permitting && r.permitting.answer) narr.push(["Permitting (Trinity)", r.permitting]);
    if (r.grid && r.grid.answer) narr.push(["Grid (Trinity)", r.grid]);
    if (r.market && r.market.answer) narr.push(["Market & IRR (Trinity)", r.market]);
    if (r.critic && r.critic.answer) narr.push(["Critic verdict (Trinity)", r.critic]);
    if (narr.length && fmt) {
      const wrap = el("div", "block full live-narr");
      let h = `<div class="bh"><span class="bt">🧠 Live model reasoning</span><span class="badge ok">${(r.market&&r.market.models?r.market.models.length:1)} models · cross-critiqued</span></div>`;
      narr.forEach(([t, blk]) => {
        h += `<div class="narr-item"><div class="narr-t">${t}${blk.single?" · single model":""}</div><div class="narr-b">${escapeHtml(blk.answer).slice(0,1400)}</div></div>`;
      });
      wrap.innerHTML = h;
      fmt.insertBefore(wrap, fmt.firstChild);
    }
  }
  function escapeHtml(s){return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}

  /* ---------- render the 7-block Format ---------- */
  function badge(text) {
    const ok = text.includes("✓");
    return `<span class="badge ${ok ? "ok" : "warn"}">${text}</span>`;
  }
  function src(s, d) { return `<div class="src"><b>SOURCE:</b> ${s} · <b>DATE:</b> ${d}</div>`; }
  function kv(k, v) { return `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`; }

  function renderOutput(res) {
    const f = res.format;
    $("#verdict").innerHTML = `<h3>${res.verdict.feasible ? "✅" : "⚠️"} ${res.verdict.headline}</h3>
      <p>${res.verdict.keyRisk}</p>`;

    const fmt = $("#fmt"); fmt.innerHTML = "";

    // Block 1
    const b1 = f.block1_lifecycle;
    fmt.appendChild(blockEl(b1.title, b1.badge,
      kv("State", b1.state) + kv("Determines interlocutor", b1.determinesInterlocutor), b1.source, b1.date));

    // Block 2
    const b2 = f.block2_identity;
    fmt.appendChild(blockEl(b2.title, b2.badge,
      kv("Technology", b2.tech) + kv("Power", b2.mw + " MW") + kv("Energy", b2.mwh + " MWh") +
      kv("Duration", b2.duration) + kv("Location", b2.location) + kv("Coords", b2.coords), b2.source, b2.date));

    // Block 3 — constraints (full width)
    const b3 = f.block3_constraints; let c3 = "";
    Object.values(b3.items).forEach(it => {
      c3 += `<div class="constraint"><div class="cl"><span class="clab">${it.label}</span>${badge(it.flag)}</div>
        <div class="cv">${it.value}</div>
        <div class="src" style="border:0;padding:6px 0 0;margin:0"><b>SOURCE:</b> ${it.source} · ${it.date}</div></div>`;
    });
    fmt.appendChild(blockEl(b3.title, b3.badge, c3, b3.source, b3.date, true));

    // Block 4 — permitting
    const b4 = f.block4_permitting;
    let norms = b4.livingNorms.map(n => `<div class="kv"><span class="k">${n.id}</span><span class="v">${n.what} · <span class="dim3">${n.status}</span></span></div>`).join("");
    fmt.appendChild(blockEl(b4.title, b4.badge,
      kv("Iter", b4.iter) + kv("Authority", b4.authority) + kv("Alt. iter", b4.altIter) +
      kv("Status", b4.status) + kv("Est. timeline", b4.estMonths) +
      `<div class="src" style="border:0;margin-top:8px;padding:0"><b>LIVING NORMS</b> (RAG, temporal-checked):</div>` + norms,
      b4.source, b4.date));

    // Block 5 — grid
    const b5 = f.block5_grid;
    fmt.appendChild(blockEl(b5.title, b5.badge,
      kv("Operator", b5.operator) + kv("Connection", b5.connectionStatus) +
      kv("Voltage", b5.voltage) + kv("Queue", b5.queue) +
      `<div class="cv" style="margin-top:8px;color:var(--warn)">${b5.note}</div>`, b5.source, b5.date));

    // Block 6 — finance (full width, with metrics + scenario table)
    const b6 = f.block6_finance;
    const metrics = `<div class="fin-hl">
      <div class="metric"><div class="ml">CAPEX</div><div class="mv">${eur(b6.capex)}</div></div>
      <div class="metric"><div class="ml">EQUITY / DEBT</div><div class="mv" style="font-size:16px">${eur(b6.equity)} / ${eur(b6.debt)}</div></div>
      <div class="metric"><div class="ml">PROJECT IRR <span class="live-tag">computed</span></div><div class="mv good">${b6.projectIRRpct}</div></div>
      <div class="metric"><div class="ml">EQUITY IRR <span class="live-tag">computed</span></div><div class="mv good">${b6.equityIRRpct}</div></div>
    </div>`;
    const finKv = kv("Scheme", b6.scheme) + kv("Annual revenue (Y1)", eur(b6.annualRevenueY1)) +
      kv("EBITDA (Y1)", eur(b6.ebitdaY1)) + kv("Project NPV @ " + (b6.assumptions.discountRate * 100) + "%", eur(b6.projectNPV)) +
      kv("Payback (unlevered)", (b6.paybackYears || "—") + " yrs") +
      kv("Capex assumption", b6.assumptions.capexPerKwh + " €/kWh · " + b6.assumptions.lifeYears + "yr · " + (b6.assumptions.debtRatio * 100) + "% debt @ " + (b6.assumptions.debtRate * 100) + "%");
    let scn = `<div class="scn"><div class="src" style="border:0;padding:0;margin:4px 0"><b>SCENARIO COMPARISON</b> — IRR recomputed by the engine for each revenue regime:</div>
      <table><tr><th>Scenario</th><th>Annual rev</th><th>Project IRR</th><th>Equity IRR</th></tr>`;
    b6.scenarios.forEach(s => {
      const base = s.label.includes("base") ? "base" : "";
      scn += `<tr class="${base}"><td>${s.label}</td><td class="num">${eur(s.annualRevenue)}</td><td class="num good" style="color:var(--acc)">${s.projectIRRpct}</td><td class="num" style="color:var(--acc-2)">${s.equityIRRpct}</td></tr>`;
    });
    scn += `</table></div>`;
    fmt.appendChild(blockEl(b6.title, b6.badge, metrics + finKv + scn, b6.source, b6.date, true));

    // Block 7 — match
    const b7 = f.block7_match;
    fmt.appendChild(blockEl(b7.title, b7.badge,
      kv("Contact", b7.interlocutor) + `<div class="cv" style="margin-top:8px">${b7.rationale}</div>`, b7.source, b7.date));

    $("#output").style.display = "block";
  }

  function blockEl(title, badgeText, body, source, date, full) {
    const b = el("div", "block" + (full ? " full" : ""));
    b.innerHTML = `<div class="bh"><span class="bt">${title}</span>${badge(badgeText)}</div>${body}${src(source, date)}`;
    return b;
  }

  /* ---------- wire up ---------- */
  async function init() {
    loadStats(); renderMemory(); renderModules();
    // initial empty swarm scaffold (idle preview)
    renderSwarmCards(G.reason($("#prompt").value).agents);
    $("#run").addEventListener("click", run);
    $("#prompt").addEventListener("keydown", e => { if (e.key === "Enter") run(); });
    document.querySelectorAll(".chip").forEach(ch => ch.addEventListener("click", () => {
      $("#prompt").value = ch.getAttribute("data-ex"); run();
    }));
    // smooth-scroll nav (hash-safe)
    document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener("click", e => {
      const id = a.getAttribute("href").slice(1); const t = document.getElementById(id);
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: "smooth" }); }
    }));
    // detect live backend (model keys) before the first run
    await probeStatus();
    // auto-run once on load so visitors instantly see the swarm work
    setTimeout(run, 700);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
