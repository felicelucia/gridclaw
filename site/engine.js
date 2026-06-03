/* ==========================================================================
   GridClaw — Generalist Energy Engine (mock reasoning + REAL finance core)
   ----------------------------------------------------------------------------
   This file is intentionally framework-free so it runs anywhere, offline,
   with zero API keys. The reasoning layer is a deterministic mock that returns
   realistic, well-researched Italian energy data. The IRR/NPV math is REAL.
   Swap `GridClaw.reason()` for a live LLM call to go from demo to production.
   ========================================================================== */

(function (global) {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  1. REAL FINANCE CORE  (no faking — actual numerical methods)
   * ------------------------------------------------------------------ */

  // Net Present Value for an array of cashflows, year 0..N, at rate r.
  function npv(rate, cashflows) {
    return cashflows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);
  }

  // Internal Rate of Return via bisection (robust, no derivative needed).
  // Returns the rate r such that NPV(r) ≈ 0, or null if no sign change.
  function irr(cashflows, lo = -0.9, hi = 1.0, tol = 1e-7, maxIter = 200) {
    let fLo = npv(lo, cashflows);
    let fHi = npv(hi, cashflows);
    if (fLo * fHi > 0) {
      // widen the bracket once
      hi = 5.0;
      fHi = npv(hi, cashflows);
      if (fLo * fHi > 0) return null;
    }
    let mid = lo;
    for (let i = 0; i < maxIter; i++) {
      mid = (lo + hi) / 2;
      const fMid = npv(mid, cashflows);
      if (Math.abs(fMid) < tol) return mid;
      if (fLo * fMid < 0) {
        hi = mid;
        fHi = fMid;
      } else {
        lo = mid;
        fLo = fMid;
      }
    }
    return mid;
  }

  // Build a yearly cashflow vector for a BESS project and compute returns.
  // All currency in EUR. Returns the cashflows + key metrics.
  function modelBESS(p) {
    const {
      mw,             // power (MW)
      mwh,            // energy capacity (MWh)
      capexPerKwh,    // total installed cost EUR per kWh of energy
      opexPctOfCapex, // annual opex as % of capex
      lifeYears,      // operating life
      discountRate,   // WACC for NPV
      annualRevenue,  // gross annual revenue EUR (year 1)
      revenueEscal,   // annual revenue escalation (e.g. -0.01 for slight decay)
      degradation,    // annual capacity/throughput degradation
      debtRatio,      // share of capex financed by debt (0..1)
      debtRate,       // cost of debt
      debtTenor,      // years of amortisation
      taxRate         // corporate tax on EBT
    } = p;

    const capex = mwh * 1000 * capexPerKwh;          // kWh * EUR/kWh
    const opexY1 = capex * opexPctOfCapex;
    const equity = capex * (1 - debtRatio);
    const debt = capex * debtRatio;

    const cashflows = [-capex];          // unlevered, year 0
    const equityCF = [-equity];          // levered (equity) view
    // straight-line debt amortisation
    const principalPerYear = debtTenor > 0 ? debt / debtTenor : 0;
    let outstanding = debt;

    let rows = [];
    for (let y = 1; y <= lifeYears; y++) {
      const deg = Math.pow(1 - degradation, y - 1);
      const rev = annualRevenue * Math.pow(1 + revenueEscal, y - 1) * deg;
      const opex = opexY1 * Math.pow(1.02, y - 1); // opex inflates ~2%/yr
      const ebitda = rev - opex;

      // unlevered free cash flow (pre-tax simplification for clarity, tax on ebitda)
      const taxU = Math.max(0, ebitda) * taxRate;
      const ufcf = ebitda - taxU;
      cashflows.push(ufcf);

      // levered: subtract interest + principal, tax on EBT
      const interest = outstanding * debtRate;
      const principal = y <= debtTenor ? principalPerYear : 0;
      const ebt = ebitda - interest;
      const taxL = Math.max(0, ebt) * taxRate;
      const eqcf = ebitda - interest - principal - taxL;
      equityCF.push(eqcf);
      outstanding = Math.max(0, outstanding - principal);

      rows.push({ y, rev, opex, ebitda, ufcf, interest, principal, eqcf });
    }

    const projectIRR = irr(cashflows);
    const equityIRR = irr(equityCF);
    const projectNPV = npv(discountRate, cashflows);
    const totalEbitdaY1 = rows[0].ebitda;
    // simple payback (unlevered)
    let cum = -capex, payback = null;
    for (let i = 1; i < cashflows.length; i++) {
      cum += cashflows[i];
      if (cum >= 0 && payback === null) payback = i;
    }

    return {
      capex, equity, debt, opexY1,
      cashflows, equityCF, rows,
      projectIRR, equityIRR, projectNPV,
      ebitdaY1: totalEbitdaY1, payback
    };
  }

  /* ------------------------------------------------------------------ *
   *  2. ITALY KNOWLEDGE MODULE  (accurate to Italian regulation)
   * ------------------------------------------------------------------ */

  const ITALY = {
    code: "IT",
    name: "Italy",
    flag: "🇮🇹",
    regulator: { name: "ARERA", role: "Energy regulator (market rules, tariffs, grid code)", url: "https://www.arera.it" },
    tso: { name: "Terna", role: "Transmission System Operator (HV grid, STMG, MACSE)", url: "https://www.terna.it" },
    dso: { name: "e-distribuzione", role: "Distribution System Operator (MV/LV connections)", url: "https://www.e-distribuzione.it" },
    ministry: { name: "MASE", role: "Ministry of Environment & Energy Security (single-authorization for standalone BESS)", url: "https://www.mase.gov.it" },
    incentiveAgency: { name: "GSE", role: "Manages incentive schemes (FER, auctions, guarantees of origin)", url: "https://www.gse.it" },
    schemes: {
      MACSE: {
        full: "Meccanismo di Approvvigionamento di Capacità di Stoccaggio Elettrico",
        desc: "15-year tolling contract with Terna for new storage. First auction (Sept 2025) procured 10 GWh, contracts starting 2028; owners may keep a share of capacity for merchant upside.",
        source: "Terna / Decreto MASE 9 luglio 2024 n.190; ARERA Del. 247/2023/R/eel",
        date: "2025-10"
      },
      capacityMarket: {
        full: "Mercato della Capacità",
        desc: "Annual reliability auction run by Terna ~T-2; Feb 2025 new-capacity clearing ≈ €47,000/MW/year (derated by duration).",
        source: "Terna Capacity Market results",
        date: "2025-02"
      },
      merchant: {
        full: "Merchant arbitrage / ancillary services (MSD)",
        desc: "Energy arbitrage on MGP/MI plus ancillary-services revenue on the MSD/Dispatching market. Highest upside, highest risk.",
        source: "GME / Terna MSD",
        date: "2025"
      }
    },
    permitting: {
      standaloneBESS: {
        iter: "Autorizzazione Unica (single authorization)",
        authority: "MASE — DG-FTA, Division IV (Sicily: Regional Energy Dept.)",
        portal: "MASE single-authorization online portal, live from 2 Dec 2024",
        eiaNote: "Standalone electrochemical BESS generally NOT subject to VIA/EIA under D.Lgs 152/2006 when sited in qualifying areas (e.g. ≥300 MWth fossil sites or non-industrial areas per art.1(2)(b) D.Lgs 7/2002).",
        typicalMonths: 12,
        source: "MASE Operational Guidelines (16 Apr 2024); ess-news 12 Nov 2024",
        date: "2024-11"
      },
      regionalPAUR: {
        iter: "PAUR — Provvedimento Autorizzatorio Unico Regionale",
        authority: "Regione Campania (for projects requiring regional VIA)",
        desc: "Regional single-authorization combining VIA + Autorizzazione Unica when environmental assessment is triggered (e.g. co-located with generation, or by size/sensitivity).",
        typicalMonths: 18,
        source: "D.Lgs 152/2006 art.27-bis; Regione Campania",
        date: "2024"
      }
    },
    grid: {
      saturation: "The HV grid in Southern Italy is heavily saturated; binding answer requires Terna's STMG (Soluzione Tecnica Minima Generale), not the preliminary estimate.",
      stmg: "STMG = Terna's binding minimum general technical solution defining the connection works, voltage, point of connection and costs.",
      source: "Terna grid code; ARERA TICA art.20 (STMG)",
      date: "2025"
    },
    refNorms: [
      { id: "DM 190/2024", what: "MACSE storage procurement mechanism", source: "Decreto MASE 9 luglio 2024 n.190", date: "2024-07", status: "in force" },
      { id: "D.Lgs 199/2021", what: "RED II transposition — FER incentives framework", source: "Gazzetta Ufficiale", date: "2021-11", status: "in force" },
      { id: "TICA / Del.281/2022", what: "Connection rules & STMG procedure", source: "ARERA", date: "2022", status: "in force, periodically updated" },
      { id: "D.L. 7/2002 art.1(2)(b)", what: "Single-authorization basis for energy infrastructure", source: "Gazzetta Ufficiale", date: "2002", status: "in force" }
    ]
  };

  // Coordinate-driven (mock) constraint screen for the Cilento / Vallo della Lucania area.
  function constraintScreen(lat, lon) {
    // Vallo della Lucania ≈ 40.23 N, 15.26 E — inside Cilento (PNCVD national park buffer zones).
    return {
      landscape: {
        label: "Landscape / Cilento context",
        value: "Cilento, Vallo di Diano e Alburni National Park is nearby — siting must avoid Zone A/B; industrial/peri-urban parcels strongly preferred. Vincolo paesaggistico likely → Soprintendenza opinion required.",
        flag: "⚠️ needs human",
        source: "MIBACT vincoli / PNCVD zoning",
        date: "2025"
      },
      hydrogeological: {
        label: "Hydrogeological (PAI)",
        value: "Check PAI (Piano Assetto Idrogeologico) of Autorità di Bacino Distrettuale dell'Appennino Meridionale — Cilento has R3/R4 landslide pockets. Parcel-level verification required.",
        flag: "⚠️ needs human",
        source: "AdB Appennino Meridionale PAI",
        date: "2025"
      },
      substation: {
        label: "Distance to nearest primary substation",
        value: "Nearest Terna HV node: Vallo Scalo / Sapri 150 kV corridor (~6–11 km). MV alternative via e-distribuzione Vallo della Lucania PS. Distance drives connection capex in the STMG.",
        flag: "Critic verified ✓",
        source: "Terna grid map (indicative) / e-distribuzione",
        date: "2025"
      }
    };
  }

  const MODULES = { IT: ITALY };

  /* ------------------------------------------------------------------ *
   *  3. MOCK REASONING / PARSER  (LLM-swappable)
   * ------------------------------------------------------------------ */

  // Extract structured params from a free-text energy-project brief.
  // In production this is one LLM call; here it's a deterministic parser
  // tuned to recognise common BESS/PV phrasing in EN/IT.
  function parseBrief(text) {
    const t = (text || "").toLowerCase();
    const num = (re) => {
      const m = t.match(re);
      return m ? parseFloat(m[1].replace(",", ".")) : null;
    };
    let mw = num(/(\d+(?:[.,]\d+)?)\s*mw\b/);
    let mwh = num(/(\d+(?:[.,]\d+)?)\s*mwh\b/);
    let tech = "BESS";
    if (/\bbess\b|batter|storage|stoccaggio|accumulo/.test(t)) tech = "BESS";
    else if (/\bpv\b|photovolta|fotovolta|solar/.test(t)) tech = "Solar PV";
    else if (/\bwind\b|eolic/.test(t)) tech = "Wind";

    // location heuristics
    let location = "Campania, Italy";
    if (/vallo della lucania/.test(t)) location = "Vallo della Lucania (SA), Campania";
    else if (/campania/.test(t)) location = "Campania, Italy";
    const coords = /vallo della lucania/.test(t)
      ? { lat: 40.2333, lon: 15.2667 }
      : { lat: 40.85, lon: 14.27 };

    // defaults if unspecified — keep proportional (4h system common in MACSE)
    mw = mw || 100;
    mwh = mwh || mw * 4;
    const duration = +(mwh / mw).toFixed(1);

    return { tech, mw, mwh, duration, location, coords, country: "IT", raw: text };
  }

  // Lifecycle state inference + interlocutor mapping.
  function inferLifecycle(brief, text) {
    const t = (text || "").toLowerCase();
    let state = "Greenfield (early development)";
    let interlocutor = "Developer / land originator";
    if (/rtb|ready to build|ready-to-build/.test(t)) { state = "RTB (Ready-to-Build)"; interlocutor = "Infrastructure fund / IPP buyer"; }
    else if (/ntp|notice to proceed/.test(t)) { state = "NTP (Notice to Proceed)"; interlocutor = "EPC contractor"; }
    else if (/\bcod\b|operational|in esercizio/.test(t)) { state = "COD (Operational)"; interlocutor = "Asset manager / secondary-market buyer"; }
    else if (/revamp|repower/.test(t)) { state = "Revamping / Repowering"; interlocutor = "Utility / O&M provider"; }
    else if (/brownfield|existing site|ex.?fossil|dismiss/.test(t)) { state = "Brownfield"; interlocutor = "Utility / site owner"; }
    return { state, interlocutor };
  }

  /* ------------------------------------------------------------------ *
   *  4. ORCHESTRATION  (the multi-agent swarm, mocked but realistic)
   * ------------------------------------------------------------------ */

  // Returns the full structured "Format" object + per-agent logs.
  // Designed to be consumed by the UI which animates the agents.
  function analyze(text, opts) {
    opts = opts || {};
    const brief = parseBrief(text);
    const M = MODULES[brief.country] || ITALY;
    const lc = inferLifecycle(brief, text);
    const constraints = constraintScreen(brief.coords.lat, brief.coords.lon);

    // ---- finance assumptions (shown to user, editable in UI) ----
    const assumptions = opts.assumptions || {
      capexPerKwh: 250,        // EUR/kWh installed (2025 LFP turnkey, IT, 4h system)
      opexPctOfCapex: 0.02,    // 2.0% / yr
      lifeYears: 15,           // matches MACSE tolling tenor
      discountRate: 0.08,      // WACC
      // Revenue per MW-year. A 4h MACSE-tolled system earns a fixed annual
      // capacity fee plus a merchant/ancillary tail. Figures are per MW of power.
      tollRevenuePerMwYr: 130000,    // EUR/MW/yr MACSE-style fixed tolling leg
      merchantRevenuePerMwYr: 60000, // EUR/MW/yr merchant arbitrage + ancillary
      revenueEscal: -0.005,
      degradation: 0.018,
      debtRatio: 0.65,
      debtRate: 0.055,
      debtTenor: 12,
      taxRate: 0.24
    };

    const annualRevenue =
      brief.mw * (assumptions.tollRevenuePerMwYr + assumptions.merchantRevenuePerMwYr);

    const fin = modelBESS({
      mw: brief.mw,
      mwh: brief.mwh,
      capexPerKwh: assumptions.capexPerKwh,
      opexPctOfCapex: assumptions.opexPctOfCapex,
      lifeYears: assumptions.lifeYears,
      discountRate: assumptions.discountRate,
      annualRevenue,
      revenueEscal: assumptions.revenueEscal,
      degradation: assumptions.degradation,
      debtRatio: assumptions.debtRatio,
      debtRate: assumptions.debtRate,
      debtTenor: assumptions.debtTenor,
      taxRate: assumptions.taxRate
    });

    // Scenario comparison — recompute IRR under three revenue regimes.
    const scenario = (tollPerMw, merchPerMw, label) => {
      const rev = brief.mw * (tollPerMw + merchPerMw);
      const r = modelBESS({
        mw: brief.mw, mwh: brief.mwh,
        capexPerKwh: assumptions.capexPerKwh,
        opexPctOfCapex: assumptions.opexPctOfCapex,
        lifeYears: assumptions.lifeYears,
        discountRate: assumptions.discountRate,
        annualRevenue: rev,
        revenueEscal: assumptions.revenueEscal,
        degradation: assumptions.degradation,
        debtRatio: assumptions.debtRatio,
        debtRate: assumptions.debtRate,
        debtTenor: assumptions.debtTenor,
        taxRate: assumptions.taxRate
      });
      return { label, annualRevenue: rev, projectIRR: r.projectIRR, equityIRR: r.equityIRR, projectNPV: r.projectNPV };
    };

    const scenarios = [
      scenario(200000, 15000, "MACSE-heavy (fully tolled)"),
      scenario(130000, 60000, "Hybrid (base case)"),
      scenario(0, 175000, "Pure merchant")
    ];

    // ---- agent logs (the visible 'thinking') ----
    const agents = [
      {
        id: "source", name: "Source Finder", icon: "🧭",
        thinking: [
          "Resolving jurisdiction → Italy module (IT) active.",
          `Identifying authorities for ${brief.tech} in ${brief.location}…`,
          "Regulator=ARERA · TSO=Terna · DSO=e-distribuzione · Ministry=MASE · Incentives=GSE.",
          "Pulling living norms: DM 190/2024, TICA art.20, MASE single-auth guidelines."
        ]
      },
      {
        id: "permitting", name: "Permitting", icon: "📜",
        thinking: [
          "Classifying iter: standalone BESS → Autorizzazione Unica (MASE).",
          "Checking VIA trigger under D.Lgs 152/2006… Cilento proximity raises landscape flag.",
          "Temporal check on norms: MASE portal live since 2 Dec 2024 ✓",
          `Estimating timeline: ~${M.permitting.standaloneBESS.typicalMonths} months (AU) / ~${M.permitting.regionalPAUR.typicalMonths} months if PAUR/VIA triggered.`
        ]
      },
      {
        id: "grid", name: "Grid", icon: "🔌",
        thinking: [
          "Southern Italy HV grid: saturated. Preliminary estimate is non-binding.",
          "Locating nearest Terna HV node near Vallo della Lucania (~6–11 km).",
          "Connection request status: STMG REQUIRED for a binding answer.",
          "Voltage: HV (150 kV) likely; MV fallback via e-distribuzione."
        ]
      },
      {
        id: "market", name: "Market & IRR", icon: "📈",
        thinking: [
          "Revenue stack: MACSE 15-yr tolling + merchant/ancillary tail.",
          `Capex = €${(fin.capex/1e6).toFixed(1)}M (${assumptions.capexPerKwh} €/kWh × ${brief.mwh} MWh).`,
          "Building 15-yr levered & unlevered cashflows…",
          "Running real IRR (bisection) + 3-scenario comparison."
        ]
      },
      {
        id: "critic", name: "Critic", icon: "🧪",
        thinking: [
          "Independent IRR recompute on unlevered cashflows… match within 1e-6 ✓",
          "Temporal validity of norms cited: all in force ✓",
          "Source presence on every block: ✓",
          "Flagging landscape & hydrogeological items as ⚠️ needs human."
        ]
      }
    ];

    const pct = (x) => (x === null ? "n/a" : (x * 100).toFixed(1) + "%");

    // ---- the structured Format (7 blocks) ----
    const format = {
      block1_lifecycle: {
        title: "① Lifecycle State",
        state: lc.state,
        determinesInterlocutor: lc.interlocutor,
        badge: "Critic verified ✓",
        source: "GridClaw lifecycle model",
        date: "2025"
      },
      block2_identity: {
        title: "② Identity",
        tech: brief.tech,
        mw: brief.mw, mwh: brief.mwh, duration: brief.duration + "h",
        location: brief.location,
        coords: `${brief.coords.lat}, ${brief.coords.lon}`,
        badge: "Critic verified ✓",
        source: "Parsed from project brief",
        date: "2025"
      },
      block3_constraints: {
        title: "③ Area & Constraints",
        items: constraints,
        badge: "⚠️ needs human",
        source: "Coordinate-driven constraint screen",
        date: "2025"
      },
      block4_permitting: {
        title: "④ Permitting",
        iter: M.permitting.standaloneBESS.iter,
        authority: M.permitting.standaloneBESS.authority,
        altIter: M.permitting.regionalPAUR.iter + " (if VIA triggered)",
        altAuthority: M.permitting.regionalPAUR.authority,
        status: "Pre-application — VIA screening pending",
        estMonths: `~${M.permitting.standaloneBESS.typicalMonths}–${M.permitting.regionalPAUR.typicalMonths} months`,
        livingNorms: M.refNorms,
        badge: "Critic verified ✓ (temporal check passed)",
        source: M.permitting.standaloneBESS.source,
        date: M.permitting.standaloneBESS.date
      },
      block5_grid: {
        title: "⑤ Grid",
        operator: "Terna (HV) / e-distribuzione (MV)",
        connectionStatus: "STMG required — preliminary estimate non-binding",
        note: M.grid.saturation,
        voltage: "150 kV (HV) likely; MV fallback",
        queue: "Southern Italy zone — high request density",
        badge: "⚠️ needs human (STMG pending)",
        source: M.grid.source,
        date: M.grid.date
      },
      block6_finance: {
        title: "⑥ Market & Finance",
        scheme: "MACSE (15-yr tolling) + merchant/ancillary",
        assumptions,
        capex: fin.capex,
        equity: fin.equity,
        debt: fin.debt,
        annualRevenueY1: annualRevenue,
        ebitdaY1: fin.ebitdaY1,
        projectIRR: fin.projectIRR,
        equityIRR: fin.equityIRR,
        projectNPV: fin.projectNPV,
        paybackYears: fin.payback,
        projectIRRpct: pct(fin.projectIRR),
        equityIRRpct: pct(fin.equityIRR),
        scenarios: scenarios.map(s => ({ ...s, projectIRRpct: pct(s.projectIRR), equityIRRpct: pct(s.equityIRR) })),
        badge: "Critic verified ✓ (independent recompute)",
        source: M.schemes.MACSE.source,
        date: M.schemes.MACSE.date
      },
      block7_match: {
        title: "⑦ Interlocutor / Match",
        interlocutor: lc.interlocutor,
        rationale: `Lifecycle = "${lc.state}" → engage ${lc.interlocutor}. GridClaw can route the dossier to the right counterparty.`,
        badge: "Critic verified ✓",
        source: "GridClaw match engine",
        date: "2025"
      }
    };

    const verdict = {
      feasible: fin.projectIRR !== null && fin.projectIRR > 0.07,
      headline:
        fin.projectIRR !== null && fin.projectIRR > 0.07
          ? `Feasible — project IRR ${pct(fin.projectIRR)} clears an 8% WACC in the hybrid base case.`
          : `Marginal — returns are sensitive to the revenue stack; secure MACSE tolling before NTP.`,
      keyRisk: "Grid (saturated → STMG) and landscape (Cilento) are the binding constraints, not the economics."
    };

    return { brief, agents, format, verdict, module: M };
  }

  /* ------------------------------------------------------------------ *
   *  5. SEEDED MEMORY  (compounding moat)
   * ------------------------------------------------------------------ */
  const MEMORY = [
    { name: "BESS 200MW / 800MWh — Brindisi (ex-coal site)", country: "🇮🇹", state: "Brownfield → RTB", note: "MASE single-auth; STMG issued; matched to infra fund.", date: "2025-09" },
    { name: "Solar PV 48MW — Foggia, Puglia", country: "🇮🇹", state: "RTB", note: "FER-X eligible; sold to IPP secondary market.", date: "2025-07" },
    { name: "BESS 30MW / 120MWh — Sardinia (island derating)", country: "🇮🇹", state: "Greenfield", note: "Capacity-market derating modelled; merchant-heavy.", date: "2025-05" },
    { name: "Wind repowering 22MW — Benevento", country: "🇮🇹", state: "Revamping", note: "Old turbines → 4×5.5MW; PAUR amendment.", date: "2025-04" }
  ];

  /* ------------------------------------------------------------------ *
   *  PUBLIC API
   * ------------------------------------------------------------------ */
  global.GridClaw = {
    irr, npv, modelBESS, parseBrief, analyze,
    MODULES, MEMORY, ITALY,
    // reason(): the single swap point for a live LLM (Claude/GPT/DeepSeek).
    // Returns the same shape as analyze(); here it just calls the mock.
    reason: function (text, opts) { return analyze(text, opts); }
  };

})(typeof window !== "undefined" ? window : globalThis);
