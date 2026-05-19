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
  const body = {
    appendChild() {},
  };
  const document = {
    documentElement: {
      dataset: {},
      removeAttribute(name) {
        if (name === "data-theme") delete this.dataset.theme;
      },
    },
    body,
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
  let copiedText = "";
  const context = {
    document,
    navigator: {
      clipboard: {
        writeText: async (text) => {
          copiedText = text;
        },
      },
    },
    window: {
      setTimeout: () => {},
    },
    localStorage: {
      data: {},
      getItem(key) {
        return this.data[key] || null;
      },
      setItem(key, value) {
        this.data[key] = value;
      },
    },
    console,
  };

  vm.runInNewContext(fs.readFileSync("app.js", "utf8"), context);

  return {
    elements,
    setSequence(sequence) {
      elements.get("#sequenceInput").value = sequence;
      context.render();
    },
    async copy() {
      await elements.get("#copyReport").onclick();
      return copiedText;
    },
  };
}

(async () => {
  const html = fs.readFileSync("index.html", "utf8");
  const css = fs.readFileSync("styles.css", "utf8");
  ["Calculate", "Clear", "Copy Result", "Export CSV", "Export PDF", "Load Example"].forEach((label) => {
    assert.match(html, new RegExp(`>${label}<`));
  });
  assert.match(html, /id="themeSelect"/);
  const examples = [
    "Fmoc-Arg(Pbf)-Gly-Asp(OtBu)-Lys(Boc)-OH",
    "H-Arg-Gly-Asp-Phe-Lys-NH2",
    "Ac-Gly-Gly-Phe-OH",
    "Boc-Ala-Val-Leu-Phe-OMe",
    "Fmoc-Lys(Boc)-Gly-Pro-OH",
  ];
  examples.forEach((example) => assert.match(fs.readFileSync("app.js", "utf8"), new RegExp(example.replace(/[()]/g, "\\$&"))));
  assert.match(css, /prefers-color-scheme:\s*dark/);
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(css, /\[data-theme="light"\]/);
  assert.match(css, /@media \(max-width:\s*720px\)/);

  const app = bootApp();

  examples.forEach((example) => {
    app.setSequence(example);
    assert.equal(app.elements.get("#parseStatus").textContent, "已解析", example);
    assert.notEqual(app.elements.get("#protectedAvg").textContent, "--", example);
  });

  app.setSequence("Fmoc-Arg(Pbf)-Gly-Asp(OtBu)-Lys(Boc)-OH");
  assert.equal(app.elements.get("#parseStatus").textContent, "已解析");
  assert.match(app.elements.get("#terminalSummary").innerHTML, /N端: Fmoc/);
  assert.match(app.elements.get("#terminalSummary").innerHTML, /C端: OH/);
  assert.match(app.elements.get("#protectingGroups").innerHTML, /N-Fmoc/);
  assert.match(app.elements.get("#protectingGroups").innerHTML, /Pbf/);
  assert.match(app.elements.get("#protectingGroups").innerHTML, /OtBu/);
  assert.match(app.elements.get("#protectingGroups").innerHTML, /Boc/);
  assert.notEqual(app.elements.get("#protectedAvg").textContent, "--");
  assert.notEqual(app.elements.get("#deprotectedAvg").textContent, "--");

  app.setSequence("Fmoc-Arg(ABC)-Gly-OH");
  assert.equal(app.elements.get("#parseStatus").textContent, "需校对");
  assert.match(app.elements.get("#riskList").innerHTML, /Unknown protecting group: ABC/);
  assert.match(app.elements.get("#riskLevel").textContent, /High/);

  app.setSequence("Fmoc-Xxx-Gly-OH");
  assert.match(app.elements.get("#riskList").innerHTML, /Unknown amino acid: Xxx/);

  app.setSequence("Fmoc-Gly-Gly");
  assert.match(app.elements.get("#riskList").innerHTML, /Missing C-terminal group/);

  app.setSequence("Fmoc-Arg(Pbf-Gly-OH");
  assert.match(app.elements.get("#riskList").innerHTML, /Parentheses not closed/);

  app.setSequence("Fmoc/Arg-Gly-OH");
  assert.match(app.elements.get("#riskList").innerHTML, /Invalid sequence separator/);

  app.setSequence("Fmoc-Ala-Pro-Gly-OH");
  assert.match(app.elements.get("#riskList").innerHTML, /Kaiser test/);

  app.setSequence("Fmoc-Asp-Gly-Lys(Boc)-OH");
  assert.match(app.elements.get("#riskList").innerHTML, /aspartimide/);

  app.setSequence("Fmoc-Arg(Pbf)-Gly-Asp(OtBu)-Lys(Boc)-OH");
  const copied = await app.copy();
  assert.match(copied, /Protected Peptide Calculator Report/);
  assert.match(copied, /Protected average MW/);

  console.log("All acceptance checks passed.");
})();
