(() => {
const atomMass = {
  C: { avg: 12.011, mono: 12.0 },
  H: { avg: 1.00794, mono: 1.00782503223 },
  F: { avg: 18.998403163, mono: 18.99840316273 },
  Cl: { avg: 35.453, mono: 34.968852682 },
  Br: { avg: 79.904, mono: 78.9183376 },
  N: { avg: 14.0067, mono: 14.00307400443 },
  O: { avg: 15.9994, mono: 15.99491461957 },
  S: { avg: 32.065, mono: 31.9720711744 },
};

const residues = {
  Ala: { code: "A", formula: { C: 3, H: 5, N: 1, O: 1 }, sideChain: "methyl" },
  Arg: { code: "R", formula: { C: 6, H: 12, N: 4, O: 1 }, sideChain: "guanidino", commonProtections: ["Pbf", "Pmc", "Mtr"] },
  Asn: { code: "N", formula: { C: 4, H: 6, N: 2, O: 2 }, sideChain: "amide", commonProtections: ["Trt"] },
  Asp: { code: "D", formula: { C: 4, H: 5, N: 1, O: 3 }, sideChain: "beta-carboxyl", commonProtections: ["OtBu", "OMe", "OBzl", "OAll"] },
  Cys: { code: "C", formula: { C: 3, H: 5, N: 1, O: 1, S: 1 }, sideChain: "thiol", commonProtections: ["Trt", "Acm", "StBu", "tBu"] },
  Gln: { code: "Q", formula: { C: 5, H: 8, N: 2, O: 2 }, sideChain: "amide", commonProtections: ["Trt"] },
  Glu: { code: "E", formula: { C: 5, H: 7, N: 1, O: 3 }, sideChain: "gamma-carboxyl", commonProtections: ["OtBu", "OMe", "OBzl", "OAll"] },
  Gly: { code: "G", formula: { C: 2, H: 3, N: 1, O: 1 }, sideChain: "hydrogen" },
  His: { code: "H", formula: { C: 6, H: 7, N: 3, O: 1 }, sideChain: "imidazole", commonProtections: ["Trt", "Boc", "Dnp"] },
  Ile: { code: "I", formula: { C: 6, H: 11, N: 1, O: 1 }, sideChain: "sec-butyl" },
  Leu: { code: "L", formula: { C: 6, H: 11, N: 1, O: 1 }, sideChain: "isobutyl" },
  Lys: { code: "K", formula: { C: 6, H: 12, N: 2, O: 1 }, sideChain: "epsilon-amino", commonProtections: ["Boc", "Dde", "ivDde", "Fmoc", "Alloc", "Mtt", "Cbz", "Z"] },
  Met: { code: "M", formula: { C: 5, H: 9, N: 1, O: 1, S: 1 }, sideChain: "thioether" },
  Phe: { code: "F", formula: { C: 9, H: 9, N: 1, O: 1 }, sideChain: "benzyl" },
  Pro: { code: "P", formula: { C: 5, H: 7, N: 1, O: 1 }, sideChain: "secondary amine ring" },
  Ser: { code: "S", formula: { C: 3, H: 5, N: 1, O: 2 }, sideChain: "hydroxyl", commonProtections: ["tBu", "Bzl", "Ac"] },
  Thr: { code: "T", formula: { C: 4, H: 7, N: 1, O: 2 }, sideChain: "hydroxyl", commonProtections: ["tBu", "Bzl", "Ac"] },
  Trp: { code: "W", formula: { C: 11, H: 10, N: 2, O: 1 }, sideChain: "indole", commonProtections: ["Boc", "Formyl"] },
  Tyr: { code: "Y", formula: { C: 9, H: 9, N: 1, O: 2 }, sideChain: "phenol", commonProtections: ["tBu", "Bzl", "BrZ"] },
  Val: { code: "V", formula: { C: 5, H: 9, N: 1, O: 1 }, sideChain: "isopropyl" },
  Aib: { code: "Aib", formula: { C: 4, H: 7, N: 1, O: 1 }, sideChain: "alpha,alpha-dimethyl", special: true },
  Pyr: { code: "Pyr", formula: { C: 5, H: 5, N: 1, O: 2 }, sideChain: "pyroglutamyl lactam", special: true },
  pGlu: { code: "Pyr", formula: { C: 5, H: 5, N: 1, O: 2 }, sideChain: "pyroglutamyl lactam", special: true },
  AEEA: { code: "AEEA", formula: { C: 6, H: 11, N: 1, O: 3 }, sideChainFormula: { C: 6, H: 12, N: 1, O: 3 }, sideChain: "PEG-like amino acid linker", special: true },
  OEG: { code: "OEG", formula: { C: 4, H: 7, N: 1, O: 3 }, sideChain: "oligoethylene glycol amino acid linker", special: true },
  Ado: { code: "Ado", formula: { C: 4, H: 7, N: 1, O: 3 }, sideChain: "8-amino-3,6-dioxaoctanoic acid linker alias", special: true },
  gammaGlu: { code: "gGlu", formula: { C: 5, H: 7, N: 1, O: 3 }, sideChain: "gamma-glutamyl linker", special: true },
  gGlu: { code: "gGlu", formula: { C: 5, H: 7, N: 1, O: 3 }, sideChain: "gamma-glutamyl linker", special: true },
  MeLeu: { code: "MeLeu", formula: { C: 7, H: 13, N: 1, O: 1 }, sideChain: "2-methylleucine", special: true },
  SerNH2: { code: "SerNH2", formula: { C: 3, H: 6, N: 2, O: 1 }, sideChain: "C-terminal serinamide motif", special: true },
};

const codeToResidue = Object.fromEntries(
  Object.entries(residues).map(([name, data]) => [data.code, name]),
);

const groups = {
  Fmoc: { label: "Fmoc", formula: { C: 15, H: 10, O: 2 }, labile: "base", class: "N-protecting" },
  Boc: { label: "Boc", formula: { C: 5, H: 8, O: 2 }, labile: "acid", class: "amine protecting" },
  Cbz: { label: "Cbz/Z", formula: { C: 8, H: 6, O: 2 }, labile: "hydrogenolysis", class: "amine protecting" },
  Z: { label: "Cbz/Z", formula: { C: 8, H: 6, O: 2 }, labile: "hydrogenolysis", class: "amine protecting" },
  Trt: { label: "Trt", formula: { C: 19, H: 14 }, labile: "acid", class: "side-chain protecting" },
  tBu: { label: "tBu", formula: { C: 4, H: 8 }, labile: "acid", class: "hydroxyl protecting" },
  OtBu: { label: "OtBu", formula: { C: 4, H: 8 }, labile: "acid", class: "carboxyl protecting" },
  Pbf: { label: "Pbf", formula: { C: 13, H: 16, O: 3, S: 1 }, labile: "acid", class: "guanidino protecting" },
  Pmc: { label: "Pmc", formula: { C: 12, H: 16, O: 3, S: 1 }, labile: "acid", class: "guanidino protecting" },
  Mtr: { label: "Mtr", formula: { C: 10, H: 12, O: 3, S: 1 }, labile: "acid", class: "guanidino protecting" },
  Mtt: { label: "Mtt", formula: { C: 20, H: 16 }, labile: "acid", class: "amine protecting" },
  Dde: { label: "Dde", formula: { C: 10, H: 12, O: 2 }, labile: "hydrazine", class: "orthogonal amine protecting" },
  ivDde: { label: "ivDde", formula: { C: 14, H: 18, O: 2 }, labile: "hydrazine", class: "orthogonal amine protecting" },
  Alloc: { label: "Alloc", formula: { C: 4, H: 4, O: 2 }, labile: "palladium", class: "amine protecting" },
  Ac: { label: "Ac", formula: { C: 2, H: 2, O: 1 }, labile: "stable", class: "acyl modification" },
  Acm: { label: "Acm", formula: { C: 3, H: 5, N: 1, O: 1 }, labile: "iodine/mercury", class: "thiol protecting" },
  StBu: { label: "StBu", formula: { C: 4, H: 8, S: 1 }, labile: "reducing", class: "thiol protecting" },
  Bzl: { label: "Bzl", formula: { C: 7, H: 6 }, labile: "hydrogenolysis/HF", class: "side-chain protecting" },
  OBzl: { label: "OBzl", formula: { C: 7, H: 6 }, labile: "hydrogenolysis/HF", class: "carboxyl protecting" },
  OMe: { label: "OMe", formula: { C: 1, H: 2 }, labile: "saponification", class: "carboxyl ester" },
  OAll: { label: "OAll", formula: { C: 3, H: 4 }, labile: "palladium", class: "carboxyl protecting" },
  BrZ: { label: "BrZ", formula: { C: 8, H: 5, Br: 1, O: 2 }, labile: "acid/HF", class: "phenol protecting" },
  Dnp: { label: "Dnp", formula: { C: 6, H: 2, N: 2, O: 4 }, labile: "thiolysis", class: "imidazole protecting" },
  Formyl: { label: "Formyl", formula: { C: 1, O: 1 }, labile: "base", class: "indole protecting" },
  C18: { label: "C18 diacid residue", formula: { C: 18, H: 32, O: 3 }, labile: "stable", class: "albumin-binding diacid residue" },
  C20: { label: "C20 diacid residue", formula: { C: 20, H: 36, O: 3 }, labile: "stable", class: "albumin-binding diacid residue" },
  C18Diacid: { label: "C18 diacid residue", formula: { C: 18, H: 32, O: 3 }, labile: "stable", class: "albumin-binding diacid residue" },
  C20Diacid: { label: "C20 diacid residue", formula: { C: 20, H: 36, O: 3 }, labile: "stable", class: "albumin-binding diacid residue" },
  Octadecanedioyl: { label: "C18 diacid residue", formula: { C: 18, H: 32, O: 3 }, labile: "stable", class: "albumin-binding diacid residue" },
  Eicosanedioyl: { label: "C20 diacid residue", formula: { C: 20, H: 36, O: 3 }, labile: "stable", class: "albumin-binding diacid residue" },
  "C20-OtBu": { label: "C20-OtBu", formula: { C: 24, H: 44, O: 3 }, deprotectedFormula: { C: 20, H: 36, O: 3 }, labile: "acid", class: "albumin-binding diacid tert-butyl ester" },
  "C18-OtBu": { label: "C18-OtBu", formula: { C: 22, H: 40, O: 3 }, deprotectedFormula: { C: 18, H: 32, O: 3 }, labile: "acid", class: "albumin-binding diacid tert-butyl ester" },
  DOTA: { label: "DOTA", formula: { C: 16, H: 25, N: 4, O: 7 }, labile: "stable", class: "chelator" },
  NOTA: { label: "NOTA", formula: { C: 12, H: 20, N: 4, O: 5 }, labile: "stable", class: "chelator" },
  DTPA: { label: "DTPA", formula: { C: 14, H: 20, N: 3, O: 9 }, labile: "stable", class: "chelator" },
  Hynic: { label: "Hynic", formula: { C: 6, H: 6, N: 3, O: 1 }, labile: "stable", class: "chelator" },
  HYNIC: { label: "Hynic", formula: { C: 6, H: 6, N: 3, O: 1 }, labile: "stable", class: "chelator" },
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
const peptideTemplates = [
  { family: "Protected peptide", name: "Fmoc protected RGD-K", reportUse: "R&D", sequence: "Fmoc-Arg(Pbf)-Gly-Asp(OtBu)-Lys(Boc)-OH" },
  { family: "Unprotected peptide", name: "RGD-FK amide", reportUse: "R&D", sequence: "H-Arg-Gly-Asp-Phe-Lys-NH2" },
  { family: "N-modified peptide", name: "Ac-GGF", reportUse: "Quote", sequence: "Ac-Gly-Gly-Phe-OH" },
  { family: "Protected peptide", name: "Boc AVL-F methyl ester", reportUse: "R&D", sequence: "Boc-Ala-Val-Leu-Phe-OMe" },
  { family: "Difficult sequence", name: "Fmoc Lys-Boc GP", reportUse: "Process", sequence: "Fmoc-Lys(Boc)-Gly-Pro-OH" },
  { family: "Special residue", name: "Aib/Pyr model", reportUse: "R&D", sequence: "Fmoc-Aib-Gly-Pyr-OH" },
  { family: "Linker chemistry", name: "Dde/AEEA/Glu/Tyr model", reportUse: "Process", sequence: "Fmoc-Lys(Dde)-AEEA-Glu(OtBu)-Tyr(tBu)-OH" },
  { family: "GLP-1 analog", name: "Semaglutide-like C18 motif", reportUse: "R&D", sequence: "H-His-Aib-Glu-Gly-Thr-Phe-Thr-Ser-Asp-Val-Ser-Ser-Tyr-Leu-Glu-Gly-Gln-Ala-Ala-Lys(C18Diacid)-Glu-Phe-Ile-Ala-Trp-Leu-Val-Arg-Gly-Arg-Gly-OH" },
  { family: "GIP/GLP-1 analog", name: "Tirzepatide-like C20 motif", reportUse: "R&D", sequence: "H-Tyr-Aib-Glu-Gly-Thr-Phe-Thr-Ser-Asp-Tyr-Ser-Ile-Aib-Leu-Asp-Lys-Ile-Ala-Gln-Lys(C20Diacid)-Ala-Phe-Val-Gln-Trp-Leu-Ile-Ala-Gly-Gly-Pro-Ser-Ser-Gly-Ala-Pro-Pro-Pro-Ser-NH2" },
  { family: "GLP-1/GCG analog", name: "Retatrutide-like C20 motif", reportUse: "R&D", sequence: "H-His-Aib-Gln-Gly-Thr-Phe-Thr-Ser-Asp-Val-Ser-Ser-Tyr-Leu-Glu-Gly-Gln-Ala-Ala-Lys-Glu-Phe-Ile-Ala-Trp-Leu-Val-Lys(C20Diacid)-Gly-Arg-NH2" },
  { family: "Fatty acid linker", name: "Protected C20-OtBu side chain", reportUse: "Process", sequence: "Fmoc-Lys[C20-OtBu-Glu(OtBu)-AEEA-AEEA]-OH" },
  { family: "GIP/GLP-1 analog", name: "Tirzepatide full formula validation", reportUse: "R&D", sequence: "H-Tyr-Aib-Glu-Gly-Thr-Phe-Thr-Ser-Asp-Tyr-Ser-Ile-Aib-Leu-Asp-Lys-Ile-Ala-Gln-{C20-Glu-AEEA-AEEA-Lys}-Ala-Phe-Val-Gln-Trp-Leu-Ile-Ala-Gly-Gly-Pro-Ser-Ser-Gly-Ala-Pro-Pro-Pro-Ser-NH2" },
  { family: "Fatty acid linker", name: "C20-Glu-AEEA protected model", reportUse: "Process", sequence: "Fmoc-Lys[C20-Glu(OtBu)-AEEA]-OH" },
  { family: "Chelator peptide", name: "DOTA-Lys-Gly", reportUse: "Quote", sequence: "DOTA-Lys-Gly-OH" },
];
const builtInExamples = peptideTemplates.map((template) => template.sequence);
const groupSiteTypes = {
  backboneN: new Set(["Fmoc", "Boc", "Cbz", "Z", "Alloc", "Dde", "ivDde", "Ac"]),
  sideChainProtecting: new Set(["Boc", "Trt", "tBu", "OtBu", "Pbf", "Pmc", "Mtr", "Mtt", "Dde", "ivDde", "Alloc", "Acm", "StBu", "Bzl", "OBzl", "OMe", "OAll", "BrZ", "Dnp", "Formyl", "C18", "C20", "C18Diacid", "C20Diacid", "Octadecanedioyl", "Eicosanedioyl"]),
  linker: new Set(["AEEA", "OEG", "Ado", "gammaGlu", "gGlu"]),
  fattyAcid: new Set(["C18", "C20", "C18Diacid", "C20Diacid", "Octadecanedioyl", "Eicosanedioyl", "C18-OtBu", "C20-OtBu"]),
  chelator: new Set(["DOTA", "NOTA", "DTPA", "Hynic", "HYNIC"]),
  salt: new Set(Object.keys(salts)),
};
const sppsReagents = {
  resin: { label: "Resin", unit: "g", defaultPrice: 120 },
  "Fmoc-AA-OH": { label: "Fmoc-AA-OH pool", mw: 350, unit: "g", defaultPrice: 260 },
  DIC: { label: "DIC", mw: 126.2, density: 0.815, unit: "mL", defaultPrice: 0.35 },
  HOBt: { label: "HOBt", mw: 135.13, unit: "g", defaultPrice: 120 },
  Oxyma: { label: "Oxyma Pure", mw: 142.11, unit: "g", defaultPrice: 90 },
  PyBOP: { label: "PyBOP", mw: 520.39, unit: "g", defaultPrice: 320 },
  DIEA: { label: "DIEA", mw: 129.25, density: 0.742, unit: "mL", defaultPrice: 0.28 },
  Piperidine: { label: "20% piperidine/DMF", unit: "mL", defaultPrice: 0.08 },
  DMF: { label: "DMF wash/coupling solvent", unit: "mL", defaultPrice: 0.03 },
  "TFA cocktail": { label: "TFA cleavage cocktail", unit: "mL", defaultPrice: 0.18 },
};
const chemistryLibrary = {
  version: "1.5.0",
  atomMass,
  residues,
  groups,
  terminalGroups,
  salts,
  sppsReagents,
  templates: peptideTemplates,
  categories: {
    residues: ["canonical amino acid", "special amino acid", "linker residue"],
    modifications: ["N-terminal", "C-terminal", "side-chain protecting", "linker", "fatty acid", "chelator", "salt"],
    peptideFamilies: ["GLP-1 analog", "GIP/GLP-1 analog", "GLP-1/GCG analog", "GnRH analog", "somatostatin analog"],
  },
  siteTypes: groupSiteTypes,
};
const reportProfiles = {
  rd: "R&D calculation report",
  quote: "Quotation estimate report",
  process: "Process input report",
};


globalThis.PeptideChemistryData = {
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
  sppsReagents,
};

})();
