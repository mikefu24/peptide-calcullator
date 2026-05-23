const {
  atomMass,
  residues,
  codeToResidue,
  groups,
  terminalGroups,
  salts,
  water,
  defaultExample,
  peptideTemplates,
  builtInExamples,
  groupSiteTypes,
  chemistryLibrary,
  reportProfiles,
} = globalThis.PeptideChemistryData;
const { sideReactionMassDeltas = [], source: sideReactionSource = "" } = globalThis.PeptideSideReactionData || {};

const themeStorageKey = "protected-peptide-theme";
let currentResult = null;
let kaiserDetectionMode = "Standard";
let kaiserStream = null;
let kaiserFrameHandle = null;
let kaiserBlankLab = { L: 92, a: -2, b: 18 };
let kaiserCurrentLab = null;
let kaiserCurrentRgb = null;
let kaiserFrozen = false;
let kaiserBaseImageData = null;
let kaiserRoiDrag = null;
const kaiserRoiSettings = {
  center: 50,
  top: 18,
  width: 28,
  height: 62,
  sampleTop: 64,
  sampleHeight: 32,
};

const els = {
  toolTabs: Array.from(document.querySelectorAll("[data-tool]")),
  toolPanels: Array.from(document.querySelectorAll("[data-tool-panel]")),
  input: document.querySelector("#sequenceInput"),
  protectedAvg: document.querySelector("#protectedAvg"),
  protectedMono: document.querySelector("#protectedMono"),
  deprotectedAvg: document.querySelector("#deprotectedAvg"),
  deprotectedMono: document.querySelector("#deprotectedMono"),
  protectedFormula: document.querySelector("#protectedFormula"),
  deprotectedFormula: document.querySelector("#deprotectedFormula"),
  residueCount: document.querySelector("#residueCount"),
  protectingGroupCount: document.querySelector("#protectingGroupCount"),
  protectingGroups: document.querySelector("#protectingGroups"),
  terminalSummary: document.querySelector("#terminalSummary"),
  parsedSequence: document.querySelector("#parsedSequence"),
  riskList: document.querySelector("#riskList"),
  riskLevel: document.querySelector("#riskLevel"),
  parseStatus: document.querySelector("#parseStatus"),
  reportText: document.querySelector("#reportText"),
  copyReport: document.querySelector("#copyReport"),
  copyState: document.querySelector("#copyState"),
  saltType: document.querySelector("#saltType"),
  saltEquiv: document.querySelector("#saltEquiv"),
  saltFormula: document.querySelector("#saltFormula"),
  saltAvg: document.querySelector("#saltAvg"),
  saltMono: document.querySelector("#saltMono"),
  calculateButton: document.querySelector("#calculateButton"),
  clearButton: document.querySelector("#clearButton"),
  exportCsv: document.querySelector("#exportCsv"),
  exportPdf: document.querySelector("#exportPdf"),
  loadExample: document.querySelector("#loadExample"),
  exampleSelect: document.querySelector("#exampleSelect"),
  reportProfile: document.querySelector("#reportProfile"),
  themeSelect: document.querySelector("#themeSelect"),
  deltaMassInput: document.querySelector("#deltaMassInput"),
  deltaTolerance: document.querySelector("#deltaTolerance"),
  deltaMatchCount: document.querySelector("#deltaMatchCount"),
  sideReactionMatches: document.querySelector("#sideReactionMatches"),
  kaiserPhotoInput: document.querySelector("#kaiserPhotoInput"),
  kaiserVideo: document.querySelector("#kaiserVideo"),
  kaiserCanvas: document.querySelector("#kaiserCanvas"),
  kaiserCameraState: document.querySelector("#kaiserCameraState"),
  kaiserStandardMode: document.querySelector("#kaiserStandardMode"),
  kaiserProMode: document.querySelector("#kaiserProMode"),
  kaiserChloranilMode: document.querySelector("#kaiserChloranilMode"),
  startKaiserCamera: document.querySelector("#startKaiserCamera"),
  captureKaiserPhoto: document.querySelector("#captureKaiserPhoto"),
  setKaiserBlank: document.querySelector("#setKaiserBlank"),
  kaiserHeatmapToggle: document.querySelector("#kaiserHeatmapToggle"),
  kaiserRoi: document.querySelector("#kaiserRoi"),
  kaiserSampleBand: document.querySelector("#kaiserSampleBand"),
  kaiserStatus: document.querySelector("#kaiserStatus"),
  kaiserProgress: document.querySelector("#kaiserProgress"),
  kaiserCurrentLab: document.querySelector("#kaiserCurrentLab"),
  kaiserBlankLab: document.querySelector("#kaiserBlankLab"),
  kaiserDeltaE: document.querySelector("#kaiserDeltaE"),
  kaiserGuidance: document.querySelector("#kaiserGuidance"),
  kaiserScore: document.querySelector("#kaiserScore"),
};

function setActiveTool(tool) {
  if (window.activatePeptideTool && window.activatePeptideTool !== setActiveTool) {
    window.activatePeptideTool(tool);
    return;
  }
  els.toolTabs.forEach((tab) => {
    const isActive = tab.dataset.tool === tool;
    tab.classList.toggle("is-active", isActive);
    if (tab.setAttribute) tab.setAttribute("aria-pressed", String(isActive));
  });
  els.toolPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.toolPanel === tool);
  });
}

function cloneFormula(formula = {}) {
  return { ...formula };
}

function addFormula(target, source, multiplier = 1) {
  Object.entries(source || {}).forEach(([atom, count]) => {
    target[atom] = (target[atom] || 0) + count * multiplier;
    if (Math.abs(target[atom]) < 1e-9) delete target[atom];
  });
  return target;
}

function formulaMass(formula) {
  return Object.entries(formula).reduce(
    (mass, [atom, count]) => ({
      avg: mass.avg + (atomMass[atom]?.avg || 0) * count,
      mono: mass.mono + (atomMass[atom]?.mono || 0) * count,
    }),
    { avg: 0, mono: 0 },
  );
}

function formulaToText(formula) {
  const order = ["C", "H", "Br", "Cl", "F", "N", "O", "S"];
  return order
    .filter((atom) => formula[atom])
    .map((atom) => `${atom}${formula[atom] === 1 ? "" : Number.isInteger(formula[atom]) ? formula[atom] : formula[atom].toFixed(2)}`)
    .join("");
}

function normalizeToken(token) {
  return token.trim().replace(/[（]/g, "(").replace(/[）]/g, ")").replace(/\s+/g, "");
}

function hasBalancedParentheses(input) {
  let depth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  for (const char of input) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "[") bracketDepth += 1;
    if (char === "]") bracketDepth -= 1;
    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth -= 1;
    if (depth < 0 || bracketDepth < 0 || braceDepth < 0) return false;
  }
  return depth === 0 && bracketDepth === 0 && braceDepth === 0;
}

function splitTopLevel(input, separator = "-") {
  const parts = [];
  let current = "";
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (const char of input) {
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (char === "[") bracketDepth += 1;
    if (char === "]") bracketDepth -= 1;
    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth -= 1;

    if (char === separator && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map(normalizeToken).filter(Boolean);
}

function mergeKnownHyphenatedGroups(parts) {
  const merged = [];
  for (let index = 0; index < parts.length; index += 1) {
    const twoPartGroup = `${parts[index]}-${parts[index + 1]}`;
    if (groups[twoPartGroup]) {
      merged.push(twoPartGroup);
      index += 1;
    } else {
      merged.push(parts[index]);
    }
  }
  return merged;
}

function normalizeCurlySideChainToken(token) {
  const match = token.match(/^\{(.+)\}$/);
  if (!match) return token;
  const parts = mergeKnownHyphenatedGroups(splitTopLevel(match[1]));
  if (parts.length < 2) return token;
  const anchor = parts.at(-1);
  if (parseResidue(anchor).kind !== "residue") return token;
  return `${anchor}[${parts.slice(0, -1).join("-")}]`;
}

function isUnseparatedOneLetterSequence(input) {
  return /^[A-Za-z]+$/.test(input) && input.length > 1 && [...input].every((char) => codeToResidue[char.toUpperCase()]);
}

function parseResidue(token) {
  const match = token.match(/^([A-Za-z][A-Za-z0-9]{0,9})(?:\(([^()]*)\))?(?:\[([^\]]*)\])?$/);
  if (!match) return { kind: "invalid", raw: token };
  let name = match[1];
  if (name.length === 1) name = codeToResidue[name.toUpperCase()];
  const properName = Object.keys(residues).find((key) => key.toLowerCase() === String(name).toLowerCase());
  if (!properName) return { kind: "unknownAminoAcid", name: match[1], raw: token };
  const mods = match[2] ? match[2].split(/[,+/]/).map(normalizeToken).filter(Boolean) : [];
  const sideChainChain = match[3] ? mergeKnownHyphenatedGroups(splitTopLevel(match[3])) : [];
  return { kind: "residue", name: properName, code: residues[properName].code, mods, sideChainChain, raw: token };
}

function parseSequence(input) {
  const normalizedInput = input.trim().replace(/[（]/g, "(").replace(/[）]/g, ")");
  const errors = [];
  if (!normalizedInput) {
    errors.push("Missing C-terminal group");
    return { tokens: [], nTerminal: [], cTerminal: [], aa: [], unknown: [], unknownMods: [], errors };
  }
  if (!hasBalancedParentheses(normalizedInput)) {
    errors.push("Parentheses not closed");
  }
  if (/[–—_;/|]+/.test(normalizedInput) || /\s+-|-\s+|\s{2,}/.test(normalizedInput) || /[A-Za-z)]\s+[A-Za-z(]/.test(normalizedInput)) {
    errors.push("Invalid sequence separator");
  }

  const inferredOneLetterSequence = isUnseparatedOneLetterSequence(normalizedInput);
  const tokens = inferredOneLetterSequence ? [...normalizedInput].map((char) => char.toUpperCase()) : splitTopLevel(normalizedInput);

  const nTerminal = [];
  const cTerminal = inferredOneLetterSequence ? ["OH"] : [];
  const aa = [];
  const unknown = [];
  const unknownMods = [];

  tokens.forEach((token, index) => {
    const residueToken = normalizeCurlySideChainToken(token);
    if (index === 0 && (groups[token] || token in terminalGroups)) {
      nTerminal.push(token);
      return;
    }
    if (index === tokens.length - 1 && token in terminalGroups) {
      cTerminal.push(token);
      return;
    }
    if (groups[token]) {
      nTerminal.push(token);
      return;
    }
    const residue = parseResidue(residueToken);
    if (residue.kind === "residue") {
      residue.mods.forEach((mod) => {
        if (!groups[mod]) {
          unknownMods.push(`${residue.name}(${mod})`);
          errors.push(`Unknown protecting group: ${mod}`);
        }
      });
      residue.sideChainChain.forEach((part) => {
        const chainPart = parseResidue(part);
        if (!groups[part] && chainPart.kind !== "residue") {
          unknownMods.push(`${residue.name}[${part}]`);
          errors.push(`Unknown protecting group: ${part}`);
        }
      });
      aa.push(residue);
      return;
    }
    if (residue.kind === "unknownAminoAcid") {
      errors.push(`Unknown amino acid: ${residue.name}`);
      unknown.push(token);
      return;
    }
    if (/^[A-Za-z]+$/.test(token) && index !== tokens.length - 1) {
      errors.push(`Unknown amino acid: ${token}`);
    } else {
      errors.push(`Unknown protecting group: ${token}`);
    }
    unknown.push(token);
  });

  if (!cTerminal.length) {
    errors.push("Missing C-terminal group");
  }

  return { tokens, nTerminal, cTerminal, aa, unknown, unknownMods, errors: [...new Set(errors)] };
}

function sideChainSiteLabel(residue, index) {
  const sideChain = residues[residue.name].sideChain || "侧链";
  return `${index + 1}-${residue.name} 侧链 (${sideChain})`;
}

function isCommonResidueProtection(residueName, group) {
  const allowed = residues[residueName].commonProtections || [];
  return allowed.includes(group);
}

function displayProtectingGroup(item) {
  return item.siteType === "backbone N" && item.group === "Fmoc" ? "N-Fmoc" : item.label;
}

function groupSiteCategory(group, siteType) {
  if (siteType === "backbone N") return "N端";
  if (groupSiteTypes.fattyAcid.has(group)) return "脂肪酸修饰";
  if (groupSiteTypes.chelator.has(group)) return "螯合剂";
  if (groupSiteTypes.linker.has(group)) return "连接臂";
  if (siteType === "side-chain linker") return "连接臂";
  return "侧链保护";
}

function addDeprotectedGroupFormula(deprotectedFormula, group) {
  if (!groups[group]) return;
  if (groups[group].deprotectedFormula) {
    addFormula(deprotectedFormula, groups[group].deprotectedFormula);
  } else if (groups[group].labile === "stable") {
    addFormula(deprotectedFormula, groups[group].formula);
  }
}

function addResidueModifier(protectedFormula, deprotectedFormula, protectingList, residue, index, mod, sitePrefix = sideChainSiteLabel(residue, index)) {
  if (!groups[mod]) return;
  const isLinkerSite = sitePrefix.includes("linker") || sitePrefix.includes("连接臂");
  addFormula(protectedFormula, groups[mod].formula);
  addDeprotectedGroupFormula(deprotectedFormula, mod);
  protectingList.push({
    group: mod,
    site: sitePrefix,
    siteType: isLinkerSite ? "side-chain linker" : "side-chain",
    siteCategory: groupSiteCategory(mod, isLinkerSite ? "side-chain linker" : "side-chain"),
    residue: residue.name,
    commonForResidue: isCommonResidueProtection(residue.name, mod),
    ...groups[mod],
  });
}

function addSideChainChainUnit(protectedFormula, deprotectedFormula, protectingList, residue, index, unit, unitIndex, options = {}) {
  const site = `${sideChainSiteLabel(residue, index)} 连接臂 ${unitIndex + 1}`;
  if (groups[unit]) {
    addFormula(protectedFormula, groups[unit].formula);
    addDeprotectedGroupFormula(deprotectedFormula, unit);
    protectingList.push({
      group: unit,
      site,
      siteType: "side-chain linker",
      siteCategory: groupSiteCategory(unit, "side-chain linker"),
      residue: residue.name,
      commonForResidue: true,
      ...groups[unit],
    });
    return;
  }

  const chainResidue = parseResidue(unit);
  if (chainResidue.kind !== "residue") return;
  const chainFormula = options.useSideChainLinkerFormula ? residues[chainResidue.name].sideChainFormula || residues[chainResidue.name].formula : residues[chainResidue.name].formula;
  addFormula(protectedFormula, chainFormula);
  addFormula(deprotectedFormula, chainFormula);
  protectingList.push({
    group: chainResidue.name,
    label: residues[chainResidue.name].code || chainResidue.name,
    site,
    siteType: "side-chain linker",
    siteCategory: groupSiteCategory(chainResidue.name, "side-chain linker"),
    residue: residue.name,
    commonForResidue: true,
    labile: "stable",
    class: residues[chainResidue.name].special ? "special amino acid linker" : "amino acid linker",
  });
  chainResidue.mods.forEach((mod) => {
    addResidueModifier(
      protectedFormula,
      deprotectedFormula,
      protectingList,
      { ...chainResidue, name: chainResidue.name },
      index,
      mod,
      `${site} ${chainResidue.name} 侧链`,
    );
  });
  chainResidue.sideChainChain.forEach((nestedUnit, nestedIndex) => {
    addSideChainChainUnit(protectedFormula, deprotectedFormula, protectingList, chainResidue, index, nestedUnit, nestedIndex, options);
  });
}

function calculate(parsed) {
  const deprotectedFormula = cloneFormula(water);
  const protectedFormula = cloneFormula(water);
  const protectingList = [];

  parsed.aa.forEach((residue, index) => {
    addFormula(deprotectedFormula, residues[residue.name].formula);
    addFormula(protectedFormula, residues[residue.name].formula);
    residue.mods.forEach((mod) => addResidueModifier(protectedFormula, deprotectedFormula, protectingList, residue, index, mod));
    const isProtectedLipidBuildingBlock = residue.sideChainChain.some((unit) => ["C18-OtBu", "C20-OtBu"].includes(unit));
    residue.sideChainChain.forEach((unit, unitIndex) => {
      addSideChainChainUnit(protectedFormula, deprotectedFormula, protectingList, residue, index, unit, unitIndex, {
        useSideChainLinkerFormula: !isProtectedLipidBuildingBlock,
      });
    });
  });

  parsed.nTerminal.forEach((group) => {
    if (groups[group]) {
      addFormula(protectedFormula, groups[group].formula);
      addDeprotectedGroupFormula(deprotectedFormula, group);
      protectingList.push({ group, site: "主链 N 端", siteType: "backbone N", siteCategory: groupSiteCategory(group, "backbone N"), commonForResidue: true, ...groups[group] });
    }
  });

  parsed.cTerminal.forEach((group) => {
    if (terminalGroups[group]) {
      addFormula(protectedFormula, terminalGroups[group].formula);
      addFormula(deprotectedFormula, terminalGroups[group].formula);
    }
  });

  return {
    deprotectedFormula,
    protectedFormula,
    deprotectedMass: formulaMass(deprotectedFormula),
    protectedMass: formulaMass(protectedFormula),
    protectingList,
  };
}

function assessRisks(parsed, calc) {
  const risks = [];
  const sequence = parsed.aa.map((aa) => aa.code).join("");
  const acidic = parsed.aa.filter((aa) => aa.code === "D" || aa.code === "E").length;
  const basic = parsed.aa.filter((aa) => ["R", "K", "H"].includes(aa.code)).length;
  const hydrophobic = parsed.aa.filter((aa) => ["V", "I", "L", "F", "W", "M", "Y"].includes(aa.code)).length;

  if (parsed.errors.length) {
    parsed.errors.forEach((error) => {
      risks.push({ level: "high", text: error });
    });
  }
  calc.protectingList
    .filter((item) => item.siteType === "side-chain" && !item.commonForResidue)
    .forEach((item) => {
      risks.push({ level: "medium", text: `请核对保护基位置：${item.residue} 侧链上的 ${item.group} 不在常见库中。` });
    });
  calc.protectingList
    .filter((item) => item.class?.startsWith("albumin-binding"))
    .forEach((item) => {
      risks.push({ level: "medium", text: `检测到脂肪化长效肽片段：${item.group} @ ${item.site}。建议确认连接臂、盐型和供应商积木结构。` });
    });
  parsed.aa
    .filter((residue) => residues[residue.name].special)
    .forEach((residue) => {
      risks.push({ level: "medium", text: `检测到特殊残基：${residue.name}。建议确认偶联方法、构型和数据库质量设置。` });
    });
  if (sequence.includes("DG") || sequence.includes("DS") || sequence.includes("DT")) {
    risks.push({ level: "medium", text: "Asp-Gly/Asp-Ser/Asp-Thr 片段需关注 aspartimide（天冬酰亚胺）副反应。" });
  }
  if (sequence.includes("P")) {
    risks.push({ level: "medium", text: "含 Pro，Pro 后偶联位点可能导致 Kaiser test 假阴性或显色不敏感，建议结合 chloranil test 或 LC-MS 复核。" });
  }
  if (sequence.includes("C")) {
    risks.push({ level: "medium", text: "含 Cys，需关注氧化、二硫键形成及强酸脱保护条件下的捕获剂配置。" });
  }
  if (sequence.includes("M") || sequence.includes("W")) {
    risks.push({ level: "medium", text: "含 Met/Trp，强酸脱保护和后处理阶段需关注氧化或烷基化副反应。" });
  }
  if (hydrophobic / Math.max(parsed.aa.length, 1) >= 0.45 && parsed.aa.length >= 5) {
    risks.push({ level: "medium", text: "疏水残基比例较高，树脂溶胀、聚集和偶联完成度可能受影响。" });
  }
  if (basic >= 3) {
    risks.push({ level: "medium", text: "碱性残基较多，粗肽纯化和盐型转换时可能出现强保留或拖尾。" });
  }
  if (acidic >= 3) {
    risks.push({ level: "medium", text: "酸性残基较多，需关注侧链保护完整性与后续盐型选择。" });
  }
  if (calc.protectingList.filter((item) => item.labile === "acid").length >= 4) {
    risks.push({ level: "medium", text: "酸敏保护基数量较多，TFA 脱保护体系和清除剂比例建议单独确认。" });
  }
  if (!risks.length) {
    risks.push({ level: "low", text: "未发现明显高频序列风险，仍建议结合树脂、偶联体系和分析方法复核。" });
  }
  return risks;
}

function fixed(value) {
  return Number.isFinite(value) ? value.toFixed(4) : "--";
}

function fixed2(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "--";
}

function applyTheme(theme) {
  const normalized = ["system", "light", "dark"].includes(theme) ? theme : "system";
  if (normalized === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.dataset.theme = normalized;
  }
  els.themeSelect.value = normalized;
  localStorage.setItem(themeStorageKey, normalized);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadText(filename, mimeType, text) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function selectedTemplate(sequence = els.input.value.trim()) {
  return peptideTemplates.find((template) => template.sequence === sequence) || null;
}

function selectedReportProfile() {
  return reportProfiles[els.reportProfile?.value] || reportProfiles.rd;
}

function protectingCategorySummary(protectingList) {
  return protectingList.reduce((summary, item) => {
    const category = item.siteCategory || "other";
    summary[category] = (summary[category] || 0) + 1;
    return summary;
  }, {});
}

function readSignedNumber(element, fallback) {
  if (!element || element.value === "") return fallback;
  const value = Number(element.value);
  return Number.isFinite(value) ? value : fallback;
}

function findDeltaMatches() {
  const query = readSignedNumber(els.deltaMassInput, NaN);
  const tolerance = Math.max(0, readSignedNumber(els.deltaTolerance, 0.5));
  if (!Number.isFinite(query)) return { query, tolerance, matches: [] };
  const matches = sideReactionMassDeltas
    .map((item) => ({ ...item, error: Math.abs(item.deltaAvg - query) }))
    .filter((item) => item.error <= tolerance)
    .sort((a, b) => a.error - b.error || a.deltaAvg - b.deltaAvg || a.modification.localeCompare(b.modification));
  return { query, tolerance, matches };
}

function renderDeltaLookup() {
  const { query, tolerance, matches } = findDeltaMatches();
  if (els.deltaMatchCount) els.deltaMatchCount.textContent = `${matches.length} 条匹配`;
  if (!els.sideReactionMatches) return { query, tolerance, matches };
  if (!Number.isFinite(query)) {
    els.sideReactionMatches.innerHTML = `<article class="side-reaction-empty">请输入 Δmass 数值以查询可能副产物。</article>`;
    return { query, tolerance, matches };
  }
  if (!matches.length) {
    els.sideReactionMatches.innerHTML = `<article class="side-reaction-empty">在 ±${fixed2(tolerance)} Da 范围内未找到匹配项。</article>`;
    return { query, tolerance, matches };
  }
  els.sideReactionMatches.innerHTML = matches
    .map(
      (item) => `
        <article class="side-reaction-card">
          <div>
            <strong>${item.deltaAvg > 0 ? "+" : ""}${item.deltaAvg} Da</strong>
            <span>误差 ${fixed2(item.error)} Da</span>
          </div>
          <h3>${item.modification}</h3>
          <p>${item.category}</p>
          <small>${item.residues.join(", ")} · ${item.source}</small>
        </article>
      `,
    )
    .join("");
  return { query, tolerance, matches };
}

function rgbChannelToLinear(value) {
  const normalized = value / 255;
  return normalized > 0.04045 ? ((normalized + 0.055) / 1.055) ** 2.4 : normalized / 12.92;
}

function xyzPivot(value) {
  return value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
}

function rgbToLab({ r, g, b }) {
  const red = rgbChannelToLinear(r);
  const green = rgbChannelToLinear(g);
  const blue = rgbChannelToLinear(b);
  const x = (red * 0.4124 + green * 0.3576 + blue * 0.1805) / 0.95047;
  const y = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 1;
  const z = (red * 0.0193 + green * 0.1192 + blue * 0.9505) / 1.08883;
  const fx = xyzPivot(x);
  const fy = xyzPivot(y);
  const fz = xyzPivot(z);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function deltaE(current, blank) {
  if (!current || !blank) return null;
  return Math.sqrt((current.L - blank.L) ** 2 + (current.a - blank.a) ** 2 + (current.b - blank.b) ** 2);
}

function colorSignal(mode, lab, rgb = null) {
  if (!lab) return 0;
  if (mode === "Chloranil") {
    const blueSignal = Math.max(0, -lab.b) * 2.2;
    const greenSignal = rgb ? Math.max(0, rgb.g - rgb.r) * 0.22 : 0;
    const darkness = Math.max(0, 72 - lab.L) * 0.95;
    return Math.max(0, Math.min(100, blueSignal + greenSignal + darkness));
  }
  if (mode === "Pro") {
    const redOrange = Math.max(0, lab.a - 8) * 1.4 + Math.max(0, lab.b - 12) * 0.7;
    const darkness = Math.max(0, 70 - lab.L) * 0.45;
    return Math.max(0, Math.min(100, redOrange + darkness));
  }
  const bluePurple = Math.max(0, -lab.b) * 2 + Math.max(0, lab.a) * 0.65;
  const darkness = Math.max(0, 74 - lab.L) * 0.85;
  return Math.max(0, Math.min(100, bluePurple + darkness));
}

function analyzeColor(mode, current, blank, rgb = null) {
  const distance = deltaE(current, blank) || 0;
  if (mode === "Standard") {
    if (current.L < 35 && current.b < 0) {
      return { result: "Positive", score: Math.max(colorSignal(mode, current, rgb), Math.min(100, distance * 1.5)) };
    }
    if (current.L >= 35 && current.L < 70 && current.b < 10) {
      return { result: "Weak Positive", score: Math.max(colorSignal(mode, current, rgb), Math.min(100, 40 + (70 - current.L))) };
    }
    return { result: "Negative", score: Math.min(18, Math.max(0, colorSignal(mode, current, rgb), 10 - distance)) };
  }
  if (mode === "Chloranil") {
    const rgbLooksDarkGreen = rgb ? rgb.g > rgb.r && current.L < 50 : false;
    const isBlueOrDarkGreen = current.b < -5 || rgbLooksDarkGreen;
    if (current.L < 40 && current.b < 0) {
      return { result: "Positive", score: Math.max(colorSignal(mode, current, rgb), Math.min(100, distance * 1.8)) };
    }
    if (current.L >= 40 && current.L < 65 && (current.b < 5 || current.a < 0 || isBlueOrDarkGreen)) {
      return { result: "Weak Positive", score: Math.max(colorSignal(mode, current, rgb), Math.min(100, 35 + (65 - current.L))) };
    }
    return { result: "Negative", score: Math.min(18, Math.max(0, colorSignal(mode, current, rgb), 10 - distance)) };
  }
  const isReddishOrange = current.a > 15 && current.b > 15;
  if (isReddishOrange && current.L < 50) {
    return { result: "Positive", score: Math.max(colorSignal(mode, current, rgb), Math.min(100, distance * 2)) };
  }
  if (isReddishOrange && current.L >= 50) {
    return { result: "Weak Positive", score: Math.max(colorSignal(mode, current, rgb), 50) };
  }
  return { result: "Negative", score: 0 };
}

function labToText(lab) {
  return lab ? `L ${fixed2(lab.L)} / a ${fixed2(lab.a)} / b ${fixed2(lab.b)}` : "--";
}

function toggleActive(element, active) {
  if (element?.classList?.toggle) element.classList.toggle("is-active", active);
}

function getKaiserGuidance(mode, result) {
  if (mode === "Chloranil") {
    if (result === "Positive") {
      return "警告：二级胺（如 Pro）强阳性，可能脱保护完全，或下一步偶联未完成。";
    }
    if (result === "Weak Positive") {
      return "提示：可能仍有少量二级胺未完全反应，建议延长偶联时间或使用更强缩合体系。";
    }
    return "正常：二级胺显色阴性，可结合实际颜色进入下一步反应。";
  }
  if (mode === "Pro") {
    if (result === "Positive") return "警告：脯氨酸二级胺显色较强，建议用四氯苯醌或 LC-MS 复核。";
    if (result === "Weak Positive") return "提示：二级胺信号处于临界范围，建议结合四氯苯醌检测确认。";
    return "正常：脯氨酸模式未见明显红橙色响应。";
  }
  if (result === "Positive") return "警告：一级胺阳性信号强，偶联可能未完成。";
  if (result === "Weak Positive") return "提示：一级胺弱阳性，建议考虑重复偶联或延长偶联时间。";
  return "正常：一级胺显色阴性。";
}

function detectionResultLabel(result) {
  return {
    Positive: "阳性",
    "Weak Positive": "弱阳性",
    Negative: "阴性",
    Invalid: "无效",
  }[result] || result;
}

function isGrayBackgroundSample(lab, rgb = null) {
  if (!lab || !rgb) return false;
  const channelSpread = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
  const chroma = Math.sqrt(lab.a ** 2 + lab.b ** 2);
  return lab.L > 24 && lab.L < 88 && chroma < 9 && channelSpread < 20;
}

function riskLevelLabel(level) {
  return {
    high: "高",
    medium: "中",
    low: "低",
    High: "高",
    Medium: "中",
    Low: "低",
  }[level] || level;
}

function saltDisplayLabel(salt, saltEquiv) {
  return salt.label === "Free" || saltEquiv === 0 ? "游离型" : `${saltEquiv} ${salt.label}`;
}

function renderKaiserReadout() {
  const distance = deltaE(kaiserCurrentLab, kaiserBlankLab);
  const isInvalidSample = isGrayBackgroundSample(kaiserCurrentLab, kaiserCurrentRgb);
  const detection = isInvalidSample
    ? { result: "Invalid", score: 0 }
    : kaiserCurrentLab
      ? analyzeColor(kaiserDetectionMode, kaiserCurrentLab, kaiserBlankLab, kaiserCurrentRgb)
      : { result: "Negative", score: 0 };
  toggleActive(els.kaiserStandardMode, kaiserDetectionMode === "Standard");
  toggleActive(els.kaiserProMode, kaiserDetectionMode === "Pro");
  toggleActive(els.kaiserChloranilMode, kaiserDetectionMode === "Chloranil");
  if (els.kaiserStatus) {
    els.kaiserStatus.textContent = detectionResultLabel(detection.result);
    els.kaiserStatus.closest?.(".kaiser-status-card")?.setAttribute("data-result", detection.result);
  }
  if (els.kaiserProgress) els.kaiserProgress.style.width = `${Math.round(detection.score)}%`;
  if (els.kaiserScore) els.kaiserScore.textContent = isInvalidSample ? "无效" : `${Math.round(detection.score)}%`;
  if (els.kaiserCurrentLab) els.kaiserCurrentLab.textContent = labToText(kaiserCurrentLab);
  if (els.kaiserBlankLab) els.kaiserBlankLab.textContent = labToText(kaiserBlankLab);
  if (els.kaiserDeltaE) els.kaiserDeltaE.textContent = distance === null ? "--" : fixed2(distance);
  if (els.kaiserGuidance) {
    els.kaiserGuidance.textContent = isInvalidSample
      ? "取样区疑似灰色背景或非试管底部显色区域，本次结果已屏蔽。请将虚线区贴近树脂/溶液底部后重拍。"
      : getKaiserGuidance(kaiserDetectionMode, detection.result);
  }
  return detection;
}

function drawKaiserImage(image) {
  const canvas = els.kaiserCanvas;
  const context = canvas?.getContext?.("2d");
  if (!canvas || !context) return;
  const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--panel-strong") || "#f0f4f5";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, x, y, width, height);
  canvas.dataset.imageX = String(x);
  canvas.dataset.imageY = String(y);
  canvas.dataset.imageWidth = String(width);
  canvas.dataset.imageHeight = String(height);
  kaiserBaseImageData = context.getImageData(0, 0, canvas.width, canvas.height);
  updateKaiserMetricsFromCanvas();
  applyKaiserHeatmapIfNeeded();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function syncKaiserRoiOverlay() {
  const roi = els.kaiserRoi || document.querySelector(".kaiser-roi");
  if (!roi?.style?.setProperty) return;
  roi.style.setProperty("--kaiser-roi-center", `${kaiserRoiSettings.center}%`);
  roi.style.setProperty("--kaiser-roi-top", `${kaiserRoiSettings.top}%`);
  roi.style.setProperty("--kaiser-roi-width", `${kaiserRoiSettings.width}%`);
  roi.style.setProperty("--kaiser-roi-height", `${kaiserRoiSettings.height}%`);
  roi.style.setProperty("--kaiser-sample-top", `${kaiserRoiSettings.sampleTop}%`);
  roi.style.setProperty("--kaiser-sample-height", `${kaiserRoiSettings.sampleHeight}%`);
}

function moveKaiserRoi(deltaXPercent, deltaYPercent) {
  kaiserRoiSettings.center = clamp(kaiserRoiSettings.center + deltaXPercent, 25, 75);
  kaiserRoiSettings.top = clamp(kaiserRoiSettings.top + deltaYPercent, 6, 34);
  syncKaiserRoiOverlay();
  refreshKaiserAnalysisFromCurrentFrame();
}

function moveKaiserSample(deltaYPercent) {
  kaiserRoiSettings.sampleTop = clamp(kaiserRoiSettings.sampleTop + deltaYPercent, 52, 68);
  syncKaiserRoiOverlay();
  refreshKaiserAnalysisFromCurrentFrame();
}

function resizeKaiserRoi(deltaXPercent, deltaYPercent) {
  kaiserRoiSettings.width = clamp(kaiserRoiSettings.width + deltaXPercent, 18, 45);
  kaiserRoiSettings.height = clamp(kaiserRoiSettings.height + deltaYPercent, 48, 76);
  kaiserRoiSettings.sampleTop = clamp(kaiserRoiSettings.sampleTop, 52, 68);
  syncKaiserRoiOverlay();
  refreshKaiserAnalysisFromCurrentFrame();
}

function getKaiserRoi(canvas) {
  const width = Math.round(canvas.width * (kaiserRoiSettings.width / 100));
  const height = Math.round(canvas.height * (kaiserRoiSettings.height / 100));
  const x = Math.round(canvas.width * (kaiserRoiSettings.center / 100) - width / 2);
  const y = Math.round(canvas.height * (kaiserRoiSettings.top / 100));
  const sampleHeight = Math.round(height * (kaiserRoiSettings.sampleHeight / 100));
  const sampleInsetX = Math.round(width * 0.16);
  const sampleY = clamp(
    Math.round(y + height * (kaiserRoiSettings.sampleTop / 100)),
    y,
    y + height - sampleHeight,
  );
  const tubeX = clamp(x, 0, canvas.width - 1);
  const tubeY = clamp(y, 0, canvas.height - 1);
  const sampleX = clamp(x + sampleInsetX, 0, canvas.width - 1);
  const boundedSampleY = clamp(sampleY, 0, canvas.height - 1);
  return {
    x: sampleX,
    y: boundedSampleY,
    width: clamp(width - sampleInsetX * 2, 1, canvas.width - sampleX),
    height: clamp(sampleHeight, 1, canvas.height - boundedSampleY),
    tubeX,
    tubeY,
    tubeWidth: clamp(width, 1, canvas.width - tubeX),
    tubeHeight: clamp(height, 1, canvas.height - tubeY),
  };
}

function sampleKaiserRoi() {
  const canvas = els.kaiserCanvas;
  const context = canvas?.getContext?.("2d");
  if (!canvas || !context) return null;
  const roi = getKaiserRoi(canvas);
  const data = context.getImageData(roi.x, roi.y, roi.width, roi.height).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let index = 0; index < data.length; index += 16) {
    r += data[index];
    g += data[index + 1];
    b += data[index + 2];
    count += 1;
  }
  if (!count) return null;
  return { r: r / count, g: g / count, b: b / count };
}

function heatColor(signal) {
  const value = Math.max(0, Math.min(100, signal));
  if (value < 25) return [218, 163, 16, 122];
  if (value < 50) return [211, 105, 28, 132];
  if (value < 72) return [124, 64, 184, 150];
  return [22, 80, 230, 170];
}

function renderKaiserHeatmapOverlay() {
  const canvas = els.kaiserCanvas;
  const context = canvas?.getContext?.("2d");
  if (!canvas || !context || !els.kaiserHeatmapToggle?.checked) return;
  if (!kaiserFrozen) return;
  const roi = getKaiserRoi(canvas);
  const cols = 26;
  const rows = 48;
  const cellW = roi.tubeWidth / cols;
  const cellH = roi.tubeHeight / rows;
  context.save();
  context.beginPath();
  context.roundRect?.(roi.tubeX, roi.tubeY, roi.tubeWidth, roi.tubeHeight, [0, 0, roi.tubeWidth / 2, roi.tubeWidth / 2]);
  if (!context.roundRect) context.rect(roi.tubeX, roi.tubeY, roi.tubeWidth, roi.tubeHeight);
  context.clip();
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = Math.round(roi.tubeX + col * cellW);
      const y = Math.round(roi.tubeY + row * cellH);
      const pixel = context.getImageData(x, y, 1, 1).data;
      const lab = rgbToLab({ r: pixel[0], g: pixel[1], b: pixel[2] });
      const [r, g, b, alpha] = heatColor(colorSignal(kaiserDetectionMode, lab, { r: pixel[0], g: pixel[1], b: pixel[2] }));
      context.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha / 255})`;
      context.fillRect(roi.tubeX + col * cellW, roi.tubeY + row * cellH, Math.ceil(cellW), Math.ceil(cellH));
    }
  }
  context.restore();
}

function restoreKaiserBaseImage() {
  const canvas = els.kaiserCanvas;
  const context = canvas?.getContext?.("2d");
  if (!canvas || !context || !kaiserBaseImageData) return false;
  context.putImageData(kaiserBaseImageData, 0, 0);
  return true;
}

function applyKaiserHeatmapIfNeeded() {
  if (kaiserFrozen) {
    restoreKaiserBaseImage();
    renderKaiserHeatmapOverlay();
  }
}

function updateKaiserMetricsFromCanvas() {
  const rgb = sampleKaiserRoi();
  if (!rgb) return;
  kaiserCurrentRgb = rgb;
  kaiserCurrentLab = rgbToLab(rgb);
  renderKaiserReadout();
}

function refreshKaiserAnalysisFromCurrentFrame() {
  if (kaiserFrozen) {
    restoreKaiserBaseImage();
    updateKaiserMetricsFromCanvas();
    applyKaiserHeatmapIfNeeded();
    return;
  }
  updateKaiserMetricsFromCanvas();
}

function autoLocateKaiserTubeAndSample() {
  const canvas = els.kaiserCanvas;
  const context = canvas?.getContext?.("2d");
  if (!canvas || !context) return;
  if (kaiserFrozen) restoreKaiserBaseImage();

  const centerStart = Math.round(canvas.width * 0.25);
  const centerEnd = Math.round(canvas.width * 0.75);
  const yStart = Math.round(canvas.height * 0.18);
  const yEnd = Math.round(canvas.height * 0.88);
  let bestX = canvas.width * (kaiserRoiSettings.center / 100);
  let bestColumnScore = -Infinity;
  for (let x = centerStart; x <= centerEnd; x += 4) {
    const data = context.getImageData(x, yStart, 1, yEnd - yStart).data;
    let score = 0;
    let count = 0;
    for (let index = 0; index < data.length; index += 20) {
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      score += Math.max(r, g, b) - Math.min(r, g, b) + Math.max(0, 225 - (r + g + b) / 3) * 0.18;
      count += 1;
    }
    const normalized = count ? score / count : 0;
    if (normalized > bestColumnScore) {
      bestColumnScore = normalized;
      bestX = x;
    }
  }
  kaiserRoiSettings.center = clamp((bestX / canvas.width) * 100, 35, 65);
  syncKaiserRoiOverlay();

  const roi = getKaiserRoi(canvas);
  const startY = Math.round(roi.tubeY + roi.tubeHeight * 0.45);
  const endY = Math.round(roi.tubeY + roi.tubeHeight * 0.92);
  let bestY = roi.y;
  let bestScore = -Infinity;

  for (let y = startY; y < endY; y += 3) {
    const x = clamp(roi.tubeX + Math.round(roi.tubeWidth * 0.22), 0, canvas.width - 1);
    const width = clamp(Math.round(roi.tubeWidth * 0.56), 1, canvas.width - x);
    const pixels = context.getImageData(x, clamp(y, 0, canvas.height - 1), width, 1).data;
    let score = 0;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 16) {
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      score += Math.max(r, g, b) - Math.min(r, g, b) + Math.max(0, 210 - (r + g + b) / 3) * 0.45;
      count += 1;
    }
    const normalized = count ? score / count : 0;
    if (normalized > bestScore) {
      bestScore = normalized;
      bestY = y;
    }
  }

  const sampleTop = ((bestY - roi.tubeY) / roi.tubeHeight) * 100 - kaiserRoiSettings.sampleHeight * 0.72;
  kaiserRoiSettings.sampleTop = clamp(sampleTop, 56, 68);
  syncKaiserRoiOverlay();
  refreshKaiserAnalysisFromCurrentFrame();
}

function showKaiserResult() {
  renderKaiserReadout();
}

function startKaiserRoiDrag(event) {
  const camera = event.currentTarget?.closest?.(".kaiser-camera");
  if (!camera) return;
  const mode = event.target === els.kaiserSampleBand ? "sample" : event.target?.tagName === "I" ? "resize" : "move";
  const bounds = camera.getBoundingClientRect();
  kaiserRoiDrag = {
    mode,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    bounds,
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function updateKaiserRoiDrag(event) {
  if (!kaiserRoiDrag || kaiserRoiDrag.pointerId !== event.pointerId) return;
  const deltaXPercent = ((event.clientX - kaiserRoiDrag.startX) / kaiserRoiDrag.bounds.width) * 100;
  const deltaYPercent = ((event.clientY - kaiserRoiDrag.startY) / kaiserRoiDrag.bounds.height) * 100;
  kaiserRoiDrag.startX = event.clientX;
  kaiserRoiDrag.startY = event.clientY;
  if (kaiserRoiDrag.mode === "sample") {
    moveKaiserSample(deltaYPercent / (kaiserRoiSettings.height / 100));
  } else if (kaiserRoiDrag.mode === "resize") {
    resizeKaiserRoi(deltaXPercent, deltaYPercent);
  } else {
    moveKaiserRoi(deltaXPercent, deltaYPercent);
  }
}

function endKaiserRoiDrag(event) {
  if (!kaiserRoiDrag || kaiserRoiDrag.pointerId !== event.pointerId) return;
  kaiserRoiDrag = null;
  refreshKaiserAnalysisFromCurrentFrame();
}

function drawKaiserVideoFrame() {
  const video = els.kaiserVideo;
  const canvas = els.kaiserCanvas;
  const context = canvas?.getContext?.("2d");
  if (!video || !canvas || !context) return;
  if (video.readyState >= 2) {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    updateKaiserMetricsFromCanvas();
  }
  if (!kaiserFrozen) kaiserFrameHandle = window.requestAnimationFrame(drawKaiserVideoFrame);
}

async function startKaiserCamera() {
  if (!navigator.mediaDevices?.getUserMedia || !els.kaiserVideo) {
    if (els.kaiserCameraState) els.kaiserCameraState.textContent = "当前环境不支持实时相机，请使用导入照片";
    return;
  }
  try {
    kaiserFrozen = false;
    kaiserBaseImageData = null;
    if (kaiserStream) kaiserStream.getTracks().forEach((track) => track.stop());
    kaiserStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    els.kaiserVideo.srcObject = kaiserStream;
    await els.kaiserVideo.play();
    if (els.kaiserCameraState) els.kaiserCameraState.textContent = "实时试管 ROI 采样中";
    if (els.startKaiserCamera) els.startKaiserCamera.textContent = "重启相机";
    if (els.captureKaiserPhoto) els.captureKaiserPhoto.textContent = "拍照分析";
    if (kaiserFrameHandle) window.cancelAnimationFrame(kaiserFrameHandle);
    drawKaiserVideoFrame();
  } catch (error) {
    const reason = error?.name === "NotAllowedError" ? "相机权限被拒绝" : "相机不可用";
    if (els.kaiserCameraState) els.kaiserCameraState.textContent = `${reason}，请检查权限或导入照片`;
  }
}

function captureKaiserFrame() {
  const video = els.kaiserVideo;
  const canvas = els.kaiserCanvas;
  const context = canvas?.getContext?.("2d");
  if (!video || !canvas || !context || video.readyState < 2) {
    if (els.kaiserCameraState) els.kaiserCameraState.textContent = "请先开启相机再拍照";
    return;
  }
  if (kaiserFrameHandle) window.cancelAnimationFrame(kaiserFrameHandle);
  kaiserFrozen = true;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  kaiserBaseImageData = context.getImageData(0, 0, canvas.width, canvas.height);
  autoLocateKaiserTubeAndSample();
  updateKaiserMetricsFromCanvas();
  applyKaiserHeatmapIfNeeded();
  if (els.kaiserCameraState) els.kaiserCameraState.textContent = "已拍照，试管 ROI 已分析";
  if (els.captureKaiserPhoto) els.captureKaiserPhoto.textContent = "重新拍照";
  showKaiserResult();
}

function buildCsv() {
  if (!currentResult) render();
  const result = currentResult;
  const rows = [
    ["字段", "数值"],
    ["报告类型", result.reportProfile],
    ["模板", result.template ? `${result.template.family} | ${result.template.name}` : "自定义序列"],
    ["化学数据库版本", chemistryLibrary.version],
    ["序列", result.sequence],
    ["保护肽平均分子量", fixed(result.calc.protectedMass.avg)],
    ["保护肽单同位素质量", fixed(result.calc.protectedMass.mono)],
    ["脱保护肽平均分子量", fixed(result.calc.deprotectedMass.avg)],
    ["脱保护肽单同位素质量", fixed(result.calc.deprotectedMass.mono)],
    ["盐型", result.saltLabel],
    ["盐型平均分子量", fixed(result.saltMass.avg)],
    ["盐型单同位素质量", fixed(result.saltMass.mono)],
    ["保护态分子式", result.protectedFormulaText],
    ["脱保护态分子式", result.deprotectedFormulaText],
    ["盐型分子式", result.saltFormulaText],
    ["N 端", result.nTermText],
    ["C 端", result.cTermText],
    ["修饰类别", Object.entries(protectingCategorySummary(result.calc.protectingList)).map(([category, count]) => `${category}: ${count}`).join("; ") || "无"],
    ["保护基 / 修饰", result.calc.protectingList.map((item) => `${item.label} @ ${item.site}`).join("; ")],
    ["合成风险", result.risks.map((risk) => `[${riskLevelLabel(risk.level)}] ${risk.text}`).join("; ")],
    ["Δmass 查询", Number.isFinite(result.delta.query) ? `${fixed2(result.delta.query)} Da ±${fixed2(result.delta.tolerance)} Da` : ""],
    ["Δmass 匹配", result.delta.matches.map((item) => `${item.deltaAvg > 0 ? "+" : ""}${item.deltaAvg} Da ${item.modification}`).join("; ")],
  ];
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function exportPdf() {
  const report = els.reportText.textContent;
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) {
    downloadText("protected-peptide-report.txt", "text/plain;charset=utf-8", report);
    return;
  }
  printWindow.document.write(`<!doctype html>
    <html>
      <head>
        <title>保护肽分子量计算报告</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #111; }
          h1 { font-size: 22px; margin: 0 0 18px; }
          pre { white-space: pre-wrap; font: 12px/1.55 Consolas, monospace; border: 1px solid #ccc; padding: 16px; }
        </style>
      </head>
      <body>
        <h1>保护肽分子量计算报告</h1>
        <pre>${report.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</pre>
      </body>
    </html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function render() {
  const parsed = parseSequence(els.input.value);
  const calc = calculate(parsed);
  const salt = salts[els.saltType.value] || salts.free;
  const saltEquiv = Math.max(0, Number(els.saltEquiv.value) || 0);
  const saltFormula = cloneFormula(calc.deprotectedFormula);
  addFormula(saltFormula, salt.formula, saltEquiv);
  const saltMass = formulaMass(saltFormula);
  const risks = assessRisks(parsed, calc);
  const delta = renderDeltaLookup();
  const protectedFormulaText = formulaToText(calc.protectedFormula);
  const deprotectedFormulaText = formulaToText(calc.deprotectedFormula);
  const saltFormulaText =
    salt.label === "Free" || saltEquiv === 0
      ? deprotectedFormulaText
      : `${deprotectedFormulaText}·${saltEquiv}${salt.label}`;
  const saltLabel = saltDisplayLabel(salt, saltEquiv);

  els.protectedAvg.textContent = fixed(calc.protectedMass.avg);
  els.protectedMono.textContent = fixed(calc.protectedMass.mono);
  els.deprotectedAvg.textContent = fixed(calc.deprotectedMass.avg);
  els.deprotectedMono.textContent = fixed(calc.deprotectedMass.mono);
  els.protectedFormula.textContent = protectedFormulaText || "--";
  els.deprotectedFormula.textContent = deprotectedFormulaText || "--";
  els.saltFormula.textContent = saltLabel;
  els.saltAvg.textContent = fixed(saltMass.avg);
  els.saltMono.textContent = fixed(saltMass.mono);
  els.residueCount.textContent = `${parsed.aa.length} 个残基`;
  els.protectingGroupCount.textContent = `${calc.protectingList.length}`;
  els.parseStatus.textContent = parsed.errors.length ? "需校对" : "已解析";
  const nTermText = parsed.nTerminal.length ? parsed.nTerminal.join(", ") : "H";
  const cTermText = parsed.cTerminal.length ? parsed.cTerminal.join(", ") : "缺失";
  els.terminalSummary.innerHTML = `
    <span class="terminal-pill">N端: ${nTermText}</span>
    <span class="terminal-pill">C端: ${cTermText}</span>
  `;

  els.parsedSequence.innerHTML = parsed.aa
    .map(
      (aa, index) => `
        <li>
          <span class="sequence-index">${index + 1}</span>
          <span class="sequence-name">${aa.name} (${aa.code})</span>
          <span class="sequence-mods ${aa.mods.some((mod) => !groups[mod]) ? "error" : ""}">
            ${
              [
                aa.mods.length ? `侧链保护: ${aa.mods.join(", ")}` : "",
                aa.sideChainChain.length ? `侧链连接: ${aa.sideChainChain.join("-")}` : "",
              ]
                .filter(Boolean)
                .join("; ") || "无侧链保护"
            }
          </span>
        </li>
      `,
    )
    .join("");

  els.protectingGroups.innerHTML = calc.protectingList.length
    ? calc.protectingList
        .map((item) => `<span class="tag">${displayProtectingGroup(item)}<small>${item.site}</small></span>`)
        .join("")
    : `<span class="tag">无保护基</span>`;

  els.riskList.innerHTML = risks.map((risk) => `<li class="${risk.level}">${risk.text}</li>`).join("");
  const topRisk = risks.some((risk) => risk.level === "high")
    ? "High"
    : risks.some((risk) => risk.level === "medium")
      ? "Medium"
      : "Low";
  els.riskLevel.textContent = riskLevelLabel(topRisk);

  const protectionRows = calc.protectingList.length
    ? calc.protectingList.map((item) => `- ${displayProtectingGroup(item)} @ ${item.site} (${item.siteCategory}; ${item.class}; ${item.labile})`).join("\n")
    : "- 无";

  const deltaRows = delta.matches.length
    ? delta.matches.map((item) => `- ${item.deltaAvg > 0 ? "+" : ""}${item.deltaAvg} Da: ${item.modification} (${item.category})`).join("\n")
    : "- 无匹配";
  const template = selectedTemplate();
  const reportProfile = selectedReportProfile();
  const categoryRows = Object.entries(protectingCategorySummary(calc.protectingList))
    .map(([category, count]) => `- ${category}: ${count}`)
    .join("\n") || "- 无";
  currentResult = {
    sequence: els.input.value.trim(),
    template,
    reportProfile,
    parsed,
    calc,
    delta,
    saltMass,
    risks,
    protectedFormulaText,
    deprotectedFormulaText,
    saltFormulaText,
    saltLabel,
    nTermText,
    cTermText,
  };

  els.reportText.textContent = [
    reportProfile,
    `化学数据库版本: ${chemistryLibrary.version}`,
    `模板: ${template ? `${template.family} | ${template.name}` : "自定义序列"}`,
    `序列: ${els.input.value.trim()}`,
    `保护肽平均分子量: ${fixed(calc.protectedMass.avg)}`,
    `保护肽单同位素质量: ${fixed(calc.protectedMass.mono)}`,
    `脱保护肽平均分子量: ${fixed(calc.deprotectedMass.avg)}`,
    `脱保护肽单同位素质量: ${fixed(calc.deprotectedMass.mono)}`,
    `盐型平均分子量: ${fixed(saltMass.avg)} (${els.saltFormula.textContent})`,
    `盐型单同位素质量: ${fixed(saltMass.mono)} (${els.saltFormula.textContent})`,
    `保护态分子式: ${protectedFormulaText}`,
    `脱保护态分子式: ${deprotectedFormulaText}`,
    `盐型分子式: ${saltFormulaText}`,
    `N端: ${nTermText}`,
    `C端: ${cTermText}`,
    "",
    "修饰类别:",
    categoryRows,
    "",
    "保护基 / 修饰:",
    protectionRows,
    "",
    "潜在合成风险:",
    risks.map((risk) => `- [${riskLevelLabel(risk.level)}] ${risk.text}`).join("\n"),
    "",
    "Δmass 副产物查询:",
    Number.isFinite(delta.query) ? `- 查询值: ${fixed2(delta.query)} Da; 允许误差 ±${fixed2(delta.tolerance)} Da` : "- 查询值: 未输入",
    deltaRows,
    "",
    "说明: 分子量按残基公式 + 末端 H2O 计算；保护基按连接后的净增量建模。",
    `副产物提示: Δmass 匹配使用 ${sideReactionSource} 的平均质量差，仅作为杂质排查线索，不能替代结构确证。`,
  ].join("\n");
}

els.input.addEventListener("input", render);
els.saltType.addEventListener("change", render);
els.saltEquiv.addEventListener("input", render);
els.reportProfile?.addEventListener("change", render);
els.deltaMassInput?.addEventListener("input", render);
els.deltaTolerance?.addEventListener("input", render);
els.toolTabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveTool(tab.dataset.tool || "calculator"));
});
els.kaiserStandardMode?.addEventListener("click", () => {
  kaiserDetectionMode = "Standard";
  renderKaiserReadout();
});
els.kaiserProMode?.addEventListener("click", () => {
  kaiserDetectionMode = "Pro";
  renderKaiserReadout();
});
els.kaiserChloranilMode?.addEventListener("click", () => {
  kaiserDetectionMode = "Chloranil";
  renderKaiserReadout();
});
els.setKaiserBlank?.addEventListener("click", () => {
  if (kaiserCurrentLab) {
    kaiserBlankLab = { ...kaiserCurrentLab };
    renderKaiserReadout();
  }
});
els.kaiserRoi?.addEventListener("pointerdown", startKaiserRoiDrag);
els.kaiserRoi?.addEventListener("pointermove", updateKaiserRoiDrag);
els.kaiserRoi?.addEventListener("pointerup", endKaiserRoiDrag);
els.kaiserRoi?.addEventListener("pointercancel", endKaiserRoiDrag);
els.startKaiserCamera?.addEventListener("click", startKaiserCamera);
els.captureKaiserPhoto?.addEventListener("click", () => {
  if (kaiserFrozen) {
    startKaiserCamera();
  } else {
    captureKaiserFrame();
  }
});
els.kaiserHeatmapToggle?.addEventListener("change", () => {
  refreshKaiserAnalysisFromCurrentFrame();
});
els.kaiserPhotoInput?.addEventListener("change", () => {
  const file = els.kaiserPhotoInput.files?.[0];
  if (!file || typeof FileReader === "undefined" || typeof Image === "undefined") return;
  if (kaiserFrameHandle) window.cancelAnimationFrame(kaiserFrameHandle);
  if (kaiserStream) kaiserStream.getTracks().forEach((track) => track.stop());
  kaiserFrozen = true;
  kaiserBaseImageData = null;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const image = new Image();
    image.addEventListener("load", () => {
      drawKaiserImage(image);
      autoLocateKaiserTubeAndSample();
      if (els.kaiserCameraState) els.kaiserCameraState.textContent = "照片已导入，试管 ROI 已分析";
      showKaiserResult();
    });
    image.src = reader.result;
  });
  reader.readAsDataURL(file);
});
els.calculateButton.addEventListener("click", render);
els.clearButton.addEventListener("click", () => {
  els.input.value = "";
  render();
  els.input.focus();
});
els.loadExample.addEventListener("click", () => {
  els.input.value = els.exampleSelect.value || defaultExample;
  render();
  els.input.focus();
});
els.exportCsv?.addEventListener("click", () => {
  downloadText("protected-peptide-report.csv", "text/csv;charset=utf-8", buildCsv());
});
els.exportPdf?.addEventListener("click", exportPdf);
els.themeSelect.addEventListener("change", () => applyTheme(els.themeSelect.value));

els.exampleSelect.innerHTML = builtInExamples
  .map((example) => {
    const template = selectedTemplate(example);
    const label = template ? `${template.family} | ${template.name}` : example;
    return `<option value="${example}">${label}</option>`;
  })
  .join("");
els.exampleSelect.value = defaultExample;

els.copyReport.addEventListener("click", async () => {
  const report = els.reportText.textContent;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(report);
  } else {
    const textarea = document.createElement("textarea");
    textarea.value = report;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  els.copyState.textContent = "已复制";
  window.setTimeout(() => {
    els.copyState.textContent = "未复制";
  }, 1600);
});

applyTheme(localStorage.getItem(themeStorageKey) || "system");
setActiveTool("calculator");
syncKaiserRoiOverlay();
renderKaiserReadout();
render();
