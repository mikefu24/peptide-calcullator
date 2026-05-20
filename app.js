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
let kaiserPickMode = "sample";
let kaiserSampleColor = null;
let kaiserBlankColor = null;

const els = {
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
  kaiserCanvas: document.querySelector("#kaiserCanvas"),
  kaiserMode: document.querySelector("#kaiserMode"),
  setKaiserSample: document.querySelector("#setKaiserSample"),
  setKaiserBlank: document.querySelector("#setKaiserBlank"),
  kaiserSampleColor: document.querySelector("#kaiserSampleColor"),
  kaiserBlankColor: document.querySelector("#kaiserBlankColor"),
  kaiserScore: document.querySelector("#kaiserScore"),
};

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
  const sideChain = residues[residue.name].sideChain || "side chain";
  return `${index + 1}-${residue.name} side chain (${sideChain})`;
}

function isCommonResidueProtection(residueName, group) {
  const allowed = residues[residueName].commonProtections || [];
  return allowed.includes(group);
}

function displayProtectingGroup(item) {
  return item.siteType === "backbone N" && item.group === "Fmoc" ? "N-Fmoc" : item.label;
}

function groupSiteCategory(group, siteType) {
  if (siteType === "backbone N") return "N-terminal";
  if (groupSiteTypes.fattyAcid.has(group)) return "fatty acid";
  if (groupSiteTypes.chelator.has(group)) return "chelator";
  if (groupSiteTypes.linker.has(group)) return "linker";
  if (siteType === "side-chain linker") return "linker";
  return "side-chain protecting";
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
  addFormula(protectedFormula, groups[mod].formula);
  addDeprotectedGroupFormula(deprotectedFormula, mod);
  protectingList.push({
    group: mod,
    site: sitePrefix,
    siteType: sitePrefix.includes("linker") ? "side-chain linker" : "side-chain",
    siteCategory: groupSiteCategory(mod, sitePrefix.includes("linker") ? "side-chain linker" : "side-chain"),
    residue: residue.name,
    commonForResidue: isCommonResidueProtection(residue.name, mod),
    ...groups[mod],
  });
}

function addSideChainChainUnit(protectedFormula, deprotectedFormula, protectingList, residue, index, unit, unitIndex, options = {}) {
  const site = `${sideChainSiteLabel(residue, index)} linker ${unitIndex + 1}`;
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
      `${site} ${chainResidue.name} side chain`,
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
      protectingList.push({ group, site: "main-chain N-terminus", siteType: "backbone N", siteCategory: groupSiteCategory(group, "backbone N"), commonForResidue: true, ...groups[group] });
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
      risks.push({ level: "medium", text: `Check protecting group placement: ${item.group} on ${item.residue} side chain is not in the common library.` });
    });
  calc.protectingList
    .filter((item) => item.class?.startsWith("albumin-binding"))
    .forEach((item) => {
      risks.push({ level: "medium", text: `Lipidated long-acting peptide motif detected: ${item.group} at ${item.site}. Confirm linker chain, salt form, and exact supplier building block.` });
    });
  parsed.aa
    .filter((residue) => residues[residue.name].special)
    .forEach((residue) => {
      risks.push({ level: "medium", text: `Special residue detected: ${residue.name}. Confirm coupling method, stereochemistry, and library mass settings.` });
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
  if (els.deltaMatchCount) els.deltaMatchCount.textContent = `${matches.length} hits`;
  if (!els.sideReactionMatches) return { query, tolerance, matches };
  if (!Number.isFinite(query)) {
    els.sideReactionMatches.innerHTML = `<article class="side-reaction-empty">Enter a Δmass value to search the impurity table.</article>`;
    return { query, tolerance, matches };
  }
  if (!matches.length) {
    els.sideReactionMatches.innerHTML = `<article class="side-reaction-empty">No match within ±${fixed2(tolerance)} Da.</article>`;
    return { query, tolerance, matches };
  }
  els.sideReactionMatches.innerHTML = matches
    .map(
      (item) => `
        <article class="side-reaction-card">
          <div>
            <strong>${item.deltaAvg > 0 ? "+" : ""}${item.deltaAvg} Da</strong>
            <span>error ${fixed2(item.error)} Da</span>
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

function blueIndex(color) {
  if (!color) return null;
  return color.b - (color.r + color.g) / 2;
}

function colorToText(color) {
  return color ? `${color.r}, ${color.g}, ${color.b}` : "--";
}

function renderKaiserReadout() {
  const sampleIndex = blueIndex(kaiserSampleColor);
  const blankIndex = blueIndex(kaiserBlankColor);
  const score = sampleIndex === null || blankIndex === null ? null : sampleIndex - blankIndex;
  if (els.kaiserMode) els.kaiserMode.textContent = kaiserPickMode === "sample" ? "Pick sample" : "Pick blank";
  if (els.kaiserSampleColor) els.kaiserSampleColor.textContent = colorToText(kaiserSampleColor);
  if (els.kaiserBlankColor) els.kaiserBlankColor.textContent = colorToText(kaiserBlankColor);
  if (!els.kaiserScore) return;
  if (score === null) {
    els.kaiserScore.textContent = "--";
  } else if (score >= 28) {
    els.kaiserScore.textContent = `${fixed2(score)} Positive`;
  } else if (score >= 12) {
    els.kaiserScore.textContent = `${fixed2(score)} Weak`;
  } else {
    els.kaiserScore.textContent = `${fixed2(score)} Negative`;
  }
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
}

function sampleKaiserPoint(event) {
  const canvas = els.kaiserCanvas;
  const context = canvas?.getContext?.("2d");
  if (!canvas || !context) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.round((event.clientX - rect.left) * (canvas.width / rect.width));
  const y = Math.round((event.clientY - rect.top) * (canvas.height / rect.height));
  const pixel = context.getImageData(x, y, 1, 1).data;
  const color = { r: pixel[0], g: pixel[1], b: pixel[2] };
  if (kaiserPickMode === "blank") {
    kaiserBlankColor = color;
  } else {
    kaiserSampleColor = color;
  }
  renderKaiserReadout();
}

function buildCsv() {
  if (!currentResult) render();
  const result = currentResult;
  const rows = [
    ["Field", "Value"],
    ["Report profile", result.reportProfile],
    ["Template", result.template ? `${result.template.family} | ${result.template.name}` : "Custom sequence"],
    ["Chemistry library version", chemistryLibrary.version],
    ["Sequence", result.sequence],
    ["Protected average MW", fixed(result.calc.protectedMass.avg)],
    ["Protected monoisotopic mass", fixed(result.calc.protectedMass.mono)],
    ["Deprotected average MW", fixed(result.calc.deprotectedMass.avg)],
    ["Deprotected monoisotopic mass", fixed(result.calc.deprotectedMass.mono)],
    ["Salt form", result.saltLabel],
    ["Salt form average MW", fixed(result.saltMass.avg)],
    ["Salt form monoisotopic mass", fixed(result.saltMass.mono)],
    ["Protected formula", result.protectedFormulaText],
    ["Deprotected formula", result.deprotectedFormulaText],
    ["Salt form formula", result.saltFormulaText],
    ["N-terminus", result.nTermText],
    ["C-terminus", result.cTermText],
    ["Modification categories", Object.entries(protectingCategorySummary(result.calc.protectingList)).map(([category, count]) => `${category}: ${count}`).join("; ") || "None"],
    ["Protecting groups", result.calc.protectingList.map((item) => `${item.label} @ ${item.site}`).join("; ")],
    ["Risks", result.risks.map((risk) => `[${risk.level}] ${risk.text}`).join("; ")],
    ["Mass delta query", Number.isFinite(result.delta.query) ? `${fixed2(result.delta.query)} Da ±${fixed2(result.delta.tolerance)}` : ""],
    ["Mass delta matches", result.delta.matches.map((item) => `${item.deltaAvg > 0 ? "+" : ""}${item.deltaAvg} Da ${item.modification}`).join("; ")],
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
        <title>Protected Peptide Calculator Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #111; }
          h1 { font-size: 22px; margin: 0 0 18px; }
          pre { white-space: pre-wrap; font: 12px/1.55 Consolas, monospace; border: 1px solid #ccc; padding: 16px; }
        </style>
      </head>
      <body>
        <h1>Protected Peptide Calculator Report</h1>
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
  const saltLabel = salt.label === "Free" || saltEquiv === 0 ? "Free" : `${saltEquiv} ${salt.label}`;

  els.protectedAvg.textContent = fixed(calc.protectedMass.avg);
  els.protectedMono.textContent = fixed(calc.protectedMass.mono);
  els.deprotectedAvg.textContent = fixed(calc.deprotectedMass.avg);
  els.deprotectedMono.textContent = fixed(calc.deprotectedMass.mono);
  els.protectedFormula.textContent = protectedFormulaText || "--";
  els.deprotectedFormula.textContent = deprotectedFormulaText || "--";
  els.saltFormula.textContent = saltLabel;
  els.saltAvg.textContent = fixed(saltMass.avg);
  els.saltMono.textContent = fixed(saltMass.mono);
  els.residueCount.textContent = `${parsed.aa.length} aa`;
  els.protectingGroupCount.textContent = `${calc.protectingList.length}`;
  els.parseStatus.textContent = parsed.errors.length ? "需校对" : "已解析";
  const nTermText = parsed.nTerminal.length ? parsed.nTerminal.join(", ") : "H";
  const cTermText = parsed.cTerminal.length ? parsed.cTerminal.join(", ") : "Missing";
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
                aa.mods.length ? `side chain: ${aa.mods.join(", ")}` : "",
                aa.sideChainChain.length ? `side-chain chain: ${aa.sideChainChain.join("-")}` : "",
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
  els.riskLevel.textContent = topRisk;

  const protectionRows = calc.protectingList.length
    ? calc.protectingList.map((item) => `- ${displayProtectingGroup(item)} @ ${item.site} (${item.siteCategory}; ${item.class}; ${item.labile})`).join("\n")
    : "- 无";

  const riskRows = risks.map((risk) => `- [${risk.level}] ${risk.text}`).join("\n");
  const deltaRows = delta.matches.length
    ? delta.matches.map((item) => `- ${item.deltaAvg > 0 ? "+" : ""}${item.deltaAvg} Da: ${item.modification} (${item.category})`).join("\n")
    : "- No match";
  const template = selectedTemplate();
  const reportProfile = selectedReportProfile();
  const categoryRows = Object.entries(protectingCategorySummary(calc.protectingList))
    .map(([category, count]) => `- ${category}: ${count}`)
    .join("\n") || "- None";
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
    `Chemistry library version: ${chemistryLibrary.version}`,
    `Template: ${template ? `${template.family} | ${template.name}` : "Custom sequence"}`,
    `Sequence: ${els.input.value.trim()}`,
    `Protected average MW: ${fixed(calc.protectedMass.avg)}`,
    `Protected monoisotopic mass: ${fixed(calc.protectedMass.mono)}`,
    `Deprotected average MW: ${fixed(calc.deprotectedMass.avg)}`,
    `Deprotected monoisotopic mass: ${fixed(calc.deprotectedMass.mono)}`,
    `Salt form average MW: ${fixed(saltMass.avg)} (${els.saltFormula.textContent})`,
    `Salt form monoisotopic mass: ${fixed(saltMass.mono)} (${els.saltFormula.textContent})`,
    `Protected formula: ${protectedFormulaText}`,
    `Deprotected formula: ${deprotectedFormulaText}`,
    `Salt form formula: ${saltFormulaText}`,
    `N-terminus: ${nTermText}`,
    `C-terminus: ${cTermText}`,
    "",
    "Modification categories:",
    categoryRows,
    "",
    "Protecting groups:",
    protectionRows,
    "",
    "Potential synthesis risks:",
    riskRows,
    "",
    "Mass delta lookup:",
    Number.isFinite(delta.query) ? `- Query: ${fixed2(delta.query)} Da; tolerance ±${fixed2(delta.tolerance)} Da` : "- Query: not entered",
    deltaRows,
    "",
    "Note: masses use residue formula + terminal H2O; protecting groups are modeled as net attached increments.",
    `Side reaction note: Δmass matches use average mass deviations from ${sideReactionSource}; treat them as impurity investigation clues, not final structural confirmation.`,
  ].join("\n");
}

els.input.addEventListener("input", render);
els.saltType.addEventListener("change", render);
els.saltEquiv.addEventListener("input", render);
els.reportProfile?.addEventListener("change", render);
els.deltaMassInput?.addEventListener("input", render);
els.deltaTolerance?.addEventListener("input", render);
els.setKaiserSample?.addEventListener("click", () => {
  kaiserPickMode = "sample";
  renderKaiserReadout();
});
els.setKaiserBlank?.addEventListener("click", () => {
  kaiserPickMode = "blank";
  renderKaiserReadout();
});
els.kaiserCanvas?.addEventListener("click", sampleKaiserPoint);
els.kaiserPhotoInput?.addEventListener("change", () => {
  const file = els.kaiserPhotoInput.files?.[0];
  if (!file || typeof FileReader === "undefined" || typeof Image === "undefined") return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const image = new Image();
    image.addEventListener("load", () => drawKaiserImage(image));
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
renderKaiserReadout();
render();
