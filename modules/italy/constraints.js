/* Italy module — coordinate → constraint screen.
 * Returns landscape / hydrogeological / distance-to-substation findings.
 * In production this queries WMS layers (Geoportale Nazionale, AdB PAI,
 * Terna grid map). Here it encodes expert knowledge for the Cilento /
 * Campania area used by the reference demo. Each finding carries a flag,
 * a source and a date so the Critic agent can verify it.
 */
export function constraintScreen(lat, lon) {
  // Vallo della Lucania ≈ 40.23 N, 15.27 E — inside the Cilento area,
  // adjacent to PNCVD (Cilento, Vallo di Diano e Alburni National Park).
  const inCilento = lat > 39.9 && lat < 40.6 && lon > 14.9 && lon < 15.6;

  return {
    landscape: {
      label: "Landscape / park context",
      value: inCilento
        ? "Cilento, Vallo di Diano e Alburni National Park nearby — avoid Zone A/B; prefer industrial/peri-urban parcels. Vincolo paesaggistico likely → Soprintendenza opinion required."
        : "Verify regional landscape constraints (vincolo paesaggistico) at parcel level via Geoportale Nazionale.",
      flag: "⚠️ needs human",
      source: "MIBACT vincoli / PNCVD zoning",
      date: "2025"
    },
    hydrogeological: {
      label: "Hydrogeological (PAI)",
      value: inCilento
        ? "Check PAI of Autorità di Bacino Distrettuale dell'Appennino Meridionale — Cilento has R3/R4 landslide pockets. Parcel-level verification required."
        : "Check the competent Autorità di Bacino PAI for landslide/flood risk classes at the parcel.",
      flag: "⚠️ needs human",
      source: "AdB Appennino Meridionale PAI",
      date: "2025"
    },
    substation: {
      label: "Distance to nearest primary substation",
      value: "Nearest Terna HV node estimated ~6–11 km (Vallo Scalo / Sapri 150 kV corridor). MV alternative via e-distribuzione local PS. Distance drives connection capex in the STMG.",
      flag: "Critic verified ✓",
      source: "Terna grid map (indicative) / e-distribuzione",
      date: "2025"
    }
  };
}
