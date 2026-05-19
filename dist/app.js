const atomMass = {
  C: { avg: 12.011, mono: 12.0 },
  H: { avg: 1.00794, mono: 1.00782503223 },
  F: { avg: 18.998403163, mono: 18.99840316273 },
  Cl: { avg: 35.453, mono: 34.968852682 },
  N: { avg: 14.0067, mono: 14.00307400443 },
  O: { avg: 15.9994, mono: 15.99491461957 },
  S: { avg: 32.065, mono: 31.9720711744 },
};

const residues = {
  Ala: { code: "A", formula: { C: 3, H: 5, N: 1, O: 1 } },
  Arg: { code: "R", formula: { C: 6, H: 12, N: 4, O: 1 } },
  Asn: { code: "N", formula: { C: 4, H: 6, N: 2, O: 2 } },
  Asp: { code: "D", formula: { C: 4, H: 5, N: 1, O: 3 } },
  Cys: { code: "C", formula: { C: 3, H: 5, N: 1, O: 1, S: 1 } },
  Gln: { code: "Q", formula: { C: 5, H: 8, N: 2, O: 2 } },
  Glu: { code: "E", formula: { C: 5, H: 7, N: 1, O: 3 } },
  Gly: { code: "G", formula: { C: 2, H: 3, N: 1, O: 1 } },
  His: { code: "H", formula: { C: 6, H: 7, N: 3, O: 1 } },
  Ile: { code: "I", formula: { C: 6, H: 11, N: 1, O: 1 } },
  Leu: { code: "L", formula: { C: 6, H: 11, N: 1, O: 1 } },
  Lys: { code: "K", formula: { C: 6, H: 12, N: 2, O: 1 } },
  Met: { code: "M", formula: { C: 5, H: 9, N: 1, O: 1, S: 1 } },
  Phe: { code: "F", formula: { C: 9, H: 9, N: 1, O: 1 } },
  Pro: { code: "P", formula: { C: 5, H: 7, N: 1, O: 1 } },
  Ser: { code: "S", formula: { C: 3, H: 5, N: 1, O: 2 } },
  Thr: { code: "T", formula: { C: 4, H: 7, N: 1, O: 2 } },
  Trp: { code: "W", formula: { C: 11, H: 10, N: 2, O: 1 } },
  Tyr: { code: "Y", formula: { C: 9, H: 9, N: 1, O: 2 } },
  Val: { code: "V", formula: { C: 5, H: 9, N: 1, O: 1 } },
};

const codeToResidue = Object.fromEntries(
  Object.entries(residues).map(([name, data]) => [data.code, name]),
);

const groups = {
  Fmoc: { label: "N-Fmoc", formula: { C: 15, H: 11, O: 2 }, labile: "base" },
  Boc: { label: "Boc", formula: { C: 5, H: 8, O: 2 }, labile: "acid" },
  Cbz: { label: "Cbz/Z", formula: { C: 8, H: 7, O: 2 }, labile: "hydrogenolysis" },
  Z: { label: "Cbz/Z", formula: { C: 8, H: 7, O: 2 }, labile: "hydrogenolysis" },
  Trt: { label: "Trt", formula: { C: 19, H: 15 }, labile: "acid" },
  tBu: { label: "tBu", formula: { C: 4, H: 8 }, labile: "acid" },
  OtBu: { label: "OtBu", formula: { C: 4, H: 8 }, labile: "acid" },
  Pbf: { label: "Pbf", formula: { C: 13, H: 17, O: 3, S: 1 }, labile: "acid" },
  Pmc: { label: "Pmc", formula: { C: 12, H: 17, O: 3, S: 1 }, labile: "acid" },
  Mtt: { label: "Mtt", formula: { C: 20, H: 17, O: 1 }, labile: "acid" },
  Alloc: { label: "Alloc", formula: { C: 4, H: 5, O: 2 }, labile: "palladium" },
  Ac: { label: "Ac", formula: { C: 2, H: 2, O: 1 }, labile: "stable" },
};

const terminalGroups = {
  H: { name: "H-", formula: {} },
  OH: { name: "-OH", formula: {} },
  NH2: { name: "-NH2", formula: { H: -1, O: -1, N: 1 } },
  OMe: { name: "-OMe", formula: { C: 1, H: 2 } },
  OEt: { name: "-OEt", formula: { C: 2, H: 4 } },
};

const salts = {
  free: { label: "Free", formula: {} },
  tfa: { label: "TFA", formula: { C: 2, H: 1, F: 3, O: 2 } },
  hcl: { label: "HCl", formula: { H: 1, Cl: 1 } },
  acoh: { label: "AcOH", formula: { C: 2, H: 4, O: 2 } },
};

const water = { H: 2, O: 1 };
const defaultExample = "Fmoc-Arg(Pbf)-Gly-Asp(OtBu)-Lys(Boc)-OH";
const builtInExamples = [
  "Fmoc-Arg(Pbf)-Gly-Asp(OtBu)-Lys(Boc)-OH",
  "H-Arg-Gly-Asp-Phe-Lys-NH2",
  "Ac-Gly-Gly-Phe-OH",
  "Boc-Ala-Val-Leu-Phe-OMe",
  "Fmoc-Lys(Boc)-Gly-Pro-OH",
];
const themeStorageKey = "protected-peptide-theme";
let currentResult = null;

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
  themeSelect: document.querySelector("#themeSelect"),
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
  const order = ["C", "H", "F", "Cl", "N", "O", "S"];
  return order
    .filter((atom) => formula[atom])
    .map((atom) => `${atom}${formula[atom] === 1 ? "" : Number.isInteger(formula[atom]) ? formula[atom] : formula[atom].toFixed(2)}`)
    .join("");
}

function normalizeToken(token) {
  return token.trim().replace(/\s+/g, "");
}

function hasBalancedParentheses(input) {
  let depth = 0;
  for (const char of input) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function parseResidue(token) {
  const match = token.match(/^([A-Za-z]{1,3})(?:\(([^()]*)\))?$/);
  if (!match) return { kind: "invalid", raw: token };
  let name = match[1];
  if (name.length === 1) name = codeToResidue[name.toUpperCase()];
  const properName = Object.keys(residues).find((key) => key.toLowerCase() === String(name).toLowerCase());
  if (!properName) return { kind: "unknownAminoAcid", name: match[1], raw: token };
  const mods = match[2] ? match[2].split(/[,+/]/).map(normalizeToken).filter(Boolean) : [];
  return { kind: "residue", name: properName, code: residues[properName].code, mods, raw: token };
}

function parseSequence(input) {
  const normalizedInput = input.trim();
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

  const tokens = input
    .split("-")
    .map(normalizeToken)
    .filter(Boolean);

  const nTerminal = [];
  const cTerminal = [];
  const aa = [];
  const unknown = [];
  const unknownMods = [];

  tokens.forEach((token, index) => {
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
    const residue = parseResidue(token);
    if (residue.kind === "residue") {
      residue.mods.forEach((mod) => {
        if (!groups[mod]) {
          unknownMods.push(`${residue.name}(${mod})`);
          errors.push(`Unknown protecting group: ${mod}`);
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

function calculate(parsed) {
  const deprotectedFormula = cloneFormula(water);
  const protectedFormula = cloneFormula(water);
  const protectingList = [];

  parsed.aa.forEach((residue, index) => {
    addFormula(deprotectedFormula, residues[residue.name].formula);
    addFormula(protectedFormula, residues[residue.name].formula);
    residue.mods.forEach((mod) => {
      if (groups[mod]) {
        addFormula(protectedFormula, groups[mod].formula);
        protectingList.push({ group: mod, site: `${index + 1}-${residue.name}`, ...groups[mod] });
      }
    });
  });

  parsed.nTerminal.forEach((group) => {
    if (groups[group]) {
      addFormula(protectedFormula, groups[group].formula);
      if (groups[group].labile === "stable") addFormula(deprotectedFormula, groups[group].formula);
      protectingList.push({ group, site: "N-terminus", ...groups[group] });
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

function buildCsv() {
  if (!currentResult) render();
  const result = currentResult;
  const rows = [
    ["Field", "Value"],
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
    ["Protecting groups", result.calc.protectingList.map((item) => `${item.label} @ ${item.site}`).join("; ")],
    ["Risks", result.risks.map((risk) => `[${risk.level}] ${risk.text}`).join("; ")],
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
            ${aa.mods.length ? aa.mods.join(", ") : "无侧链保护"}
          </span>
        </li>
      `,
    )
    .join("");

  els.protectingGroups.innerHTML = calc.protectingList.length
    ? calc.protectingList
        .map((item) => `<span class="tag">${item.label}<small>${item.site}</small></span>`)
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
    ? calc.protectingList.map((item) => `- ${item.label} @ ${item.site} (${item.labile})`).join("\n")
    : "- 无";

  const riskRows = risks.map((risk) => `- [${risk.level}] ${risk.text}`).join("\n");
  currentResult = {
    sequence: els.input.value.trim(),
    parsed,
    calc,
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
    "Protected Peptide Calculator Report",
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
    "Protecting groups:",
    protectionRows,
    "",
    "Potential synthesis risks:",
    riskRows,
    "",
    "Note: masses use residue formula + terminal H2O; protecting groups are modeled as net attached increments.",
  ].join("\n");
}

els.input.addEventListener("input", render);
els.saltType.addEventListener("change", render);
els.saltEquiv.addEventListener("input", render);
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
els.exportCsv.addEventListener("click", () => {
  downloadText("protected-peptide-report.csv", "text/csv;charset=utf-8", buildCsv());
});
els.exportPdf.addEventListener("click", exportPdf);
els.themeSelect.addEventListener("change", () => applyTheme(els.themeSelect.value));

els.exampleSelect.innerHTML = builtInExamples
  .map((example) => `<option value="${example}">${example}</option>`)
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
render();
