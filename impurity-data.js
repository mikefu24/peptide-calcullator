/* ============================================================================
   impurity-data.js
   精确质量杂质分析数据：单字母氨基酸质量/组成、常见修饰(单同位素 Δ)、
   侧链修饰预设、物理常数。用于 Δmass 模块的「实测质量 / m/z → 杂质推测」。
   参考自用户提供的「多肽杂质推测器」，质量值对照 Expasy/Unimod。
   ========================================================================== */
(() => {
  "use strict";

  // 单字母氨基酸：单同位素残基质量 + 自由氨基酸元素组成（U = Aib 非天然）
  const AA = {
    G: { name: "Gly", mono: 57.021464, elem: { C: 2, H: 5, N: 1, O: 2 } },
    A: { name: "Ala", mono: 71.037114, elem: { C: 3, H: 7, N: 1, O: 2 } },
    S: { name: "Ser", mono: 87.032029, elem: { C: 3, H: 7, N: 1, O: 3 } },
    P: { name: "Pro", mono: 97.052764, elem: { C: 5, H: 9, N: 1, O: 2 } },
    V: { name: "Val", mono: 99.068414, elem: { C: 5, H: 11, N: 1, O: 2 } },
    T: { name: "Thr", mono: 101.047679, elem: { C: 4, H: 9, N: 1, O: 3 } },
    C: { name: "Cys", mono: 103.009185, elem: { C: 3, H: 7, N: 1, O: 2, S: 1 } },
    L: { name: "Leu", mono: 113.084064, elem: { C: 6, H: 13, N: 1, O: 2 } },
    I: { name: "Ile", mono: 113.084064, elem: { C: 6, H: 13, N: 1, O: 2 } },
    N: { name: "Asn", mono: 114.042928, elem: { C: 4, H: 8, N: 2, O: 3 } },
    D: { name: "Asp", mono: 115.026943, elem: { C: 4, H: 7, N: 1, O: 4 } },
    Q: { name: "Gln", mono: 128.058578, elem: { C: 5, H: 10, N: 2, O: 3 } },
    K: { name: "Lys", mono: 128.094963, elem: { C: 6, H: 14, N: 2, O: 2 } },
    E: { name: "Glu", mono: 129.042593, elem: { C: 5, H: 9, N: 1, O: 4 } },
    M: { name: "Met", mono: 131.040485, elem: { C: 5, H: 11, N: 1, O: 2, S: 1 } },
    H: { name: "His", mono: 137.058912, elem: { C: 6, H: 9, N: 3, O: 2 } },
    F: { name: "Phe", mono: 147.068414, elem: { C: 9, H: 11, N: 1, O: 2 } },
    R: { name: "Arg", mono: 156.101111, elem: { C: 6, H: 14, N: 4, O: 2 } },
    Y: { name: "Tyr", mono: 163.063329, elem: { C: 9, H: 11, N: 1, O: 3 } },
    W: { name: "Trp", mono: 186.079313, elem: { C: 11, H: 12, N: 2, O: 2 } },
    U: { name: "Aib", mono: 69.057849, elem: { C: 4, H: 7, N: 1, O: 1 } },
  };

  const PROTON = 1.007276466;
  const H2O = 18.0105647;
  const ATOM = { C: 12.0, H: 1.00782503207, N: 14.0030740048, O: 15.9949146196, S: 31.9720711744 };

  // 常见修饰 / 加合（单同位素 Δ, Da）; need = 触发位点要求
  const MODS = [
    { name: "氧化 (Met→MetO)", d: 15.994915, cat: "氧化", need: "Met" },
    { name: "蛋氨酸砜 (MetO₂)", d: 31.989829, cat: "氧化", need: "Met" },
    { name: "氧化 (Trp 羟基化)", d: 15.994915, cat: "氧化", need: "Trp" },
    { name: "氧化 (His/Phe/Tyr 羟基化)", d: 15.994915, cat: "氧化", need: "His/Phe/Tyr" },
    { name: "脱酰胺 (Asn→Asp / Gln→Glu)", d: 0.984015, cat: "脱酰胺", need: "Asn/Gln" },
    { name: "脱水 (−H₂O)", d: -18.010565, cat: "水解/脱水", need: "" },
    { name: "水合 (+H₂O)", d: 18.010565, cat: "水解/脱水", need: "" },
    { name: "脱氨 (−NH₃)", d: -17.026549, cat: "脱氨", need: "Asn/Gln" },
    { name: "Na⁺ 加合", d: 21.981945, cat: "加合离子", need: "" },
    { name: "K⁺ 加合", d: 37.955883, cat: "加合离子", need: "" },
    { name: "N端乙酰化 (+COCH₃)", d: 42.010565, cat: "N端修饰", need: "N-term" },
    { name: "N端甲酰化 (+CHO)", d: 27.994915, cat: "N端修饰", need: "N-term" },
    { name: "N端焦谷氨酸化 (Gln/E→pyroGlu, −NH₃)", d: -17.026549, cat: "N端修饰", need: "N-termGlnE" },
    { name: "C端酰胺化", d: -0.984015, cat: "C端修饰", need: "C-term" },
    { name: "二硫键形成 (−2H/键)", d: -2.015650, cat: "二硫键", need: ">=2Cys" },
    { name: "羧甲基化 (Cys, Cam)", d: 57.021464, cat: "半胱氨酸修饰", need: "Cys" },
    { name: "甲基化 (+CH₂)", d: 14.015650, cat: "烷基化", need: "" },
    { name: "二甲基化 (+2CH₂)", d: 28.031300, cat: "烷基化", need: "" },
    { name: "三甲基化 (+3CH₂)", d: 42.047050, cat: "烷基化", need: "" },
    { name: "磷酸化 (+PO₃H)", d: 79.966331, cat: "磷酸化/硫酸化", need: "Ser/Thr/Tyr" },
    { name: "硫酸化 (+SO₃H)", d: 79.956817, cat: "磷酸化/硫酸化", need: "Tyr" },
    { name: "糖基化/葡糖加合 (+C₆H₁₀O₅)", d: 162.052823, cat: "糖基化", need: "" },
  ];

  // 侧链 / 脂质化修饰预设（单同位素 Δ, Da）
  const SC_PRESETS = [
    { id: "none", name: "无", delta: 0, target: "" },
    { id: "palm", name: "棕榈酰化 Lys (C16:0)", delta: 238.2297, target: "Lys ε-NH₂" },
    { id: "stea", name: "硬脂酰化 Lys (C18:0)", delta: 266.2610, target: "Lys ε-NH₂" },
    { id: "myr", name: "肉豆蔻酰化 Lys (C14:0)", delta: 210.1984, target: "Lys ε-NH₂" },
    { id: "oleo", name: "油酰化 Lys (C18:1)", delta: 264.2453, target: "Lys ε-NH₂" },
    { id: "sema", name: "司美格鲁肽侧链 (γGlu+2×AEEA+C18二酸)", delta: 832.5041, target: "Lys26" },
    { id: "lira", name: "利拉鲁肽侧链 (γGlu+棕榈酰)", delta: 395.2789, target: "Lys26" },
  ];

  globalThis.PeptideImpurityData = { AA, PROTON, H2O, ATOM, MODS, SC_PRESETS };
})();
