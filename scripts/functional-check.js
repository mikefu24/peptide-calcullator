const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const sequences = [
  "Fmoc-Arg(Pbf)-Gly-Asp(OtBu)-Lys(Boc)-OH",
  "H-Arg-Gly-Asp-Phe-Lys-NH2",
  "Ac-Gly-Gly-Phe-OH",
  "Fmoc-Lys(Boc)-Gly-Pro-OH",
  "Fmoc-Aib-Gly-Pyr-OH",
  "Fmoc-Lys(Dde)-AEEA-Glu(OtBu)-Tyr(tBu)-OH",
];

class Element {
  constructor(selector) {
    this.selector = selector;
    this.value = selector === "#sequenceInput" ? sequences[0] : "";
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

const app = bootApp();

console.log("Functional acceptance");
for (const sequence of sequences) {
  app.elements.get("#sequenceInput").value = sequence;
  app.render();

  const status = app.elements.get("#parseStatus").textContent;
  const protectedMw = app.elements.get("#protectedAvg").textContent;
  const deprotectedMw = app.elements.get("#deprotectedAvg").textContent;
  const protectingGroups = app.elements.get("#protectingGroupCount").textContent;
  const riskLevel = app.elements.get("#riskLevel").textContent;

  assert.equal(status, "已解析", sequence);
  assert.notEqual(protectedMw, "--", sequence);
  assert.notEqual(deprotectedMw, "--", sequence);

  console.log(`PASS | ${sequence}`);
  console.log(`  Protected Avg MW: ${protectedMw}`);
  console.log(`  Deprotected Avg MW: ${deprotectedMw}`);
  console.log(`  Protecting groups: ${protectingGroups}`);
  console.log(`  Risk level: ${riskLevel}`);
}
