/* ============================================================================
   保护肽分子量计算器 · app.js  (v2.0)
   - Calculation engine + Kaiser colorimetric engine carried over (verified).
   - Vibrant iOS UI wiring, module tab bar, theme cycling.
   - Enhanced Δmass module: matches → detail sheet with mechanism animation.
   - Dead code removed (CSV/PDF export, unused report profiles, reagent lib).
   ========================================================================== */
(() => {
  "use strict";

  const {
    atomMass, residues, codeToResidue, groups, terminalGroups, salts, water,
    defaultExample, peptideTemplates, builtInExamples, groupSiteTypes,
    chemistryLibrary,
  } = globalThis.PeptideChemistryData;

  const SR = globalThis.PeptideSideReactionData || {};
  const sideRecords = SR.records || [];
  const archetypes = SR.archetypes || {};
  const SR_SOURCE = SR.source || "";
  const SR_SOURCE_SHORT = SR.sourceShort || "";
  const SR_URL = SR.sourceUrl || "#";

  const THEME_KEY = "ppc-theme";
  const MODULE_COLOR = { calc: "var(--blue)", kaiser: "var(--orange)", delta: "var(--purple)" };
  const ARCH_COLOR = {
    oxidation: "var(--red)", elimination: "var(--purple)", cyclization: "var(--indigo)",
    hydrolysis: "var(--teal)", reduction: "var(--green)", dephospho: "var(--orange)",
    adduct: "var(--pink)", substitution: "var(--blue)", rearrangement: "var(--mint)",
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // Safe storage — file:// double-click / private mode can throw on localStorage.
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  };

  // ==========================================================================
  // Calculation engine (unchanged, verified against Expasy/Unimod)
  // ==========================================================================
  function cloneFormula(f = {}) { return { ...f }; }
  function addFormula(t, s, m = 1) {
    Object.entries(s || {}).forEach(([a, c]) => { t[a] = (t[a] || 0) + c * m; if (Math.abs(t[a]) < 1e-9) delete t[a]; });
    return t;
  }
  function formulaMass(f) {
    return Object.entries(f).reduce((m, [a, c]) => ({
      avg: m.avg + (atomMass[a]?.avg || 0) * c, mono: m.mono + (atomMass[a]?.mono || 0) * c,
    }), { avg: 0, mono: 0 });
  }
  function formulaToText(f) {
    const order = ["C", "H", "Br", "Cl", "F", "N", "O", "S"];
    return order.filter((a) => f[a]).map((a) => `${a}${f[a] === 1 ? "" : Number.isInteger(f[a]) ? f[a] : f[a].toFixed(2)}`).join("");
  }
  function normalizeToken(t) { return t.trim().replace(/[（]/g, "(").replace(/[）]/g, ")").replace(/\s+/g, ""); }
  function hasBalancedParentheses(s) {
    let d = 0, b = 0, r = 0;
    for (const c of s) { if (c === "(") d++; if (c === ")") d--; if (c === "[") b++; if (c === "]") b--; if (c === "{") r++; if (c === "}") r--; if (d < 0 || b < 0 || r < 0) return false; }
    return d === 0 && b === 0 && r === 0;
  }
  function splitTopLevel(input, sep = "-") {
    const parts = []; let cur = "", p = 0, b = 0, r = 0;
    for (const c of input) {
      if (c === "(") p++; if (c === ")") p--; if (c === "[") b++; if (c === "]") b--; if (c === "{") r++; if (c === "}") r--;
      if (c === sep && !p && !b && !r) { parts.push(cur); cur = ""; continue; }
      cur += c;
    }
    parts.push(cur);
    return parts.map(normalizeToken).filter(Boolean);
  }
  function mergeKnownHyphenatedGroups(parts) {
    const out = [];
    for (let i = 0; i < parts.length; i++) {
      const two = `${parts[i]}-${parts[i + 1]}`;
      if (groups[two]) { out.push(two); i++; } else out.push(parts[i]);
    }
    return out;
  }
  function normalizeCurlySideChainToken(token) {
    const m = token.match(/^\{(.+)\}$/); if (!m) return token;
    const parts = mergeKnownHyphenatedGroups(splitTopLevel(m[1]));
    if (parts.length < 2) return token;
    const anchor = parts.at(-1);
    if (parseResidue(anchor).kind !== "residue") return token;
    return `${anchor}[${parts.slice(0, -1).join("-")}]`;
  }
  function isUnseparatedOneLetterSequence(input) {
    return /^[A-Za-z]+$/.test(input) && input.length > 1 && [...input].every((c) => codeToResidue[c.toUpperCase()]);
  }
  function parseResidue(token) {
    const m = token.match(/^([A-Za-z][A-Za-z0-9]{0,9})(?:\(([^()]*)\))?(?:\[([^\]]*)\])?$/);
    if (!m) return { kind: "invalid", raw: token };
    let name = m[1];
    if (name.length === 1) name = codeToResidue[name.toUpperCase()];
    const proper = Object.keys(residues).find((k) => k.toLowerCase() === String(name).toLowerCase());
    if (!proper) return { kind: "unknownAminoAcid", name: m[1], raw: token };
    const mods = m[2] ? m[2].split(/[,+/]/).map(normalizeToken).filter(Boolean) : [];
    const sideChainChain = m[3] ? mergeKnownHyphenatedGroups(splitTopLevel(m[3])) : [];
    return { kind: "residue", name: proper, code: residues[proper].code, mods, sideChainChain, raw: token };
  }
  function parseSequence(input) {
    const s = input.trim().replace(/[（]/g, "(").replace(/[）]/g, ")");
    const errors = [];
    if (!s) { errors.push("Missing C-terminal group"); return { tokens: [], nTerminal: [], cTerminal: [], aa: [], unknown: [], unknownMods: [], errors }; }
    if (!hasBalancedParentheses(s)) errors.push("Parentheses not closed");
    if (/[–—_;/|]+/.test(s) || /\s+-|-\s+|\s{2,}/.test(s) || /[A-Za-z)]\s+[A-Za-z(]/.test(s)) errors.push("Invalid sequence separator");
    const one = isUnseparatedOneLetterSequence(s);
    const tokens = one ? [...s].map((c) => c.toUpperCase()) : splitTopLevel(s);
    const nTerminal = [], cTerminal = one ? ["OH"] : [], aa = [], unknown = [], unknownMods = [];
    tokens.forEach((token, i) => {
      const rt = normalizeCurlySideChainToken(token);
      if (i === 0 && (groups[token] || token in terminalGroups)) { nTerminal.push(token); return; }
      if (i === tokens.length - 1 && token in terminalGroups) { cTerminal.push(token); return; }
      if (groups[token]) { nTerminal.push(token); return; }
      const res = parseResidue(rt);
      if (res.kind === "residue") {
        res.mods.forEach((mod) => { if (!groups[mod]) { unknownMods.push(`${res.name}(${mod})`); errors.push(`Unknown protecting group: ${mod}`); } });
        res.sideChainChain.forEach((part) => { const cp = parseResidue(part); if (!groups[part] && cp.kind !== "residue") { unknownMods.push(`${res.name}[${part}]`); errors.push(`Unknown protecting group: ${part}`); } });
        aa.push(res); return;
      }
      if (res.kind === "unknownAminoAcid") { errors.push(`Unknown amino acid: ${res.name}`); unknown.push(token); return; }
      if (/^[A-Za-z]+$/.test(token) && i !== tokens.length - 1) errors.push(`Unknown amino acid: ${token}`);
      else errors.push(`Unknown protecting group: ${token}`);
      unknown.push(token);
    });
    if (!cTerminal.length) errors.push("Missing C-terminal group");
    return { tokens, nTerminal, cTerminal, aa, unknown, unknownMods, errors: [...new Set(errors)] };
  }
  function sideChainSiteLabel(residue, index) { return `${index + 1}-${residue.name} 侧链 (${residues[residue.name].sideChain || "侧链"})`; }
  function isCommonResidueProtection(name, group) { return (residues[name].commonProtections || []).includes(group); }
  function displayProtectingGroup(item) { return item.siteType === "backbone N" && item.group === "Fmoc" ? "N-Fmoc" : item.label; }
  function groupSiteCategory(group, siteType) {
    if (siteType === "backbone N") return "N端";
    if (groupSiteTypes.fattyAcid.has(group)) return "脂肪酸修饰";
    if (groupSiteTypes.chelator.has(group)) return "螯合剂";
    if (groupSiteTypes.linker.has(group)) return "连接臂";
    if (siteType === "side-chain linker") return "连接臂";
    return "侧链保护";
  }
  function addDeprotectedGroupFormula(df, group) {
    if (!groups[group]) return;
    if (groups[group].deprotectedFormula) addFormula(df, groups[group].deprotectedFormula);
    else if (groups[group].labile === "stable") addFormula(df, groups[group].formula);
  }
  function addResidueModifier(pf, df, list, residue, index, mod, sitePrefix = sideChainSiteLabel(residue, index)) {
    if (!groups[mod]) return;
    const isLinker = sitePrefix.includes("linker") || sitePrefix.includes("连接臂");
    addFormula(pf, groups[mod].formula); addDeprotectedGroupFormula(df, mod);
    list.push({ group: mod, site: sitePrefix, siteType: isLinker ? "side-chain linker" : "side-chain", siteCategory: groupSiteCategory(mod, isLinker ? "side-chain linker" : "side-chain"), residue: residue.name, commonForResidue: isCommonResidueProtection(residue.name, mod), ...groups[mod] });
  }
  function addSideChainChainUnit(pf, df, list, residue, index, unit, unitIndex, options = {}) {
    const site = `${sideChainSiteLabel(residue, index)} 连接臂 ${unitIndex + 1}`;
    if (groups[unit]) {
      addFormula(pf, groups[unit].formula); addDeprotectedGroupFormula(df, unit);
      list.push({ group: unit, site, siteType: "side-chain linker", siteCategory: groupSiteCategory(unit, "side-chain linker"), residue: residue.name, commonForResidue: true, ...groups[unit] });
      return;
    }
    const cr = parseResidue(unit); if (cr.kind !== "residue") return;
    const cf = options.useSideChainLinkerFormula ? residues[cr.name].sideChainFormula || residues[cr.name].formula : residues[cr.name].formula;
    addFormula(pf, cf); addFormula(df, cf);
    list.push({ group: cr.name, label: residues[cr.name].code || cr.name, site, siteType: "side-chain linker", siteCategory: groupSiteCategory(cr.name, "side-chain linker"), residue: residue.name, commonForResidue: true, labile: "stable", class: residues[cr.name].special ? "special amino acid linker" : "amino acid linker" });
    cr.mods.forEach((mod) => addResidueModifier(pf, df, list, { ...cr, name: cr.name }, index, mod, `${site} ${cr.name} 侧链`));
    cr.sideChainChain.forEach((n, ni) => addSideChainChainUnit(pf, df, list, cr, index, n, ni, options));
  }
  function calculate(parsed) {
    const df = cloneFormula(water), pf = cloneFormula(water), list = [];
    parsed.aa.forEach((residue, index) => {
      addFormula(df, residues[residue.name].formula); addFormula(pf, residues[residue.name].formula);
      residue.mods.forEach((mod) => addResidueModifier(pf, df, list, residue, index, mod));
      const isLipid = residue.sideChainChain.some((u) => ["C18-OtBu", "C20-OtBu"].includes(u));
      residue.sideChainChain.forEach((u, ui) => addSideChainChainUnit(pf, df, list, residue, index, u, ui, { useSideChainLinkerFormula: !isLipid }));
    });
    parsed.nTerminal.forEach((g) => {
      if (groups[g]) { addFormula(pf, groups[g].formula); addDeprotectedGroupFormula(df, g); list.push({ group: g, site: "主链 N 端", siteType: "backbone N", siteCategory: groupSiteCategory(g, "backbone N"), commonForResidue: true, ...groups[g] }); }
    });
    parsed.cTerminal.forEach((g) => { if (terminalGroups[g]) { addFormula(pf, terminalGroups[g].formula); addFormula(df, terminalGroups[g].formula); } });
    return { deprotectedFormula: df, protectedFormula: pf, deprotectedMass: formulaMass(df), protectedMass: formulaMass(pf), protectingList: list };
  }
  function assessRisks(parsed, calc) {
    const risks = [];
    const seq = parsed.aa.map((a) => a.code).join("");
    const acidic = parsed.aa.filter((a) => a.code === "D" || a.code === "E").length;
    const basic = parsed.aa.filter((a) => ["R", "K", "H"].includes(a.code)).length;
    const hydrophobic = parsed.aa.filter((a) => ["V", "I", "L", "F", "W", "M", "Y"].includes(a.code)).length;
    if (parsed.errors.length) parsed.errors.forEach((e) => risks.push({ level: "high", text: e }));
    calc.protectingList.filter((i) => i.siteType === "side-chain" && !i.commonForResidue).forEach((i) => risks.push({ level: "medium", text: `请核对保护基位置：${i.residue} 侧链上的 ${i.group} 不在常见库中。` }));
    calc.protectingList.filter((i) => i.class?.startsWith("albumin-binding")).forEach((i) => risks.push({ level: "medium", text: `检测到脂肪化长效肽片段：${i.group} @ ${i.site}。建议确认连接臂、盐型和供应商积木结构。` }));
    parsed.aa.filter((r) => residues[r.name].special).forEach((r) => risks.push({ level: "medium", text: `检测到特殊残基：${r.name}。建议确认偶联方法、构型和数据库质量设置。` }));
    if (seq.includes("DG") || seq.includes("DS") || seq.includes("DT")) risks.push({ level: "medium", text: "Asp-Gly/Asp-Ser/Asp-Thr 片段需关注 aspartimide（天冬酰亚胺）副反应。" });
    if (seq.includes("P")) risks.push({ level: "medium", text: "含 Pro，Pro 后偶联位点可能导致 Kaiser test 假阴性或显色不敏感，建议结合 chloranil test 或 LC-MS 复核。" });
    if (seq.includes("C")) risks.push({ level: "medium", text: "含 Cys，需关注氧化、二硫键形成及强酸脱保护条件下的捕获剂配置。" });
    if (seq.includes("M") || seq.includes("W")) risks.push({ level: "medium", text: "含 Met/Trp，强酸脱保护和后处理阶段需关注氧化或烷基化副反应。" });
    if (hydrophobic / Math.max(parsed.aa.length, 1) >= 0.45 && parsed.aa.length >= 5) risks.push({ level: "medium", text: "疏水残基比例较高，树脂溶胀、聚集和偶联完成度可能受影响。" });
    if (basic >= 3) risks.push({ level: "medium", text: "碱性残基较多，粗肽纯化和盐型转换时可能出现强保留或拖尾。" });
    if (acidic >= 3) risks.push({ level: "medium", text: "酸性残基较多，需关注侧链保护完整性与后续盐型选择。" });
    if (calc.protectingList.filter((i) => i.labile === "acid").length >= 4) risks.push({ level: "medium", text: "酸敏保护基数量较多，TFA 脱保护体系和清除剂比例建议单独确认。" });
    if (!risks.length) risks.push({ level: "low", text: "未发现明显高频序列风险，仍建议结合树脂、偶联体系和分析方法复核。" });
    return risks;
  }
  const fixed = (v) => (Number.isFinite(v) ? v.toFixed(4) : "--");
  const fixed2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "--");
  const riskLevelLabel = (l) => ({ high: "高", medium: "中", low: "低", High: "高", Medium: "中", Low: "低" }[l] || l);
  function saltDisplayLabel(salt, eq) { return salt.label === "Free" || eq === 0 ? "游离型" : `${eq} ${salt.label}`; }

  // ==========================================================================
  // DOM
  // ==========================================================================
  const els = {
    tabs: $$(".tab"),
    views: $$(".view"),
    themeBtn: $("#themeBtn"),
    paletteDots: $$(".pal-dot"),
    toast: $("#toast"),
    // calc
    seqInput: $("#seqInput"), exampleSelect: $("#exampleSelect"),
    saltType: $("#saltType"), saltEquiv: $("#saltEquiv"),
    parseStatus: $("#parseStatus"), residueCount: $("#residueCount"),
    terminalSummary: $("#terminalSummary"), parsedSeq: $("#parsedSeq"),
    protAvg: $("#protAvg"), protMono: $("#protMono"), deprotAvg: $("#deprotAvg"), deprotMono: $("#deprotMono"),
    protFormula: $("#protFormula"), deprotFormula: $("#deprotFormula"),
    saltLabel: $("#saltLabel"), saltAvg: $("#saltAvg"), saltMono: $("#saltMono"),
    pgCount: $("#pgCount"), pgList: $("#pgList"),
    riskLevel: $("#riskLevel"), riskList: $("#riskList"),
    reportText: $("#reportText"),
    btnCalc: $("#btnCalc"), btnClear: $("#btnClear"), btnCopy: $("#btnCopy"), btnExample: $("#btnExample"),
    // delta
    deltaMode: $("#deltaMode"), paneDelta: $("#paneDelta"), paneMz: $("#paneMz"),
    deltaInput: $("#deltaInput"), deltaTol: $("#deltaTol"), deltaQuick: $("#deltaQuick"),
    mzInput: $("#mzInput"), zInput: $("#zInput"), derivedDelta: $("#derivedDelta"),
    seqPanel: $("#seqPanel"), impSeq: $("#impSeq"), impNterm: $("#impNterm"), impCterm: $("#impCterm"),
    impSS: $("#impSS"), impCam: $("#impCam"), impSC: $("#impSC"), impMaxK: $("#impMaxK"), tolPpm: $("#tolPpm"), impDemo: $("#impDemo"),
    mainStatsCard: $("#mainStatsCard"), mainStats: $("#mainStats"), mainFormula: $("#mainFormula"), deltaDerivedLine: $("#deltaDerivedLine"),
    deltaCount: $("#deltaCount"), deltaResults: $("#deltaResults"),
    // sheet
    sheetScrim: $("#sheetScrim"), sheet: $("#sheet"), sheetGrab: $("#sheetGrab"), sheetContent: $("#sheetContent"),
    // kaiser
    kaiserSeg: $("#kaiserSeg"),
    kaiserVideo: $("#kaiserVideo"), kaiserCanvas: $("#kaiserCanvas"),
    kaiserRoi: $("#kaiserRoi"), kaiserBand: $("#kaiserBand"),
    kaiserState: $("#kaiserState"),
    btnKaiserStart: $("#btnKaiserStart"), btnKaiserCapture: $("#btnKaiserCapture"), btnKaiserBlank: $("#btnKaiserBlank"),
    kaiserHeatmap: $("#kaiserHeatmap"), kaiserPhoto: $("#kaiserPhoto"),
    kaiserVerdict: $("#kaiserVerdict"), kaiserResultText: $("#kaiserResultText"), kaiserScore: $("#kaiserScore"), kaiserFill: $("#kaiserFill"),
    kaiserCurLab: $("#kaiserCurLab"), kaiserBlankLab: $("#kaiserBlankLab"), kaiserDeltaE: $("#kaiserDeltaE"), kaiserGuidance: $("#kaiserGuidance"),
  };

  function toast(msg) {
    if (!els.toast) return;
    els.toast.textContent = msg; els.toast.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => els.toast.classList.remove("show"), 1600);
  }

  // ==========================================================================
  // Theme
  // ==========================================================================
  const THEME_ICONS = {
    system: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" fill="currentColor"/><path d="M12 3a9 9 0 010 18z" fill="currentColor" stroke="none"/></svg>`,
    light: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
    dark: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M21 12.8A8.5 8.5 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>`,
  };
  const THEME_LABEL = { system: "跟随系统", light: "浅色", dark: "深色" };
  function applyTheme(theme) {
    const t = ["system", "light", "dark"].includes(theme) ? theme : "system";
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = t;
    if (els.themeBtn) { els.themeBtn.innerHTML = THEME_ICONS[t]; els.themeBtn.setAttribute("aria-label", `主题：${THEME_LABEL[t]}`); els.themeBtn.title = `主题：${THEME_LABEL[t]}`; }
    store.set(THEME_KEY, t);
  }
  function cycleTheme() {
    const cur = store.get(THEME_KEY) || "system";
    const next = { system: "light", light: "dark", dark: "system" }[cur];
    applyTheme(next); toast(`主题：${THEME_LABEL[next]}`);
  }

  // ==========================================================================
  // Color palette (default multi-color / pink / deep-purple)
  // ==========================================================================
  const PALETTE_KEY = "ppc-palette";
  const PALETTES = ["default", "pink", "purple"];
  let currentModule = "calc";
  let currentPalette = "default";
  const accentForModule = (mod) => (currentPalette === "default" ? (MODULE_COLOR[mod] || "var(--blue)") : "var(--pal-accent)");
  function applyPalette(p) {
    currentPalette = PALETTES.includes(p) ? p : "default";
    if (currentPalette === "default") document.documentElement.removeAttribute("data-palette");
    else document.documentElement.dataset.palette = currentPalette;
    (els.paletteDots || []).forEach((d) => d.setAttribute("aria-pressed", String(d.dataset.pal === currentPalette)));
    document.documentElement.style.setProperty("--accent", accentForModule(currentModule));
    store.set(PALETTE_KEY, currentPalette);
  }

  // ==========================================================================
  // Module switching
  // ==========================================================================
  function switchModule(mod) {
    currentModule = mod;
    els.tabs.forEach((t) => { const a = t.dataset.module === mod; t.classList.toggle("is-active", a); t.setAttribute("aria-selected", String(a)); });
    els.views.forEach((v) => v.classList.toggle("is-active", v.dataset.module === mod));
    document.documentElement.style.setProperty("--accent", accentForModule(mod));
    if (mod === "kaiser") positionSegThumb(els.kaiserSeg);
  }

  // ==========================================================================
  // Segmented control thumb
  // ==========================================================================
  function positionSegThumb(seg) {
    if (!seg) return;
    const thumb = seg.querySelector(".seg-thumb");
    const active = seg.querySelector(".seg.is-active");
    if (!thumb || !active) return;
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft - 2}px)`;
  }

  // ==========================================================================
  // Calculator render
  // ==========================================================================
  let currentResult = null;
  function render() {
    const parsed = parseSequence(els.seqInput.value);
    const calc = calculate(parsed);
    const salt = salts[els.saltType.value] || salts.free;
    const saltEquiv = Math.max(0, Number(els.saltEquiv.value) || 0);
    const saltFormula = cloneFormula(calc.deprotectedFormula);
    addFormula(saltFormula, salt.formula, saltEquiv);
    const saltMass = formulaMass(saltFormula);
    const risks = assessRisks(parsed, calc);

    const protFT = formulaToText(calc.protectedFormula);
    const deprotFT = formulaToText(calc.deprotectedFormula);
    const saltFT = salt.label === "Free" || saltEquiv === 0 ? deprotFT : `${deprotFT}·${saltEquiv}${salt.label}`;
    const saltLabel = saltDisplayLabel(salt, saltEquiv);

    els.protAvg.textContent = fixed(calc.protectedMass.avg);
    els.protMono.textContent = fixed(calc.protectedMass.mono);
    els.deprotAvg.textContent = fixed(calc.deprotectedMass.avg);
    els.deprotMono.textContent = fixed(calc.deprotectedMass.mono);
    els.protFormula.textContent = protFT || "--";
    els.deprotFormula.textContent = deprotFT || "--";
    els.saltLabel.textContent = saltLabel;
    els.saltAvg.textContent = fixed(saltMass.avg);
    els.saltMono.textContent = fixed(saltMass.mono);
    els.residueCount.textContent = `${parsed.aa.length} 残基`;
    els.pgCount.textContent = String(calc.protectingList.length);

    const ok = !parsed.errors.length;
    els.parseStatus.className = `status-chip ${ok ? "" : "warn"}`;
    els.parseStatus.innerHTML = `<span class="dot"></span>${ok ? "已解析" : "需校对"}`;

    const nTermText = parsed.nTerminal.length ? parsed.nTerminal.join(", ") : "H";
    const cTermText = parsed.cTerminal.length ? parsed.cTerminal.join(", ") : "缺失";
    els.terminalSummary.innerHTML = `<span class="chip">N端 · ${nTermText}</span><span class="chip">C端 · ${cTermText}</span>`;

    els.parsedSeq.innerHTML = parsed.aa.map((aa, i) => `
      <li><span class="seq-idx">${i + 1}</span>
        <span class="seq-main">
          <span class="seq-name">${aa.name} <small style="color:var(--label-3);font-weight:600">${aa.code}</small></span>
          <span class="seq-mods ${aa.mods.some((m) => !groups[m]) ? "err" : ""}">${[aa.mods.length ? `侧链保护: ${aa.mods.join(", ")}` : "", aa.sideChainChain.length ? `侧链连接: ${aa.sideChainChain.join("-")}` : ""].filter(Boolean).join("; ") || "无侧链保护"}</span>
        </span></li>`).join("") || `<li style="justify-content:center;color:var(--label-2)"><span class="seq-main" style="text-align:center">请输入序列</span></li>`;

    els.pgList.innerHTML = calc.protectingList.length
      ? calc.protectingList.map((i) => `<span class="chip">${displayProtectingGroup(i)}<small>${i.site}</small></span>`).join("")
      : `<span class="chip">无保护基</span>`;

    els.riskList.innerHTML = risks.map((r) => `<li class="${r.level}">${r.text}</li>`).join("");
    const top = risks.some((r) => r.level === "high") ? "High" : risks.some((r) => r.level === "medium") ? "Medium" : "Low";
    els.riskLevel.textContent = riskLevelLabel(top);
    els.riskLevel.dataset.lv = top;

    const protRows = calc.protectingList.length ? calc.protectingList.map((i) => `- ${displayProtectingGroup(i)} @ ${i.site} (${i.siteCategory}; ${i.class}; ${i.labile})`).join("\n") : "- 无";
    const template = peptideTemplates.find((t) => t.sequence === els.seqInput.value.trim()) || null;

    currentResult = { sequence: els.seqInput.value.trim(), template, parsed, calc, saltMass, risks, saltLabel };
    els.reportText.textContent = [
      "研发计算报告 · Protected Peptide MW Report",
      `化学数据库版本: ${chemistryLibrary.version}`,
      `模板: ${template ? `${template.family} | ${template.name}` : "自定义序列"}`,
      `序列: ${els.seqInput.value.trim()}`,
      `保护肽平均分子量: ${fixed(calc.protectedMass.avg)}`,
      `保护肽单同位素质量: ${fixed(calc.protectedMass.mono)}`,
      `脱保护肽平均分子量: ${fixed(calc.deprotectedMass.avg)}`,
      `脱保护肽单同位素质量: ${fixed(calc.deprotectedMass.mono)}`,
      `盐型平均分子量: ${fixed(saltMass.avg)} (${saltLabel})`,
      `盐型单同位素质量: ${fixed(saltMass.mono)} (${saltLabel})`,
      `保护态分子式: ${protFT}`,
      `脱保护态分子式: ${deprotFT}`,
      `盐型分子式: ${saltFT}`,
      `N端: ${nTermText}`, `C端: ${cTermText}`,
      "", "保护基 / 修饰:", protRows,
      "", "潜在合成风险:", risks.map((r) => `- [${riskLevelLabel(r.level)}] ${r.text}`).join("\n"),
      "", "说明: 分子量按残基公式 + 末端 H2O 计算；保护基按连接后的净增量建模。研发估算工具，放行前请以标准品/COA 校准。",
    ].join("\n");
  }

  // ==========================================================================
  // Δmass lookup + detail sheet
  // ==========================================================================
  const IMP = globalThis.PeptideImpurityData || { AA: {}, MODS: [], SC_PRESETS: [], PROTON: 1.007276466, ATOM: {} };
  const readNum = (el, fb) => { if (!el || el.value === "") return fb; const v = Number(el.value); return Number.isFinite(v) ? v : fb; };
  const CHEV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>`;
  let dMode = "delta";

  // ---- impurity math -------------------------------------------------------
  function impParseSeq(raw) { const s = (raw || "").toUpperCase().replace(/[^A-Z]/g, ""); const bad = [...s].filter((c) => !IMP.AA[c]).join(""); return { seq: s, bad }; }
  function impFormula(e) { let s = "C" + e.C + "H" + e.H; if (e.N) s += "N" + e.N; s += "O" + e.O; if (e.S) s += "S" + e.S; return s; }
  function impMain(seq, opts) {
    const e = { C: 0, H: 0, N: 0, O: 0, S: 0 };
    for (const c of seq) { const x = IMP.AA[c].elem; e.C += x.C; e.H += x.H; e.N += x.N; e.O += x.O; if (x.S) e.S += x.S; }
    const n = seq.length; e.H -= 2 * (n - 1); e.O -= (n - 1);
    if (opts.nterm === "acetyl") { e.C += 2; e.H += 2; e.O += 1; }
    if (opts.cterm === "amide") { e.N += 1; e.O -= 1; e.H += 1; }
    e.H -= 2 * (+opts.ss || 0);
    if (opts.cam === "yes") for (const c of seq) if (c === "C") { e.C += 2; e.H += 3; e.N += 1; e.O += 1; }
    const A = IMP.ATOM; const mass = e.C * A.C + e.H * A.H + e.N * A.N + e.O * A.O + (e.S || 0) * A.S;
    return { mass, formula: impFormula(e) };
  }
  const resMassInChain = (aa, cam) => IMP.AA[aa].mono + (aa === "C" && cam ? 57.021464 : 0);
  function combos(arr, k) { const r = [], n = arr.length, idx = new Array(k); (function rec(s, d) { if (d === k) { r.push(idx.slice()); return; } for (let i = s; i <= n - k + d; i++) { idx[d] = arr[i]; rec(i + 1, d + 1); } })(0, 0); return r; }
  function combosRep(arr, k) { const r = [], n = arr.length, idx = new Array(k); (function rec(s, d) { if (d === k) { r.push(idx.slice()); return; } for (let i = s; i < n; i++) { idx[d] = arr[i]; rec(i, d + 1); } })(0, 0); return r; }

  function modSite(mod, seq) {
    const has = (c) => seq.includes(c);
    switch (mod.need) {
      case "": return { ok: true, note: "本征/普适" };
      case "Met": return has("M") ? { ok: true, note: "含 Met" } : { ok: false, note: "无 Met" };
      case "Trp": return has("W") ? { ok: true, note: "含 Trp" } : { ok: false, note: "无 Trp" };
      case "His/Phe/Tyr": return (has("H") || has("F") || has("Y")) ? { ok: true, note: "含 H/F/Y" } : { ok: false, note: "无 H/F/Y" };
      case "Asn/Gln": return (has("N") || has("Q")) ? { ok: true, note: "含 N/Q" } : { ok: false, note: "无 N/Q" };
      case "N-term": return { ok: true, note: "N端通用" };
      case "N-termGlnE": return (seq[0] === "Q" || seq[0] === "E") ? { ok: true, note: "N端为 " + seq[0] } : { ok: false, note: "N端非 Q/E" };
      case "C-term": return { ok: true, note: "C端通用" };
      case ">=2Cys": { const n = (seq.match(/C/g) || []).length; return n >= 2 ? { ok: true, note: n + " 个 Cys" } : { ok: false, note: "Cys<2" }; }
      case "Cys": return has("C") ? { ok: true, note: "含 Cys" } : { ok: false, note: "无 Cys" };
      case "Ser/Thr/Tyr": return (has("S") || has("T") || has("Y")) ? { ok: true, note: "含 S/T/Y" } : { ok: false, note: "无 S/T/Y" };
      case "Tyr": return has("Y") ? { ok: true, note: "含 Tyr" } : { ok: false, note: "无 Tyr" };
      default: return { ok: true, note: "" };
    }
  }
  const RX_SITE_MAP = [["Cys", "C"], ["Met", "M"], ["Trp", "W"], ["Tyr", "Y"], ["His", "H"], ["Phe", "F"], ["Ser", "S"], ["Thr", "T"], ["Asn", "N"], ["Gln", "Q"], ["Asp", "D"], ["Glu", "E"], ["Arg", "R"], ["Lys", "K"], ["Gly", "G"]];
  function rxSite(rec, seq) {
    const r = rec.residuesRaw || (rec.residues || []).join(",");
    const codes = []; RX_SITE_MAP.forEach(([full, ch]) => { if (r.includes(full)) codes.push(ch); });
    const generic = /N末端|N端|C末端|C端|氨基|羟基|亲核|磷酸|叠氮|酮基|Nva|Orn|Gly-X/.test(r);
    if (!codes.length) return generic ? { ok: true, note: "端基/通用位点" } : { ok: true, note: "通用" };
    const present = codes.filter((c) => seq.includes(c));
    return present.length ? { ok: true, note: "✓ 含 " + present.join("/") } : { ok: false, note: "✗ 无 " + codes.join("/") };
  }
  const scPreset = () => (IMP.SC_PRESETS || []).find((x) => x.id === (els.impSC && els.impSC.value)) || { id: "none", delta: 0, name: "无" };

  function computeDelta() {
    const { seq, bad } = impParseSeq(els.impSeq ? els.impSeq.value : "");
    const hasSeq = seq.length > 0;
    const opts = { nterm: els.impNterm?.value || "free", cterm: els.impCterm?.value || "free", ss: els.impSS?.value || "0", cam: els.impCam?.value || "no" };
    const sc = scPreset();
    let mainMass = null, formula = null;
    if (hasSeq) { const mm = impMain(seq, opts); mainMass = mm.mass + sc.delta; formula = mm.formula; }
    let delta = NaN, from = "";
    if (dMode === "mz") {
      const mz = readNum(els.mzInput, NaN), z = Math.max(1, Math.round(readNum(els.zInput, 1)));
      if (Number.isFinite(mz) && hasSeq) { const neutral = mz * z - z * IMP.PROTON; delta = neutral - mainMass; from = `m/z ${mz} (z=${z}) → 中性质量 ${neutral.toFixed(4)} Da`; }
      else from = hasSeq ? "" : "need-seq";
    } else {
      delta = readNum(els.deltaInput, NaN);
      if (Number.isFinite(delta) && hasSeq) from = `Δ ${delta >= 0 ? "+" : ""}${delta.toFixed(4)} → 杂质中性质量 ${(mainMass + delta).toFixed(4)} Da`;
    }
    return { seq, bad, hasSeq, opts, sc, mainMass, formula, delta, from };
  }

  // ---- rendering helpers ---------------------------------------------------
  const within = (err, tolDa, mainMass, tolPpm) => Math.abs(err) <= tolDa || (!!mainMass && !!tolPpm && Math.abs(err / mainMass * 1e6) <= tolPpm);
  const errTxt = (e) => `${e >= 0 ? "+" : ""}${e.toFixed(4)}`;
  const ppmTxt = (e, m) => (m ? `${(e / m * 1e6).toFixed(1)} ppm` : "");
  const siteChip = (st) => `<span class="site-chip ${st.ok ? "ok" : "no"}">${st.note}</span>`;
  const emptyRow = (msg) => `<div class="imp-empty">${msg}</div>`;
  const moreNote = (n, cap) => (n > cap ? `<div class="imp-more">另有 ${n - cap} 个候选已折叠</div>` : "");
  function sectionCard(title, badge, body, variant) {
    return `<article class="card result-section"><div class="card-head"><h2 class="sec-title">${title}</h2><span class="badge">${badge}</span></div><div class="${variant === "rich" ? "match-list" : "imp-list"}">${body}</div></article>`;
  }
  function impRow(dTheory, name, sub, err, mainMass, site, color) {
    return `<div class="imp-row" style="--mech:${color || "var(--purple)"}">
      <div class="imp-delta"><span>Δ理论</span><b>${dTheory >= 0 ? "+" : ""}${dTheory.toFixed(4)}</b></div>
      <div class="imp-body"><b>${name}</b>${sub ? `<div class="imp-sub">${sub}</div>` : ""}${site ? `<div class="imp-site-wrap">${siteChip(site)}</div>` : ""}</div>
      <div class="imp-err"><span>误差</span><b>${errTxt(err)}</b>${mainMass ? `<small>${ppmTxt(err, mainMass)}</small>` : ""}</div>
    </div>`;
  }
  function matchCardHTML(r, site) {
    const color = ARCH_COLOR[r.mech] || "var(--pink)";
    const arch = archetypes[r.mech] || {};
    return `<button class="match-card" data-id="${r.id}" style="--mech:${color}" type="button">
      <span class="match-delta"><b>${r.deltaAvg > 0 ? "+" : ""}${r.deltaAvg}</b><span>Da</span></span>
      <span class="match-body">
        <span class="match-name">${r.nameZh}</span>
        <span class="match-sub">${r.nameEn}</span>
        <span class="match-meta"><span class="mech-chip"><span class="mdot"></span>${arch.zh || r.mech}</span><span class="match-err">误差 ${fixed2(r.error)} Da</span>${site ? siteChip(site) : ""}</span>
      </span>
      <span class="match-chev">${CHEV}</span></button>`;
  }

  function renderDelta() {
    const st = computeDelta();
    const tolDa = Math.max(0, readNum(els.deltaTol, 0.5));
    const tolPpm = st.hasSeq ? Math.max(0, readNum(els.tolPpm, 20)) : 0;
    const nomTol = Math.max(tolDa, 0.5);
    const maxK = Math.max(1, Math.min(3, Math.round(readNum(els.impMaxK, 2))));

    // main-stats card
    if (els.mainStatsCard) {
      if (st.hasSeq) {
        els.mainStatsCard.hidden = false;
        els.mainFormula.textContent = st.formula || "--";
        const zref = Math.max(1, Math.round(readNum(els.zInput, 2)));
        els.mainStats.innerHTML = [
          ["序列长度", `${st.seq.length} aa`],
          ["中性质量 (Mono)", st.mainMass.toFixed(4)],
          [`主成分 m/z (z=${zref})`, ((st.mainMass + zref * IMP.PROTON) / zref).toFixed(4)],
          ...(st.sc.delta ? [["侧链修饰 Δ", `+${st.sc.delta.toFixed(4)}`]] : []),
        ].map(([k, v]) => `<div class="stat-cell"><span>${k}</span><b>${v}</b></div>`).join("");
        els.deltaDerivedLine.innerHTML = st.bad ? `<span class="warn-inline">已忽略非标准字符：${st.bad}（仅支持 20 种天然氨基酸 + U=Aib）</span>` : "";
      } else els.mainStatsCard.hidden = true;
    }

    // m/z derived-delta note
    if (els.derivedDelta) {
      if (dMode === "mz") {
        els.derivedDelta.hidden = false;
        els.derivedDelta.innerHTML = !st.hasSeq
          ? `<b>需填写主成分序列</b>由 m/z 反算 Δ 需要主成分中性质量，请展开下方「主成分序列」。`
          : Number.isFinite(st.delta) ? `实测 Δ = <b>${st.delta >= 0 ? "+" : ""}${st.delta.toFixed(4)} Da</b><small>${st.from}</small>` : `请输入杂质 m/z（带电离子）。`;
      } else els.derivedDelta.hidden = true;
    }

    const delta = st.delta;
    if (!Number.isFinite(delta)) {
      els.deltaCount.textContent = "0 条匹配";
      els.deltaResults.innerHTML = `<article class="card"><div class="empty-state"><div class="es-ic">🔬</div><b>输入分子量差值</b>直接输入 Δmass，或切换「由实测 m/z」并填写主成分序列，自动反算 Δ 并推测杂质。</div></article>`;
      return;
    }

    let total = 0;
    const sections = [];

    // A. 82 side-reaction library (rich cards → animated sheet)
    const rx = sideRecords.map((r) => ({ ...r, error: Math.abs(r.deltaAvg - delta) }))
      .filter((r) => r.error <= nomTol).sort((a, b) => a.error - b.error || a.deltaAvg - b.deltaAvg);
    total += rx.length;
    sections.push(sectionCard("副反应库 · 机理动画", `${sideRecords.length} 条`,
      rx.length ? rx.map((r) => matchCardHTML(r, st.hasSeq ? rxSite(r, st.seq) : null)).join("") : emptyRow(`±${fixed2(nomTol)} Da 内无副反应匹配`), "rich"));

    // B. exact modifications / adducts
    const mods = IMP.MODS.map((m) => ({ ...m, err: delta - m.d })).filter((m) => within(m.err, tolDa, st.mainMass, tolPpm)).sort((a, b) => Math.abs(a.err) - Math.abs(b.err));
    total += mods.length;
    sections.push(sectionCard("精确修饰 / 加合", "单同位素",
      mods.length ? mods.map((m) => impRow(m.d, m.name, m.cat, m.err, st.mainMass, st.hasSeq ? modSite(m, st.seq) : null, "var(--indigo)")).join("") : emptyRow("容差内无已知修饰匹配（可放宽 ± Da / ppm）")));

    // C-F. sequence-derived candidates
    if (st.hasSeq) {
      const cam = st.opts.cam === "yes";
      // deletion
      const pos = [...Array(st.seq.length).keys()]; const del = [];
      for (let k = 1; k <= maxK; k++) for (const c of combos(pos, k)) { const m = c.reduce((s, p) => s + resMassInChain(st.seq[p], cam), 0); const err = delta + m; if (within(err, tolDa, st.mainMass, tolPpm)) del.push({ k, c, d: -m, err }); }
      del.sort((a, b) => Math.abs(a.err) - Math.abs(b.err) || a.k - b.k);
      total += del.length;
      sections.push(sectionCard(`缺失肽 · 跳肽 (少连 1–${maxK})`, `${del.length}`,
        del.length ? del.slice(0, 12).map((x) => { const s = [...x.c].sort((a, b) => a - b); const res = s.map((p) => st.seq[p]).join(""); const label = s.length === 1 ? `第 ${s[0] + 1} 位 ${st.seq[s[0]]} (${IMP.AA[st.seq[s[0]]].name})` : `第 ${s.map((p) => p + 1).join("、")} 位 ${res}`; return impRow(x.d, `缺失 ${res}`, label, x.err, st.mainMass, null, "var(--red)"); }).join("") + moreNote(del.length, 12) : emptyRow("容差内无缺失/截断匹配")));
      // insertion (Δ>0)
      const INS = Object.keys(IMP.AA); const ins = [];
      if (delta > 0) for (let k = 1; k <= maxK; k++) for (const c of combosRep(INS, k)) { const m = c.reduce((s, i) => s + resMassInChain(i, cam), 0); const err = delta - m; if (within(err, tolDa, st.mainMass, tolPpm)) ins.push({ k, c, d: m, err }); }
      ins.sort((a, b) => Math.abs(a.err) - Math.abs(b.err) || a.k - b.k);
      total += ins.length;
      sections.push(sectionCard(`插入肽 · 多连 (1–${maxK})`, `${ins.length}`,
        ins.length ? ins.slice(0, 12).map((x) => { const res = x.c.join("+"); const nm = [...new Set(x.c)].map((r) => IMP.AA[r].name).join("/"); return impRow(x.d, `插入 ${res}`, `${nm} · ${st.seq.length + 1} 个可能位点`, x.err, st.mainMass, null, "var(--green)"); }).join("") + moreNote(ins.length, 12) : emptyRow(delta > 0 ? "容差内无插入肽匹配" : "Δ 为负，插入肽通常 Δ>0，已跳过")));
      // substitution
      const sub = [];
      for (let i = 0; i < st.seq.length; i++) { const cur = st.seq[i]; for (const alt in IMP.AA) { if (alt === cur) continue; const d = IMP.AA[alt].mono - IMP.AA[cur].mono; const err = delta - d; if (within(err, tolDa, st.mainMass, tolPpm)) sub.push({ pos: i + 1, cur, alt, d, err }); } }
      sub.sort((a, b) => Math.abs(a.err) - Math.abs(b.err));
      total += sub.length;
      sections.push(sectionCard("氨基酸错配 · 取代", `${sub.length}`,
        sub.length ? sub.slice(0, 12).map((s) => impRow(s.d, `第 ${s.pos} 位 ${s.cur}→${s.alt}`, `${IMP.AA[s.cur].name} → ${IMP.AA[s.alt].name}`, s.err, st.mainMass, null, "var(--orange)")).join("") + moreNote(sub.length, 12) : emptyRow("容差内无错配匹配")));
      // side-chain des-/over
      if (st.sc.delta) {
        const scHits = [];
        [{ lbl: `缺失侧链 (des-)`, d: -st.sc.delta }, { lbl: `过度修饰 (di-/over-)`, d: st.sc.delta }].forEach((o) => { const err = delta - o.d; if (within(err, tolDa, st.mainMass, tolPpm)) scHits.push({ ...o, err }); });
        total += scHits.length;
        sections.push(sectionCard("侧链修饰相关杂质", st.sc.name,
          scHits.length ? scHits.map((o) => impRow(o.d, o.lbl, st.sc.name, o.err, st.mainMass, null, "var(--teal)")).join("") : emptyRow("容差内无 des-/over- 侧链匹配")));
      }
    }

    els.deltaCount.textContent = `${total} 条匹配`;
    els.deltaResults.innerHTML = sections.join("");
    $$(".match-card", els.deltaResults).forEach((c) => c.addEventListener("click", () => openSheet(c.dataset.id)));
  }

  function setDMode(mode) {
    dMode = mode;
    if (els.deltaMode) $$(".seg", els.deltaMode).forEach((s) => s.classList.toggle("is-active", s.dataset.dmode === mode));
    if (els.paneDelta) els.paneDelta.hidden = mode !== "delta";
    if (els.paneMz) els.paneMz.hidden = mode !== "mz";
    positionSegThumb(els.deltaMode);
    renderDelta();
  }
  function loadSemaDemo() {
    const seq = "HUEGTFTSDVSSYLEGQAAKEFIAWLRGRG";
    els.impSeq.value = seq; els.impNterm.value = "free"; els.impCterm.value = "free"; els.impSS.value = "0"; els.impCam.value = "no";
    els.impSC.value = "sema"; els.impMaxK.value = "2"; if (els.seqPanel) els.seqPanel.open = true;
    const mm = impMain(seq, { nterm: "free", cterm: "free", ss: "0", cam: "no" });
    const main = mm.mass + 832.5041, z = 4;
    els.zInput.value = String(z); els.mzInput.value = ((main - 832.5041 + z * IMP.PROTON) / z).toFixed(4);
    setDMode("mz");
    toast("已载入司美示例（des-脂质化杂质）");
  }

  const ICON = {
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
    beaker: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/><path d="M7 15h10"/></svg>`,
    principle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 00-4 10.5V16a1 1 0 001 1h6a1 1 0 001-1v-2.5A6 6 0 0012 3z"/><path d="M9 20h6M10 22h4"/></svg>`,
    warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z"/></svg>`,
    shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>`,
    book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M19 3v18"/></svg>`,
    flask: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21h12M8 3h8M9 3v7l-4 8a1.5 1.5 0 001.3 2.2h11.4A1.5 1.5 0 0019 18l-4-8V3"/></svg>`,
    tag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.4" fill="currentColor"/></svg>`,
  };

  function openSheet(id) {
    const r = sideRecords.find((x) => x.id === id);
    if (!r) return;
    const color = ARCH_COLOR[r.mech] || "var(--pink)";
    const arch = archetypes[r.mech] || {};
    els.sheet.style.setProperty("--mech", color);

    const refNum = (r.ref || "").replace(/[\[\]]/g, "");
    const principle = `${arch.desc || ""}${r.eq ? "" : ""}`;

    const sec = (icon, title, body) => `<section class="detail-block"><h3 class="sheet-section-title"><span class="st-ic">${icon}</span>${title}</h3>${body}</section>`;

    els.sheetContent.innerHTML = `
      <div class="sheet-head">
        <div class="sheet-delta"><b>${r.deltaAvg > 0 ? "+" : ""}${r.deltaAvg}</b><span>Da · ${r.dir === "dec" ? "减小" : "增大"}</span></div>
        <div class="sheet-titles"><h2>${r.nameZh}</h2><div class="en">${r.nameEn}</div>
          <div class="match-meta" style="margin-top:8px"><span class="mech-chip"><span class="mdot"></span>${arch.zh || r.mech} · ${arch.en || ""}</span></div>
        </div>
        <button class="sheet-close" id="sheetCloseBtn" type="button" aria-label="关闭">${ICON.close}</button>
      </div>
      <div class="sheet-body">
        ${sec(ICON.flask, "机理动画 · Mechanism", `<div class="anim-stage" id="animStage"></div>`)}
        ${r.eq ? sec(ICON.beaker, "反应简式 · Equation", `<div class="eq-box">${r.eq}</div>`) : ""}
        ${sec(ICON.principle, "反应机理 · Principle", `<div class="detail-block"><p>${arch.desc || ""}</p></div>`)}
        ${sec(ICON.beaker, "副产物 · Product", `<div class="info-card">${r.product || "—"}</div>`)}
        ${sec(ICON.warn, "产生条件 / 原因 · Cause", `<div class="info-card cause">${r.cause || "—"}</div>`)}
        ${sec(ICON.shield, "预防措施 · Prevention", `<div class="info-card prevent">${r.prevention || "—"}</div>`)}
        ${sec(ICON.tag, "涉及残基 / 基团 · Residues", `<div class="chips">${r.residues.map((x) => `<span class="chip accent">${x}</span>`).join("")}</div>`)}
        ${sec(ICON.book, "文献来源 · Source", `<a class="src-card" href="${SR_URL}" target="_blank" rel="noopener"><span class="src-ic">${ICON.book}</span><span><b>Side Reactions in Peptide Synthesis</b><br>Yang, Y. · Academic Press (Elsevier), 2016 · Appendix I</span>${refNum ? `<span class="src-ref">Ref ${refNum}</span>` : ""}</a>`)}
      </div>`;

    $("#sheetCloseBtn").addEventListener("click", closeSheet);
    // animation
    const stage = $("#animStage");
    if (stage && window.PeptideMechAnim) window.PeptideMechAnim.render(stage, r, `${arch.zh || r.mech} · ${arch.en || ""}`);

    openSheetEl();
  }

  function openSheetEl() {
    els.sheet.style.transform = "";
    els.sheetScrim.classList.add("is-open");
    els.sheet.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }
  function closeSheet() {
    els.sheet.classList.remove("is-open");
    els.sheetScrim.classList.remove("is-open");
    els.sheet.style.transform = "";
    document.body.style.overflow = "";
  }

  // sheet drag-to-dismiss
  let drag = null;
  function sheetDragStart(e) {
    drag = { startY: e.clientY, dy: 0, t: performance.now(), lastY: e.clientY, v: 0 };
    els.sheet.classList.add("dragging");
    els.sheetGrab.setPointerCapture?.(e.pointerId);
  }
  function sheetDragMove(e) {
    if (!drag) return;
    drag.dy = Math.max(0, e.clientY - drag.startY);
    const now = performance.now();
    drag.v = (e.clientY - drag.lastY) / Math.max(1, now - drag.t) * 1000;
    drag.lastY = e.clientY; drag.t = now;
    els.sheet.style.transform = `translate(-50%, ${drag.dy}px)`;
  }
  function sheetDragEnd() {
    if (!drag) return;
    els.sheet.classList.remove("dragging");
    const dismiss = drag.dy > 130 || drag.v > 650;
    drag = null;
    if (dismiss) closeSheet();
    else els.sheet.style.transform = "";
  }

  // ==========================================================================
  // Kaiser colorimetric engine (carried over, verified working)
  // ==========================================================================
  let kMode = "Standard", kStream = null, kFrame = null;
  let kBlankLab = { L: 92, a: -2, b: 18 }, kCurLab = null, kCurRgb = null;
  let kFrozen = false, kBase = null, kDrag = null;
  const kRoi = { center: 50, top: 18, width: 28, height: 62, sampleTop: 64, sampleHeight: 32 };

  function rgbLin(v) { const n = v / 255; return n > 0.04045 ? ((n + 0.055) / 1.055) ** 2.4 : n / 12.92; }
  function pivot(v) { return v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116; }
  function rgbToLab({ r, g, b }) {
    const R = rgbLin(r), G = rgbLin(g), B = rgbLin(b);
    const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, y = R * 0.2126 + G * 0.7152 + B * 0.0722, z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const fx = pivot(x), fy = pivot(y), fz = pivot(z);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  }
  function deltaE(c, b) { return !c || !b ? null : Math.sqrt((c.L - b.L) ** 2 + (c.a - b.a) ** 2 + (c.b - b.b) ** 2); }
  function colorSignal(mode, lab, rgb = null) {
    if (!lab) return 0;
    if (mode === "Chloranil") { const bl = Math.max(0, -lab.b) * 2.2, gr = rgb ? Math.max(0, rgb.g - rgb.r) * 0.22 : 0, d = Math.max(0, 72 - lab.L) * 0.95; return Math.max(0, Math.min(100, bl + gr + d)); }
    if (mode === "Pro") { const ro = Math.max(0, lab.a - 8) * 1.4 + Math.max(0, lab.b - 12) * 0.7, d = Math.max(0, 70 - lab.L) * 0.45; return Math.max(0, Math.min(100, ro + d)); }
    const bp = Math.max(0, -lab.b) * 2 + Math.max(0, lab.a) * 0.65, d = Math.max(0, 74 - lab.L) * 0.85; return Math.max(0, Math.min(100, bp + d));
  }
  function analyzeColor(mode, c, b, rgb = null) {
    const dist = deltaE(c, b) || 0;
    if (mode === "Standard") {
      if (c.L < 35 && c.b < 0) return { result: "Positive", score: Math.max(colorSignal(mode, c, rgb), Math.min(100, dist * 1.5)) };
      if (c.L >= 35 && c.L < 70 && c.b < 10) return { result: "Weak Positive", score: Math.max(colorSignal(mode, c, rgb), Math.min(100, 40 + (70 - c.L))) };
      return { result: "Negative", score: Math.min(18, Math.max(0, colorSignal(mode, c, rgb), 10 - dist)) };
    }
    if (mode === "Chloranil") {
      const darkGreen = rgb ? rgb.g > rgb.r && c.L < 50 : false, blueGreen = c.b < -5 || darkGreen;
      if (c.L < 40 && c.b < 0) return { result: "Positive", score: Math.max(colorSignal(mode, c, rgb), Math.min(100, dist * 1.8)) };
      if (c.L >= 40 && c.L < 65 && (c.b < 5 || c.a < 0 || blueGreen)) return { result: "Weak Positive", score: Math.max(colorSignal(mode, c, rgb), Math.min(100, 35 + (65 - c.L))) };
      return { result: "Negative", score: Math.min(18, Math.max(0, colorSignal(mode, c, rgb), 10 - dist)) };
    }
    const red = c.a > 15 && c.b > 15;
    if (red && c.L < 50) return { result: "Positive", score: Math.max(colorSignal(mode, c, rgb), Math.min(100, dist * 2)) };
    if (red && c.L >= 50) return { result: "Weak Positive", score: Math.max(colorSignal(mode, c, rgb), 50) };
    return { result: "Negative", score: 0 };
  }
  const labText = (l) => (l ? `L ${fixed2(l.L)} · a ${fixed2(l.a)} · b ${fixed2(l.b)}` : "--");
  const resultLabel = (r) => ({ Positive: "阳性", "Weak Positive": "弱阳性", Negative: "阴性", Invalid: "无效" }[r] || r);
  function guidance(mode, r) {
    if (mode === "Chloranil") { if (r === "Positive") return "警告：二级胺（如 Pro）强阳性，可能脱保护完全或下一步偶联未完成。"; if (r === "Weak Positive") return "提示：可能仍有少量二级胺未完全反应，建议延长偶联时间或用更强缩合体系。"; return "正常：二级胺显色阴性，可结合实际颜色进入下一步反应。"; }
    if (mode === "Pro") { if (r === "Positive") return "警告：脯氨酸二级胺显色较强，建议用四氯苯醌或 LC-MS 复核。"; if (r === "Weak Positive") return "提示：二级胺信号处于临界范围，建议结合四氯苯醌检测确认。"; return "正常：脯氨酸模式未见明显红橙色响应。"; }
    if (r === "Positive") return "警告：一级胺阳性信号强，偶联可能未完成。"; if (r === "Weak Positive") return "提示：一级胺弱阳性，建议重复偶联或延长偶联时间。"; return "正常：一级胺显色阴性。";
  }
  function isGrayBg(lab, rgb = null) {
    if (!lab || !rgb) return false;
    const spread = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b), chroma = Math.sqrt(lab.a ** 2 + lab.b ** 2);
    return lab.L > 24 && lab.L < 88 && chroma < 9 && spread < 20;
  }
  function syncRoi() {
    const roi = els.kaiserRoi; if (!roi) return;
    roi.style.setProperty("--roi-center", `${kRoi.center}%`); roi.style.setProperty("--roi-top", `${kRoi.top}%`);
    roi.style.setProperty("--roi-w", `${kRoi.width}%`); roi.style.setProperty("--roi-h", `${kRoi.height}%`);
    roi.style.setProperty("--sample-top", `${kRoi.sampleTop}%`); roi.style.setProperty("--sample-h", `${kRoi.sampleHeight}%`);
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function getRoi(canvas) {
    const w = Math.round(canvas.width * kRoi.width / 100), h = Math.round(canvas.height * kRoi.height / 100);
    const x = Math.round(canvas.width * kRoi.center / 100 - w / 2), y = Math.round(canvas.height * kRoi.top / 100);
    const sh = Math.round(h * kRoi.sampleHeight / 100), inset = Math.round(w * 0.16);
    const sy = clamp(Math.round(y + h * kRoi.sampleTop / 100), y, y + h - sh);
    const tx = clamp(x, 0, canvas.width - 1), ty = clamp(y, 0, canvas.height - 1), sx = clamp(x + inset, 0, canvas.width - 1), bsy = clamp(sy, 0, canvas.height - 1);
    return { x: sx, y: bsy, width: clamp(w - inset * 2, 1, canvas.width - sx), height: clamp(sh, 1, canvas.height - bsy), tubeX: tx, tubeY: ty, tubeWidth: clamp(w, 1, canvas.width - tx), tubeHeight: clamp(h, 1, canvas.height - ty) };
  }
  function sampleRoi() {
    const canvas = els.kaiserCanvas, ctx = canvas?.getContext?.("2d"); if (!canvas || !ctx) return null;
    const roi = getRoi(canvas), data = ctx.getImageData(roi.x, roi.y, roi.width, roi.height).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 16) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
    return n ? { r: r / n, g: g / n, b: b / n } : null;
  }
  function heatColor(s) { const v = clamp(s, 0, 100); if (v < 25) return [218, 163, 16, 122]; if (v < 50) return [211, 105, 28, 132]; if (v < 72) return [124, 64, 184, 150]; return [22, 80, 230, 170]; }
  function renderHeatmap() {
    const canvas = els.kaiserCanvas, ctx = canvas?.getContext?.("2d");
    if (!canvas || !ctx || !els.kaiserHeatmap?.checked || !kFrozen) return;
    const roi = getRoi(canvas), cols = 26, rows = 48, cw = roi.tubeWidth / cols, ch = roi.tubeHeight / rows;
    ctx.save(); ctx.beginPath();
    ctx.roundRect?.(roi.tubeX, roi.tubeY, roi.tubeWidth, roi.tubeHeight, [0, 0, roi.tubeWidth / 2, roi.tubeWidth / 2]);
    if (!ctx.roundRect) ctx.rect(roi.tubeX, roi.tubeY, roi.tubeWidth, roi.tubeHeight);
    ctx.clip();
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const x = Math.round(roi.tubeX + col * cw), y = Math.round(roi.tubeY + row * ch), px = ctx.getImageData(x, y, 1, 1).data;
      const lab = rgbToLab({ r: px[0], g: px[1], b: px[2] }), [r, g, b, a] = heatColor(colorSignal(kMode, lab, { r: px[0], g: px[1], b: px[2] }));
      ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`; ctx.fillRect(roi.tubeX + col * cw, roi.tubeY + row * ch, Math.ceil(cw), Math.ceil(ch));
    }
    ctx.restore();
  }
  function restoreBase() { const canvas = els.kaiserCanvas, ctx = canvas?.getContext?.("2d"); if (!canvas || !ctx || !kBase) return false; ctx.putImageData(kBase, 0, 0); return true; }
  function heatmapIfNeeded() { if (kFrozen) { restoreBase(); renderHeatmap(); } }
  function updateMetrics() { const rgb = sampleRoi(); if (!rgb) return; kCurRgb = rgb; kCurLab = rgbToLab(rgb); renderKaiser(); }
  function refreshFromFrame() { if (kFrozen) { restoreBase(); updateMetrics(); heatmapIfNeeded(); } else updateMetrics(); }
  function renderKaiser() {
    const dist = deltaE(kCurLab, kBlankLab), invalid = isGrayBg(kCurLab, kCurRgb);
    const det = invalid ? { result: "Invalid", score: 0 } : kCurLab ? analyzeColor(kMode, kCurLab, kBlankLab, kCurRgb) : { result: "Negative", score: 0 };
    if (els.kaiserResultText) els.kaiserResultText.textContent = resultLabel(det.result);
    els.kaiserVerdict?.setAttribute("data-result", det.result);
    if (els.kaiserFill) els.kaiserFill.style.width = `${Math.round(det.score)}%`;
    if (els.kaiserScore) els.kaiserScore.textContent = invalid ? "无效" : `${Math.round(det.score)}%`;
    if (els.kaiserCurLab) els.kaiserCurLab.textContent = labText(kCurLab);
    if (els.kaiserBlankLab) els.kaiserBlankLab.textContent = labText(kBlankLab);
    if (els.kaiserDeltaE) els.kaiserDeltaE.textContent = dist === null ? "--" : fixed2(dist);
    if (els.kaiserGuidance) els.kaiserGuidance.textContent = invalid ? "取样区疑似灰色背景或非试管底部显色区域，本次结果已屏蔽。请将虚线区贴近树脂/溶液底部后重拍。" : guidance(kMode, det.result);
  }
  function drawImage(image) {
    const canvas = els.kaiserCanvas, ctx = canvas?.getContext?.("2d"); if (!canvas || !ctx) return;
    const scale = Math.min(canvas.width / image.width, canvas.height / image.height), w = image.width * scale, h = image.height * scale, x = (canvas.width - w) / 2, y = (canvas.height - h) / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--card-2") || "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, x, y, w, h);
    kBase = ctx.getImageData(0, 0, canvas.width, canvas.height); updateMetrics(); heatmapIfNeeded();
  }
  function autoLocate() {
    const canvas = els.kaiserCanvas, ctx = canvas?.getContext?.("2d"); if (!canvas || !ctx) return;
    if (kFrozen) restoreBase();
    const cs = Math.round(canvas.width * 0.25), ce = Math.round(canvas.width * 0.75), ys = Math.round(canvas.height * 0.18), ye = Math.round(canvas.height * 0.88);
    let bestX = canvas.width * kRoi.center / 100, bestCol = -Infinity;
    for (let x = cs; x <= ce; x += 4) {
      const data = ctx.getImageData(x, ys, 1, ye - ys).data; let s = 0, n = 0;
      for (let i = 0; i < data.length; i += 20) { const r = data[i], g = data[i + 1], b = data[i + 2]; s += Math.max(r, g, b) - Math.min(r, g, b) + Math.max(0, 225 - (r + g + b) / 3) * 0.18; n++; }
      const v = n ? s / n : 0; if (v > bestCol) { bestCol = v; bestX = x; }
    }
    kRoi.center = clamp(bestX / canvas.width * 100, 35, 65); syncRoi();
    const roi = getRoi(canvas), sy = Math.round(roi.tubeY + roi.tubeHeight * 0.45), ey = Math.round(roi.tubeY + roi.tubeHeight * 0.92);
    let bestY = roi.y, best = -Infinity;
    for (let y = sy; y < ey; y += 3) {
      const x = clamp(roi.tubeX + Math.round(roi.tubeWidth * 0.22), 0, canvas.width - 1), w = clamp(Math.round(roi.tubeWidth * 0.56), 1, canvas.width - x);
      const px = ctx.getImageData(x, clamp(y, 0, canvas.height - 1), w, 1).data; let s = 0, n = 0;
      for (let i = 0; i < px.length; i += 16) { const r = px[i], g = px[i + 1], b = px[i + 2]; s += Math.max(r, g, b) - Math.min(r, g, b) + Math.max(0, 210 - (r + g + b) / 3) * 0.45; n++; }
      const v = n ? s / n : 0; if (v > best) { best = v; bestY = y; }
    }
    kRoi.sampleTop = clamp((bestY - roi.tubeY) / roi.tubeHeight * 100 - kRoi.sampleHeight * 0.72, 56, 68); syncRoi(); refreshFromFrame();
  }
  function drawVideoFrame() {
    const v = els.kaiserVideo, canvas = els.kaiserCanvas, ctx = canvas?.getContext?.("2d"); if (!v || !canvas || !ctx) return;
    if (v.readyState >= 2) { ctx.drawImage(v, 0, 0, canvas.width, canvas.height); updateMetrics(); }
    if (!kFrozen) kFrame = requestAnimationFrame(drawVideoFrame);
  }
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia || !els.kaiserVideo) { if (els.kaiserState) els.kaiserState.textContent = "当前环境不支持相机，请导入照片"; return; }
    try {
      kFrozen = false; kBase = null;
      if (kStream) kStream.getTracks().forEach((t) => t.stop());
      kStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      els.kaiserVideo.srcObject = kStream; await els.kaiserVideo.play();
      if (els.kaiserState) els.kaiserState.textContent = "实时 ROI 采样中";
      if (els.btnKaiserStart) els.btnKaiserStart.textContent = "重启相机";
      if (els.btnKaiserCapture) els.btnKaiserCapture.textContent = "拍照分析";
      if (kFrame) cancelAnimationFrame(kFrame); drawVideoFrame();
    } catch (e) { if (els.kaiserState) els.kaiserState.textContent = `${e?.name === "NotAllowedError" ? "相机权限被拒绝" : "相机不可用"}，请导入照片`; }
  }
  function capture() {
    const v = els.kaiserVideo, canvas = els.kaiserCanvas, ctx = canvas?.getContext?.("2d");
    if (!v || !canvas || !ctx || v.readyState < 2) { if (els.kaiserState) els.kaiserState.textContent = "请先开启相机再拍照"; return; }
    if (kFrame) cancelAnimationFrame(kFrame);
    kFrozen = true; ctx.drawImage(v, 0, 0, canvas.width, canvas.height); kBase = ctx.getImageData(0, 0, canvas.width, canvas.height);
    autoLocate(); updateMetrics(); heatmapIfNeeded();
    if (els.kaiserState) els.kaiserState.textContent = "已拍照，ROI 已分析";
    if (els.btnKaiserCapture) els.btnKaiserCapture.textContent = "重新拍照";
  }
  // ROI drag
  function moveRoi(dx, dy) { kRoi.center = clamp(kRoi.center + dx, 25, 75); kRoi.top = clamp(kRoi.top + dy, 6, 34); syncRoi(); refreshFromFrame(); }
  function moveSample(dy) { kRoi.sampleTop = clamp(kRoi.sampleTop + dy, 52, 68); syncRoi(); refreshFromFrame(); }
  function resizeRoi(dx, dy) { kRoi.width = clamp(kRoi.width + dx, 18, 45); kRoi.height = clamp(kRoi.height + dy, 48, 76); kRoi.sampleTop = clamp(kRoi.sampleTop, 52, 68); syncRoi(); refreshFromFrame(); }
  function roiDown(e) {
    const cam = e.currentTarget?.closest?.(".kaiser-stage"); if (!cam) return;
    const mode = e.target === els.kaiserBand ? "sample" : e.target?.classList?.contains("grip") ? "resize" : "move";
    kDrag = { mode, id: e.pointerId, x: e.clientX, y: e.clientY, rect: cam.getBoundingClientRect() };
    e.currentTarget.setPointerCapture?.(e.pointerId); e.preventDefault();
  }
  function roiMove(e) {
    if (!kDrag || kDrag.id !== e.pointerId) return;
    const dx = (e.clientX - kDrag.x) / kDrag.rect.width * 100, dy = (e.clientY - kDrag.y) / kDrag.rect.height * 100;
    kDrag.x = e.clientX; kDrag.y = e.clientY;
    if (kDrag.mode === "sample") moveSample(dy / (kRoi.height / 100)); else if (kDrag.mode === "resize") resizeRoi(dx, dy); else moveRoi(dx, dy);
  }
  function roiUp(e) { if (!kDrag || kDrag.id !== e.pointerId) return; kDrag = null; refreshFromFrame(); }

  // ==========================================================================
  // Events / init
  // ==========================================================================
  function initExamples() {
    els.exampleSelect.innerHTML = builtInExamples.map((ex) => {
      const t = peptideTemplates.find((x) => x.sequence === ex);
      return `<option value="${ex}">${t ? `${t.family} · ${t.name}` : ex}</option>`;
    }).join("");
    els.exampleSelect.value = defaultExample;
  }
  function initDeltaQuick() {
    const commons = [-98, -80, -18, -17, 16, 22, 28, 42, 56, 252];
    els.deltaQuick.innerHTML = commons.map((d) => `<button class="btn sm ghost" type="button" data-d="${d}">${d > 0 ? "+" : ""}${d}</button>`).join("");
    $$("button", els.deltaQuick).forEach((b) => b.addEventListener("click", () => { els.deltaInput.value = b.dataset.d; setDMode("delta"); }));
  }
  function initImpSC() {
    if (!els.impSC) return;
    els.impSC.innerHTML = (IMP.SC_PRESETS || []).map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
    els.impSC.value = "none";
  }

  function bind() {
    els.tabs.forEach((t) => t.addEventListener("click", () => switchModule(t.dataset.module)));
    els.themeBtn?.addEventListener("click", cycleTheme);
    (els.paletteDots || []).forEach((d) => d.addEventListener("click", () => { applyPalette(d.dataset.pal); toast(`配色：${{ default: "默认", pink: "粉色系", purple: "深紫色系" }[d.dataset.pal]}`); }));

    els.seqInput.addEventListener("input", render);
    els.saltType.addEventListener("change", render);
    els.saltEquiv.addEventListener("input", render);
    els.btnCalc.addEventListener("click", render);
    els.btnClear.addEventListener("click", () => { els.seqInput.value = ""; render(); els.seqInput.focus(); });
    els.btnExample.addEventListener("click", () => { els.seqInput.value = els.exampleSelect.value || defaultExample; render(); });
    els.exampleSelect.addEventListener("change", () => { els.seqInput.value = els.exampleSelect.value; render(); });
    els.btnCopy.addEventListener("click", async () => {
      const txt = els.reportText.textContent;
      try { await navigator.clipboard.writeText(txt); } catch { const ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.left = "-9999px"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
      toast("报告已复制");
    });

    els.deltaInput.addEventListener("input", renderDelta);
    els.deltaTol.addEventListener("input", renderDelta);
    els.deltaMode && $$(".seg", els.deltaMode).forEach((s) => s.addEventListener("click", () => setDMode(s.dataset.dmode)));
    [els.mzInput, els.zInput, els.impSeq, els.impNterm, els.impCterm, els.impSS, els.impCam, els.impSC, els.impMaxK, els.tolPpm]
      .forEach((el) => { if (el) el.addEventListener(el.tagName === "SELECT" ? "change" : "input", renderDelta); });
    els.impDemo && els.impDemo.addEventListener("click", loadSemaDemo);

    // sheet
    els.sheetScrim.addEventListener("click", closeSheet);
    els.sheetGrab.addEventListener("pointerdown", sheetDragStart);
    els.sheetGrab.addEventListener("pointermove", sheetDragMove);
    els.sheetGrab.addEventListener("pointerup", sheetDragEnd);
    els.sheetGrab.addEventListener("pointercancel", sheetDragEnd);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

    // kaiser
    els.kaiserSeg && $$(".seg", els.kaiserSeg).forEach((s) => s.addEventListener("click", () => {
      kMode = s.dataset.mode; $$(".seg", els.kaiserSeg).forEach((x) => x.classList.toggle("is-active", x === s)); positionSegThumb(els.kaiserSeg); renderKaiser();
    }));
    els.btnKaiserBlank?.addEventListener("click", () => { if (kCurLab) { kBlankLab = { ...kCurLab }; renderKaiser(); toast("已设为空白参考"); } });
    els.kaiserRoi?.addEventListener("pointerdown", roiDown);
    els.kaiserRoi?.addEventListener("pointermove", roiMove);
    els.kaiserRoi?.addEventListener("pointerup", roiUp);
    els.kaiserRoi?.addEventListener("pointercancel", roiUp);
    els.btnKaiserStart?.addEventListener("click", startCamera);
    els.btnKaiserCapture?.addEventListener("click", () => { if (kFrozen) startCamera(); else capture(); });
    els.kaiserHeatmap?.addEventListener("change", refreshFromFrame);
    els.kaiserPhoto?.addEventListener("change", () => {
      const file = els.kaiserPhoto.files?.[0]; if (!file) return;
      if (kFrame) cancelAnimationFrame(kFrame); if (kStream) kStream.getTracks().forEach((t) => t.stop());
      kFrozen = true; kBase = null;
      const reader = new FileReader();
      reader.addEventListener("load", () => { const img = new Image(); img.addEventListener("load", () => { drawImage(img); autoLocate(); if (els.kaiserState) els.kaiserState.textContent = "照片已导入，ROI 已分析"; }); img.src = reader.result; });
      reader.readAsDataURL(file);
    });

    window.addEventListener("resize", () => positionSegThumb(els.kaiserSeg));
  }

  function init() {
    applyTheme(store.get(THEME_KEY) || "system");
    applyPalette(store.get(PALETTE_KEY) || "default");
    initExamples();
    initDeltaQuick();
    initImpSC();
    bind();
    switchModule("calc");
    syncRoi();
    renderKaiser();
    render();
    els.deltaInput.value = "-18";
    setDMode("delta");
    positionSegThumb(els.kaiserSeg);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
