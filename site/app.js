/* GridClaw UI — drives the swarm animation + renders the structured Format */
(function () {
  "use strict";
  const G = window.GridClaw;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const eur = (n) => "€" + (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.round(n).toLocaleString());
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let memCount = G.MEMORY.length;

  /* ---------- star counter animation ---------- */
  function animStars() {
    const targets = [["navstars", 1000], ["herostars", 1000]];
    targets.forEach(([id, target]) => {
      const node = document.getElementById(id); if (!node) return;
      let v = 820; const step = () => {
        v += Math.ceil((target - v) / 12); if (v >= target) v = target;
        node.textContent = v.toLocaleString();
        if (v < target) requestAnimationFrame(step);
      }; step();
    });
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
      if (m.cls === "empty") c.onclick = () => window.open("https://github.com", "_blank");
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

  /* ---------- run the swarm ---------- */
  let running = false;
  async function run() {
    if (running) return; running = true;
    const btn = $("#run"); btn.disabled = true; btn.textContent = "⚙ Running…";
    const text = $("#prompt").value.trim() || $("#prompt").value;
    const res = G.reason(text);

    renderSwarmCards(res.agents);
    $("#output").style.display = "none";
    $("#fmt").innerHTML = ""; $("#verdict").innerHTML = "";

    // animate agents in sequence with overlapping "thinking"
    for (let i = 0; i < res.agents.length; i++) {
      const a = res.agents[i];
      const card = $("#ag-" + a.id);
      card.className = "agent active";
      $(".st", card).innerHTML = '<span class="spinner"></span> thinking…';
      const log = $(".log", card); const bar = $(".bar", card);
      for (let j = 0; j < a.thinking.length; j++) {
        const ln = el("div", "ln", "› " + a.thinking[j]);
        ln.style.animationDelay = "0s"; log.appendChild(ln);
        bar.style.width = Math.round(((j + 1) / a.thinking.length) * 100) + "%";
        await sleep(230);
      }
      card.className = "agent done";
      $(".st", card).innerHTML = "✓ done";
      await sleep(120);
    }

    renderOutput(res);
    memCount++;
    btn.disabled = false; btn.textContent = "⚡ Run engine"; running = false;
  }

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
  function init() {
    animStars(); renderMemory(); renderModules();
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
    // auto-run once on load so visitors instantly see the swarm work
    setTimeout(run, 700);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
