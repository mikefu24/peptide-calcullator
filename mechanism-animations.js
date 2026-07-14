/* ============================================================================
   mechanism-animations.js
   Renders an animated SVG schematic of a peptide side-reaction mechanism.
   One visual per archetype (oxidation, elimination, cyclization, hydrolysis,
   reduction, dephospho, adduct, substitution, rearrangement).
   Pure vanilla + inline SVG + CSS keyframes. Works fully offline.
   Frozen (prefers-reduced-motion) it settles on the product state.
   ========================================================================== */
(() => {
  "use strict";

  const VB = "0 0 340 200";

  // Scoped animation stylesheet injected inside each SVG.
  const STYLE = `
    .stage text { font-family: -apple-system,"SF Pro Text",system-ui,sans-serif; }
    .lbl { font-size: 12px; font-weight: 800; letter-spacing:-.02em; }
    .lbl-sm { font-size: 9.5px; font-weight: 700; }
    .cap { font-size: 11px; font-weight: 800; fill: var(--label-2,#8a8a8f); }
    .bond { stroke: var(--label-2,#8a8a8f); stroke-width: 2.4; stroke-linecap: round; }
    .bond-hi { stroke: var(--mech,#0a84ff); stroke-width: 2.8; stroke-linecap: round; }
    .arrow { stroke: var(--mech,#0a84ff); stroke-width: 2.4; fill:none; stroke-linecap: round; }
    .dtag { font-size: 13px; font-weight: 900; fill: var(--mech,#0a84ff); letter-spacing:-.03em; }

    @keyframes fadeIn { from{opacity:0} to{opacity:1} }
    @keyframes fadeOut { from{opacity:1} to{opacity:0} }
    @keyframes dropO { 0%{transform:translate(0,-46px);opacity:0} 22%{opacity:1} 46%,100%{transform:translate(0,0);opacity:1} }
    @keyframes flyInR { 0%{transform:translate(70px,0);opacity:0} 24%{opacity:1} 52%,100%{transform:translate(0,0);opacity:1} }
    @keyframes leaveUp { 0%,30%{transform:translate(0,0);opacity:1} 62%,100%{transform:translate(0,-42px);opacity:0} }
    @keyframes leaveDown { 0%,30%{transform:translate(0,0);opacity:1} 62%,100%{transform:translate(0,40px);opacity:0} }
    @keyframes leaveRight { 0%,26%{transform:translate(0,0);opacity:1} 60%,100%{transform:translate(58px,-16px);opacity:0} }
    @keyframes appear { 0%,34%{opacity:0;transform:scale(.5)} 60%,100%{opacity:1;transform:scale(1)} }
    @keyframes dbl { 0%,40%{opacity:0} 66%,100%{opacity:1} }
    @keyframes pop { 0%,20%{opacity:0;transform:scale(.4)} 40%{opacity:1;transform:scale(1.15)} 55%,100%{opacity:1;transform:scale(1)} }
    @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
    @keyframes swing { 0%,20%{transform:rotate(0deg)} 60%,100%{transform:rotate(-128deg)} }
    @keyframes dashmove { to { stroke-dashoffset: -14; } }

    .st { transform-box: fill-box; transform-origin: center; }
    .actor-o   { animation: dropO 3.4s ease-in-out infinite; }
    .actor-r   { animation: flyInR 3.4s ease-in-out infinite; }
    .go-up     { animation: leaveUp 3.4s ease-in-out infinite; }
    .go-down   { animation: leaveDown 3.4s ease-in-out infinite; }
    .go-right  { animation: leaveRight 3.4s ease-in-out infinite; }
    .come      { animation: appear 3.4s ease-in-out infinite; transform-box: fill-box; transform-origin:center; }
    .come-pop  { animation: pop 3.4s ease-in-out infinite; transform-box: fill-box; transform-origin:center; }
    .db        { animation: dbl 3.4s ease-in-out infinite; }
    .breathe   { animation: pulse 3.4s ease-in-out infinite; transform-box: fill-box; transform-origin:center; }
    .ring-swing{ animation: swing 3.6s ease-in-out infinite; }
    .flow      { stroke-dasharray: 6 8; animation: dashmove 1s linear infinite; }
    .cap-in    { animation: fadeIn .6s ease both; }

    @media (prefers-reduced-motion: reduce) {
      .actor-o,.actor-r,.go-up,.go-down,.go-right,.come,.come-pop,.db,.breathe,.ring-swing,.flow {
        animation: none !important;
      }
      .go-up,.go-down,.go-right { opacity: 0; }
      .come,.come-pop,.db { opacity: 1; }
    }
  `;

  // ---- atom / molecule bubble ---------------------------------------------
  // kind: 'tint' (site) or 'solid' (flying actor). color: css color or var.
  function bubble(x, y, label, opts = {}) {
    const r = opts.r || 18;
    const color = opts.color || "var(--mech,#0a84ff)";
    const cls = opts.cls || "";
    const sub = opts.sub || "";
    const solid = opts.solid;
    const fill = solid ? color : `color-mix(in srgb, ${color} 20%, var(--card,#fff))`;
    const stroke = color;
    const textFill = solid ? "#fff" : color;
    const subEl = sub
      ? `<text x="${x + r - 3}" y="${y + r - 2}" class="lbl-sm" fill="${textFill}" text-anchor="middle">${sub}</text>`
      : "";
    return `<g class="${cls} st">
      <circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <text x="${x}" y="${y + 4.5}" class="lbl" fill="${textFill}" text-anchor="middle">${label}</text>
      ${subEl}</g>`;
  }
  function bond(x1, y1, x2, y2, cls = "bond") {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`;
  }
  function dtag(x, y, text) { return `<text x="${x}" y="${y}" class="dtag" text-anchor="middle">${text}</text>`; }
  function cap(x, y, text, cls = "") { return `<text x="${x}" y="${y}" class="cap ${cls}" text-anchor="middle">${text}</text>`; }
  // reaction arrow
  function arrow(x1, x2, y) {
    return `<g><line x1="${x1}" y1="${y}" x2="${x2 - 6}" y2="${y}" class="arrow"/>
      <path d="M${x2 - 12},${y - 5} L${x2 - 2},${y} L${x2 - 12},${y + 5}" class="arrow"/></g>`;
  }

  // ---- label heuristics ----------------------------------------------------
  const SITE_MAP = [
    [/pSer|pThr|pTyr|磷酸|phospho/i, "P–O"],
    [/Cys|半胱|cystine|disulfide|二硫|thiol|S-S|SH/i, "S"],
    [/Met|蛋氨/i, "S"],
    [/Trp|色氨|indole|吲哚|Kyn/i, "Trp"],
    [/His|组氨|imidazol|咪唑/i, "His"],
    [/Tyr|酪氨|phenol|酚/i, "Tyr"],
    [/Ser|Thr|丝氨|苏氨|hydroxyl|羟基|O-/i, "O"],
    [/Arg|精氨|guanidin|胍/i, "Arg"],
    [/Asp|Glu|Asn|Gln|天冬|谷氨|aspart|glutar|carboxyl|羧/i, "C=O"],
    [/Lys|赖氨|Nε|amino|氨基|N-?term|N末端|N端/i, "N"],
  ];
  function shortSite(rec) {
    const hay = (rec.residuesRaw || "") + " " + rec.nameEn + " " + rec.nameZh + " " + (rec.product || "");
    for (const [re, s] of SITE_MAP) if (re.test(hay)) return s;
    const r0 = (rec.residues && rec.residues[0]) || "";
    return r0.replace(/[（(].*$/, "").slice(0, 4) || "R";
  }
  // short incoming-adduct token for adduct/substitution animations
  const ADDUCT_MAP = [
    [/tBu|叔丁/i, "tBu"], [/Trt|三苯甲|trityl|trityl|Tritylation/i, "Trt"], [/Pbf/i, "Pbf"],
    [/Acm|乙酰氨甲/i, "Acm"], [/Fmoc|Fm |Fm端|Fm封|Nα-Fm|Fm endcap/i, "Fm"], [/Boc|carbamate|氨基甲酸酯/i, "Boc"],
    [/acetyl|乙酰化|乙酰/i, "Ac"], [/formyl|甲酰/i, "CHO"], [/dimethyl|二甲基/i, "Me₂"],
    [/methyl|甲基化|甲酯|methyl ester/i, "Me"], [/ethyl|乙酯|乙基/i, "Et"],
    [/benzyl|苄基|Bn|羟基苄/i, "Bn"], [/EDT/i, "EDT"], [/DODT/i, "DODT"],
    [/sulfon|磺化|磺酸/i, "SO₃H"], [/chlorinat|氯化/i, "Cl"], [/cyanil|氰化|SCN|CN/i, "CN"],
    [/allyl|烯丙/i, "allyl"], [/glycerol|甘油/i, "甘油"], [/Schiff|imine|亚胺|席夫|acetaldehyde|乙醛/i, "=CR"],
    [/Michael|acrylic|丙烯/i, "–SR"], [/urea|脲/i, "urea"], [/amidine|脒/i, "C(=NH)"],
    [/guanidin|胍基化/i, "胍基"], [/TFA|三氟乙酰/i, "TFA"], [/linker|连接子|Rink|Pal|MBHA/i, "linker"],
    [/hydantoin|乙内酰脲/i, "环"], [/oxime|肟/i, "=NOR"],
  ];
  function shortAdduct(rec) {
    const hay = rec.nameEn + " " + rec.nameZh + " " + (rec.product || "");
    for (const [re, s] of ADDUCT_MAP) if (re.test(hay)) return s;
    return "R";
  }

  // ---- archetype builders --------------------------------------------------
  const B = {
    // O atoms add to a nucleophilic site
    oxidation(c) {
      const nOx = Math.max(1, Math.min(3, Math.round(Math.abs(c.delta) / 16) || 1));
      const oy = 118;
      let os = "";
      for (let i = 0; i < nOx; i++) {
        os += `<g style="animation-delay:${i * 0.18}s" class="actor-o">${bubble(150 + i * 2, 70, "O", { color: "#ff453a", solid: true, r: 14 })}</g>`;
      }
      return `${cap(80, 30, "反应位点 / Site")}${cap(258, 30, "氧化产物 / Product")}
        ${bubble(80, oy, c.site, { r: 22 })}
        ${arrow(120, 210, oy)}
        ${dtag(165, oy - 12, `${c.dsign}${c.delta}`)}
        ${os}
        ${bubble(262, oy, c.site, { r: 22, cls: "breathe" })}
        <g class="come">${bond(262, oy - 22, 262, oy - 40)}${bubble(262, 52, "O".repeat(nOx).length > 1 ? "O" + `<tspan class="lbl-sm" dy="3">${nOx}</tspan>` : "O", { color: "#ff453a", solid: true, r: 13 })}</g>`;
    },

    // E1cb: base removes αH, β leaving group departs, C=C forms
    elimination(c) {
      const cx = 170, top = 66, bot = 132;
      return `${cap(170, 28, "β-消除 → 脱氢丙氨酸 (Dha)")}
        ${bond(cx, top + 16, cx, bot - 16, "bond")}
        <g class="db">${bond(cx - 5, top + 20, cx - 5, bot - 20, "bond-hi")}${bond(cx + 5, top + 20, cx + 5, bot - 20, "bond-hi")}</g>
        ${bubble(cx, top, "Cα", { r: 18 })}
        ${bubble(cx, bot, "Cβ", { r: 18 })}
        <g class="go-up">${bubble(cx, top - 30, "H", { color: "#30d158", solid: true, r: 12 })}</g>
        <g class="go-down">${bubble(cx, bot + 30, "X", { color: "#ff9f0a", solid: true, r: 13, sub: "" })}</g>
        <g class="breathe" style="transform-origin:center"><text x="250" y="72" class="lbl" fill="var(--purple,#bf5af2)">B:</text></g>
        ${dtag(240, 128, `${c.dsign}${c.delta}`)}
        ${cap(112, bot + 8, "离去基 LG", "cap-in")}`;
    },

    // chain end nucleophile attacks carbonyl → ring + small molecule out
    cyclization(c) {
      const y = 112;
      return `${cap(170, 28, "分子内环化 / Intramolecular cyclization")}
        ${bond(60, y, 96, y)}${bond(96, y, 132, y)}${bond(132, y, 168, y)}
        ${bubble(60, y, "Nu", { color: "var(--mech)", r: 16 })}
        ${bubble(132, y, "C", { r: 16, sub: "O" })}
        <g class="ring-swing" style="transform-origin:60px ${y}px">
          <path d="M60,${y} C 60,${y - 60} 132,${y - 60} 132,${y}" class="arrow" fill="none"/>
        </g>
        ${arrow(186, 232, y)}
        <g class="come-pop">
          <circle cx="280" cy="${y}" r="30" fill="color-mix(in srgb, var(--mech) 16%, var(--card,#fff))" stroke="var(--mech)" stroke-width="2.4"/>
          <text x="280" y="${y - 2}" class="lbl" fill="var(--mech)" text-anchor="middle">环</text>
          <text x="280" y="${y + 12}" class="lbl-sm" fill="var(--mech)" text-anchor="middle">ring</text>
        </g>
        <g class="go-up"><text x="210" y="72" class="lbl-sm" fill="#5ac8fa" text-anchor="middle">−H₂O / −NH₃</text></g>
        ${dtag(205, y + 34, `${c.dsign}${c.delta}`)}`;
    },

    // water splits an amide/ester bond
    hydrolysis(c) {
      const y = 116;
      return `${cap(80, 30, "酰胺/酯键 / bond")}${cap(258, 30, "水解产物")}
        ${bubble(58, y, "C", { r: 17, sub: "O" })}
        ${bond(76, y, 108, y, "bond-hi")}
        ${bubble(126, y, "N", { color: "#0a84ff", r: 17 })}
        <g class="go-down"><g class="st">
          <circle cx="92" cy="66" r="15" fill="#5ac8fa" stroke="#3aa0d8" stroke-width="2"/>
          <text x="92" y="70" class="lbl-sm" fill="#fff" text-anchor="middle">H₂O</text></g></g>
        ${arrow(150, 210, y)}
        ${dtag(180, y - 12, `${c.dsign}${c.delta}`)}
        <g class="come">${bubble(244, y, "C", { r: 17, sub: "O" })}${bond(262, y, 288, y)}<text x="300" y="${y + 5}" class="lbl" fill="#ff453a" text-anchor="middle">OH</text></g>
        <g class="come" style="animation-delay:.15s"><text x="300" y="${y + 34}" class="lbl-sm" fill="#0a84ff" text-anchor="middle">H–N（断裂）</text></g>`;
    },

    // reductant cleaves S–S (or adds H)
    reduction(c) {
      const y = 112, l = 132, r = 208;
      const disulfide = /二硫|cystine|disulfid|desulfur|S-S/i.test(c.rec.nameEn + c.rec.nameZh + c.rec.product);
      if (disulfide) {
        return `${cap(170, 28, "二硫键还原 / Disulfide cleavage")}
          ${bubble(l, y, "S", { color: "#ffcc00", r: 17 })}
          <g class="db" style="animation-direction:reverse">${bond(l + 17, y, r - 17, y, "bond-hi")}</g>
          ${bubble(r, y, "S", { color: "#ffcc00", r: 17 })}
          <g class="come">${bubble(l, y, "S", { color: "#ffcc00", r: 17 })}<text x="${l}" y="${y - 26}" class="lbl" fill="#30d158" text-anchor="middle">H</text>${bond(l, y - 18, l, y - 10, "bond")}</g>
          <g class="come" style="animation-delay:.1s"><text x="${r}" y="${y - 26}" class="lbl" fill="#30d158" text-anchor="middle">H</text>${bond(r, y - 18, r, y - 10, "bond")}</g>
          <g class="go-up"><text x="170" y="60" class="lbl-sm" fill="#30d158" text-anchor="middle">2 [H] · TCEP/DTT</text></g>
          ${dtag(170, y + 34, `${c.dsign}${c.delta}`)}`;
      }
      return `${cap(80, 30, "不饱和位点")}${cap(258, 30, "还原产物")}
        ${bubble(80, y, c.site, { r: 21 })}
        ${arrow(118, 214, y)}
        ${dtag(166, y - 12, `${c.dsign}${c.delta}`)}
        <g class="go-down"><text x="166" y="72" class="lbl-sm" fill="#30d158" text-anchor="middle">+2[H]</text></g>
        ${bubble(262, y, c.site, { r: 21, cls: "breathe" })}
        <g class="come">${bond(262, y - 21, 262, y - 36)}<text x="262" y="${y - 40}" class="lbl" fill="#30d158" text-anchor="middle">H</text></g>`;
    },

    // phosphate leaves
    dephospho(c) {
      const y = 114;
      return `${cap(78, 30, "磷酸肽 / Phosphopeptide")}${cap(262, 30, "去磷酸产物")}
        ${bubble(70, y, "O", { color: "#0a84ff", r: 16 })}
        ${bond(86, y, 116, y, "bond-hi")}
        <g class="go-right"><g class="st">
          <circle cx="140" cy="${y}" r="19" fill="color-mix(in srgb,#ff9f0a 20%,var(--card,#fff))" stroke="#ff9f0a" stroke-width="2.2"/>
          <text x="140" y="${y - 1}" class="lbl" fill="#ff9f0a" text-anchor="middle">PO₃</text>
          <text x="140" y="${y + 11}" class="lbl-sm" fill="#ff9f0a" text-anchor="middle">/H₃PO₄</text></g></g>
        ${arrow(176, 236, y)}
        ${dtag(206, y - 12, `${c.dsign}${c.delta}`)}
        <g class="come">${bubble(268, y, "O", { color: "#0a84ff", r: 16 })}<text x="292" y="${y + 5}" class="lbl" fill="#ff453a" text-anchor="middle">H</text>${bond(284, y, 286, y)}</g>`;
    },

    // electrophile R adds to nucleophilic site
    adduct(c) {
      const y = 116;
      return `${cap(72, 30, "亲核残基 / Nucleophile")}${cap(262, 30, "加合产物 / Adduct")}
        ${bubble(72, y, c.site, { r: 21 })}
        ${arrow(112, 210, y)}
        ${dtag(160, y - 12, `${c.dsign}${c.delta}`)}
        <g class="actor-r">${bubble(240, 62, c.add, { color: "#bf5af2", solid: true, r: 16 })}</g>
        ${bubble(262, y, c.site, { r: 21, cls: "breathe" })}
        <g class="come">${bond(283, y - 6, 300, y - 20)}${bubble(312, 78, c.add, { color: "#bf5af2", solid: true, r: 15 })}</g>`;
    },

    // group A replaced by group B
    substitution(c) {
      const y = 116;
      return `${cap(80, 30, "起始基团")}${cap(260, 30, "取代产物")}
        ${bubble(80, y, c.site, { r: 20 })}
        ${bond(100, y, 122, y)}
        <g class="go-up">${bubble(140, y, "A", { color: "#ff9f0a", solid: true, r: 13 })}</g>
        ${arrow(160, 214, y)}
        ${dtag(188, y - 12, `${c.dsign}${c.delta}`)}
        ${bubble(262, y, c.site, { r: 20 })}
        <g class="come">${bond(282, y, 300, y)}${bubble(312, y, c.add === "R" ? "B" : c.add, { color: "var(--mech)", solid: true, r: 13 })}</g>`;
    },

    // ring opens, backbone reconnects via iso/β linkage
    rearrangement(c) {
      const cx = 110, cy = 112;
      return `${cap(110, 28, "酰亚胺开环 / Ring-opening")}${cap(262, 28, "异肽 (β) 产物")}
        <g class="breathe" style="transform-origin:${cx}px ${cy}px">
          <polygon points="${cx},${cy - 30} ${cx + 28},${cy - 9} ${cx + 17},${cy + 24} ${cx - 17},${cy + 24} ${cx - 28},${cy - 9}"
            fill="color-mix(in srgb,var(--mech) 15%,var(--card,#fff))" stroke="var(--mech)" stroke-width="2.4"/>
          <text x="${cx}" y="${cy + 4}" class="lbl-sm" fill="var(--mech)" text-anchor="middle">imide</text>
        </g>
        ${arrow(160, 218, cy)}
        ${dtag(189, cy - 12, `${c.dsign}${c.delta}`)}
        <g class="come">
          ${bond(240, cy, 268, cy - 16)}${bond(268, cy - 16, 296, cy)}
          ${bubble(240, cy, "α", { r: 14 })}
          ${bubble(296, cy, "β", { color: "var(--mech)", solid: true, r: 14 })}
          <text x="268" y="${cy + 26}" class="lbl-sm" fill="var(--mech)" text-anchor="middle">iso-peptide</text>
        </g>`;
    },
  };

  function buildSvg(rec) {
    const build = B[rec.mech] || B.adduct;
    const ctx = {
      site: shortSite(rec),
      add: shortAdduct(rec),
      delta: rec.deltaAvg,
      dsign: rec.deltaAvg > 0 ? "+" : "",
      rec,
    };
    return `<svg class="stage" viewBox="${VB}" xmlns="http://www.w3.org/2000/svg" role="img"
      aria-label="${rec.nameZh} 机理示意动画">
      <style>${STYLE}</style>${build(ctx)}</svg>`;
  }

  const ICON_REPLAY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>`;

  window.PeptideMechAnim = {
    // Render into a `.anim-stage` element (creates caption + replay + svg).
    render(stage, rec, archLabel) {
      stage.innerHTML =
        `<span class="anim-caption">${archLabel || ""}</span>` +
        buildSvg(rec) +
        `<button class="anim-replay" type="button" aria-label="重播动画">${ICON_REPLAY}重播</button>`;
      const replay = stage.querySelector(".anim-replay");
      replay.addEventListener("click", () => this.render(stage, rec, archLabel));
    },
    buildSvg,
  };
})();
