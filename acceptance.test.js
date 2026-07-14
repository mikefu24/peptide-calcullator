/* ============================================================================
   acceptance.test.js — 验收 / 回归测试
   运行 Run:  node acceptance.test.js
   验证计算引擎准确性（对照 Expasy/Unimod）与副产物数据库完整性。
   ========================================================================== */
"use strict";

globalThis.PeptideChemistryData = null;
globalThis.PeptideSideReactionData = null;
globalThis.PeptideImpurityData = null;
require("./chemistry-data.js");
require("./side-reactions-data.js");
require("./impurity-data.js");

const C = globalThis.PeptideChemistryData;
const SR = globalThis.PeptideSideReactionData;
const IMP = globalThis.PeptideImpurityData;
const { atomMass, residues, groups, salts, water } = C;

let pass = 0, fail = 0;
const approx = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
function ok(name, cond, extra = "") { if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name} ${extra}`); } }

function fmass(f) {
  let a = 0, m = 0;
  for (const [k, v] of Object.entries(f)) { a += (atomMass[k]?.avg || 0) * v; m += (atomMass[k]?.mono || 0) * v; }
  return { avg: a, mono: m };
}
function peptide(seq) { const f = { ...water }; for (const r of seq) for (const [k, v] of Object.entries(residues[r].formula)) f[k] = (f[k] || 0) + v; return fmass(f); }

console.log("── 1. 残基单同位素质量 (vs Expasy) ─────────────────────────");
const REF = { Gly: 57.02146, Ala: 71.03711, Ser: 87.03203, Pro: 97.05276, Val: 99.06841, Thr: 101.04768, Cys: 103.00919, Leu: 113.08406, Asn: 114.04293, Asp: 115.02694, Gln: 128.05858, Lys: 128.09496, Glu: 129.04259, Met: 131.04049, His: 137.05891, Phe: 147.06841, Arg: 156.10111, Tyr: 163.06333, Trp: 186.07931 };
for (const [r, ref] of Object.entries(REF)) ok(`${r} mono`, approx(fmass(residues[r].formula).mono, ref, 0.001), `got ${fmass(residues[r].formula).mono.toFixed(5)} ref ${ref}`);

console.log("── 2. 已知多肽质量 ──────────────────────────────────────────");
ok("Gly-Gly avg 132.12", approx(peptide(["Gly", "Gly"]).avg, 132.118, 0.01));
ok("Gly-Gly mono 132.0535", approx(peptide(["Gly", "Gly"]).mono, 132.0535, 0.001));
ok("Met-enkephalin YGGFM mono 573.2257", approx(peptide(["Tyr", "Gly", "Gly", "Phe", "Met"]).mono, 573.2257, 0.001));
ok("RGD mono 346.1601", approx(peptide(["Arg", "Gly", "Asp"]).mono, 346.1601, 0.001));

console.log("── 3. 保护基净增量 (avg) ────────────────────────────────────");
const PG = { Fmoc: 222.24, Boc: 100.12, tBu: 56.11, OtBu: 56.11, Pbf: 252.33, Trt: 242.31, Acm: 71.08 };
for (const [g, ref] of Object.entries(PG)) ok(`${g} +${ref}`, approx(fmass(groups[g].formula).avg, ref, 0.05), `got ${fmass(groups[g].formula).avg.toFixed(2)}`);

console.log("── 4. 盐型质量 (avg) ────────────────────────────────────────");
ok("TFA 114.02", approx(fmass(salts.tfa.formula).avg, 114.02, 0.02));
ok("HCl 36.46", approx(fmass(salts.hcl.formula).avg, 36.46, 0.02));
ok("AcOH 60.05", approx(fmass(salts.acoh.formula).avg, 60.05, 0.02));

console.log("── 5. 副产物数据库完整性 ────────────────────────────────────");
ok("record count = 82", SR.records.length === 82, `got ${SR.records.length}`);
ok("count field matches", SR.count === SR.records.length);
const validMech = new Set(Object.keys(SR.archetypes));
let badMech = 0, missingField = 0, badDelta = 0;
for (const r of SR.records) {
  if (!validMech.has(r.mech)) badMech++;
  if (!r.nameZh || !r.nameEn || !Array.isArray(r.residues) || typeof r.deltaAvg !== "number") missingField++;
  if (!Number.isFinite(r.deltaAvg)) badDelta++;
}
ok("all mech in archetype registry", badMech === 0, `bad=${badMech}`);
ok("all records have required fields", missingField === 0, `missing=${missingField}`);
ok("all deltas finite numbers", badDelta === 0);
ok("delta range -98..265", Math.min(...SR.records.map(r => r.deltaAvg)) === -98 && Math.max(...SR.records.map(r => r.deltaAvg)) === 265);
ok("source cites the book", /Side Reactions in Peptide Synthesis/.test(SR.source) && /2016/.test(SR.source));
ok("9 mechanism archetypes", Object.keys(SR.archetypes).length === 9, `got ${Object.keys(SR.archetypes).length}`);

console.log("── 6. Δmass 查询逻辑 ────────────────────────────────────────");
function lookup(q, tol) { return SR.records.filter(r => Math.abs(r.deltaAvg - q) <= tol); }
ok("−18 within ±0.5 → 4 matches", lookup(-18, 0.5).length === 4, `got ${lookup(-18, 0.5).length}`);
ok("+16 within ±0.5 → 4 matches", lookup(16, 0.5).length === 4, `got ${lookup(16, 0.5).length}`);
ok("+252 (Pbf) within ±0.5 → ≥1", lookup(252, 0.5).length >= 1);
ok("+9999 → 0 matches", lookup(9999, 0.5).length === 0);

console.log("── 7. 杂质分析引擎 (impurity-data + m/z) ────────────────────");
// single-letter residue monos match Expasy
ok("单字母 Gly mono", approx(IMP.AA.G.mono, 57.02146, 0.001));
ok("单字母 Trp mono", approx(IMP.AA.W.mono, 186.07931, 0.001));
ok("Aib(U) mono 69.0578", approx(IMP.AA.U.mono, 69.0578, 0.001));
// computeMain (linear, free termini): Σ residue elem − (n-1)H2O
function impMain(seq, opts = {}) {
  const e = { C: 0, H: 0, N: 0, O: 0, S: 0 };
  for (const ch of seq) { const x = IMP.AA[ch].elem; e.C += x.C; e.H += x.H; e.N += x.N; e.O += x.O; if (x.S) e.S += x.S; }
  const n = seq.length; e.H -= 2 * (n - 1); e.O -= (n - 1);
  if (opts.cam) for (const ch of seq) if (ch === "C") { e.C += 2; e.H += 3; e.N += 1; e.O += 1; }
  const A = IMP.ATOM; return e.C * A.C + e.H * A.H + e.N * A.N + e.O * A.O + (e.S || 0) * A.S;
}
ok("computeMain YGGFM mono 573.2257", approx(impMain("YGGFM"), 573.2257, 0.002));
ok("computeMain single Gly = 75.032", approx(impMain("G"), 75.03203, 0.002));
// m/z → neutral: [M+zH]z+, z=2, M=1000 → m/z=501.0073
ok("m/z(z=2,M=1000)=501.0073", approx((1000 + 2 * IMP.PROTON) / 2, 501.0074, 0.001));
// exact modification library present & values
ok("MODS has ≥ 20 entries", IMP.MODS.length >= 20);
ok("氧化 +15.9949 present", IMP.MODS.some((m) => approx(m.d, 15.994915, 0.0005)));
ok("脱酰胺 +0.9840 present", IMP.MODS.some((m) => approx(m.d, 0.984015, 0.0005)));
ok("Na 加合 +21.9819 present", IMP.MODS.some((m) => approx(m.d, 21.981945, 0.0005)));
// side-chain presets
ok("司美侧链 +832.5041", IMP.SC_PRESETS.some((p) => p.id === "sema" && approx(p.delta, 832.5041, 0.001)));
// deletion Δ = −residue mass matches Met loss
ok("Met deletion Δ ≈ -131.0405", approx(-IMP.AA.M.mono, -131.0405, 0.001));

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
