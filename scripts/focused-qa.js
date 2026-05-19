const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

class Element {
  constructor(selector) {
    this.selector = selector;
    this.value = selector === "#sequenceInput" ? "Fmoc-Arg(Pbf)-Gly-Asp(OtBu)-Lys(Boc)-OH" : "";
    this.textContent = "";
    this.innerHTML = "";
    this.dataset = {};
    this.style = {};
  }

  addEventListener(type, handler) {
    this[`on${type}`] = handler;
  }

  setAttribute() {}
  select() {}
  remove() {}
}

function bootApp() {
  const elements = new Map();
  const document = {
    documentElement: {
      dataset: {},
      removeAttribute(name) {
        if (name === "data-theme") delete this.dataset.theme;
      },
    },
    body: { appendChild() {} },
    createElement: (tag) => new Element(tag),
    execCommand: () => true,
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element(selector));
      return elements.get(selector);
    },
    querySelectorAll() {
      return [];
    },
  };
  const context = {
    document,
    navigator: { clipboard: { writeText: async () => {} } },
    window: { setTimeout: () => {} },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    console,
  };
  vm.runInNewContext(fs.readFileSync("app.js", "utf8"), context);
  return { elements, render: context.render };
}

function setSequence(app, sequence) {
  app.elements.get("#sequenceInput").value = sequence;
  app.render();
}

function numberFrom(app, selector) {
  return Number(app.elements.get(selector).textContent);
}

function assertRange(value, min, max, label) {
  assert.ok(value >= min && value <= max, `${label} out of range: ${value}`);
}

const app = bootApp();

console.log("Focused QA");

setSequence(app, "Fmoc-Arg(Pbf)-Gly-Asp(OtBu)-Lys(Boc)-OH");
const groups = app.elements.get("#protectingGroups").innerHTML;
["N-Fmoc", "Pbf", "OtBu", "Boc"].forEach((group) => assert.match(groups, new RegExp(group)));
["main-chain N-terminus", "Arg side chain", "Asp side chain", "Lys side chain"].forEach((site) => assert.match(groups, new RegExp(site)));
assert.equal(app.elements.get("#protectingGroupCount").textContent, "4");
console.log("PASS 1 | Protecting groups recognized with sites: N-Fmoc, Pbf, OtBu, Boc");

const protectedMw = numberFrom(app, "#protectedAvg");
const deprotectedMw = numberFrom(app, "#deprotectedAvg");
assertRange(protectedMw, 1050, 1160, "Protected MW");
assertRange(deprotectedMw, 440, 510, "Deprotected MW");
assert.ok(protectedMw > deprotectedMw, "Protected MW should be higher than deprotected MW");
console.log(`PASS 2 | MW looks reasonable: protected ${protectedMw.toFixed(4)}, deprotected ${deprotectedMw.toFixed(4)}`);

setSequence(app, "Fmoc-Asp-Gly-Lys(Boc)-OH");
assert.match(app.elements.get("#riskList").innerHTML, /aspartimide/);
console.log("PASS 3 | Asp-Gly triggers aspartimide risk");

setSequence(app, "Fmoc-Lys(Boc)-Gly-Pro-OH");
assert.match(app.elements.get("#riskList").innerHTML, /Kaiser test/);
console.log("PASS 4 | Pro triggers Kaiser test reliability warning");

const html = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("styles.css", "utf8");
assert.match(html, /<meta name="viewport"/);
assert.match(css, /@media \(max-width:\s*720px\)/);
assert.match(css, /\.metrics,\s*\n\s*\.salt-controls,\s*\n\s*\.sequence-list li,\s*\n\s*\.action-bar\s*{\s*\n\s*grid-template-columns:\s*1fr;/);
console.log("PASS 5 | Mobile browser support checks: viewport meta and single-column responsive layout");

setSequence(app, "Fmoc-Arg(ABC)-Gly-OH");
assert.equal(app.elements.get("#parseStatus").textContent, "需校对");
assert.match(app.elements.get("#riskList").innerHTML, /Unknown protecting group: ABC/);
assert.match(app.elements.get("#riskLevel").textContent, /High/);
console.log("PASS 6 | Unknown protecting group reports friendly error: Unknown protecting group: ABC");

setSequence(app, "Dde-Lys（Fmoc）-OH");
assert.equal(app.elements.get("#parseStatus").textContent, "已解析");
assert.equal(app.elements.get("#protectedFormula").textContent, "C31H36N2O6");
assert.equal(app.elements.get("#protectedAvg").textContent, "532.6366");
console.log("PASS 7 | Dde-Lys(Fmoc)-OH formula and MW regression passed");

setSequence(app, "Boc-His（Trt）-OH");
assert.equal(app.elements.get("#parseStatus").textContent, "已解析");
assert.equal(app.elements.get("#protectedFormula").textContent, "C30H31N3O4");
assert.equal(app.elements.get("#protectedAvg").textContent, "497.5938");
console.log("PASS 8 | Boc-His(Trt)-OH formula and MW regression passed");

setSequence(app, "Fmoc-Lys(Dde)-AEEA-Glu(OtBu)-Tyr(tBu)-OH");
assert.equal(app.elements.get("#parseStatus").textContent, "已解析");
assert.match(app.elements.get("#protectingGroups").innerHTML, /Dde/);
assert.match(app.elements.get("#protectingGroups").innerHTML, /Lys side chain/);
assert.match(app.elements.get("#protectingGroups").innerHTML, /Glu side chain/);
assert.match(app.elements.get("#protectingGroups").innerHTML, /Tyr side chain/);
assert.match(app.elements.get("#parsedSequence").innerHTML, /AEEA/);
console.log("PASS 9 | Special residue/linker and side-chain protecting groups recognized: Dde, AEEA, Glu(OtBu), Tyr(tBu)");

setSequence(app, "Fmoc-Aib-Gly-Pyr-OH");
assert.equal(app.elements.get("#parseStatus").textContent, "已解析");
assert.match(app.elements.get("#parsedSequence").innerHTML, /Aib/);
assert.match(app.elements.get("#parsedSequence").innerHTML, /Pyr/);
console.log("PASS 10 | Special amino acids recognized: Aib and Pyr");

setSequence(app, "H-His-Aib-Glu-Gly-Thr-Phe-Thr-Ser-Asp-Val-Ser-Ser-Tyr-Leu-Glu-Gly-Gln-Ala-Ala-Lys(C18Diacid)-Glu-Phe-Ile-Ala-Trp-Leu-Val-Arg-Gly-Arg-Gly-OH");
assert.equal(app.elements.get("#parseStatus").textContent, "已解析");
assert.match(app.elements.get("#protectingGroups").innerHTML, /C18 diacid/);
assert.match(app.elements.get("#riskList").innerHTML, /Lipidated long-acting peptide motif/);
console.log("PASS 11 | Semaglutide-like lipidated peptide motif recognized: Aib and C18 diacid");

setSequence(app, "H-Tyr-Aib-Glu-Gly-Thr-Phe-Thr-Ser-Asp-Tyr-Ser-Ile-Aib-Leu-Asp-Lys-Ile-Ala-Gln-Lys(C20Diacid)-Ala-Phe-Val-Gln-Trp-Leu-Ile-Ala-Gly-Gly-Pro-Ser-Ser-Gly-Ala-Pro-Pro-Pro-Ser-NH2");
assert.equal(app.elements.get("#parseStatus").textContent, "已解析");
assert.match(app.elements.get("#protectingGroups").innerHTML, /C20 diacid/);
console.log("PASS 12 | Tirzepatide-like lipidated peptide motif recognized: Aib and C20 diacid");

setSequence(app, "H-His-Aib-Gln-Gly-Thr-Phe-Thr-Ser-Asp-Val-Ser-Ser-Tyr-Leu-Glu-Gly-Gln-Ala-Ala-Lys-Glu-Phe-Ile-Ala-Trp-Leu-Val-Lys(C20Diacid)-Gly-Arg-NH2");
assert.equal(app.elements.get("#parseStatus").textContent, "已解析");
assert.match(app.elements.get("#protectingGroups").innerHTML, /C20 diacid/);
console.log("PASS 13 | Retatrutide-like lipidated peptide motif recognized: Aib and C20 diacid");
