const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
    "Fmoc-Aib-Gly-Pyr-OH",
    "Fmoc-Lys(Dde)-AEEA-Glu(OtBu)-Tyr(tBu)-OH",
    "H-His-Aib-Glu-Gly-Thr-Phe-Thr-Ser-Asp-Val-Ser-Ser-Tyr-Leu-Glu-Gly-Gln-Ala-Ala-Lys(C18Diacid)-Glu-Phe-Ile-Ala-Trp-Leu-Val-Arg-Gly-Arg-Gly-OH",
    "H-Tyr-Aib-Glu-Gly-Thr-Phe-Thr-Ser-Asp-Tyr-Ser-Ile-Aib-Leu-Asp-Lys-Ile-Ala-Gln-Lys(C20Diacid)-Ala-Phe-Val-Gln-Trp-Leu-Ile-Ala-Gly-Gly-Pro-Ser-Ser-Gly-Ala-Pro-Pro-Pro-Ser-NH2",
    "H-His-Aib-Gln-Gly-Thr-Phe-Thr-Ser-Asp-Val-Ser-Ser-Tyr-Leu-Glu-Gly-Gln-Ala-Ala-Lys-Glu-Phe-Ile-Ala-Trp-Leu-Val-Lys(C20Diacid)-Gly-Arg-NH2",
    "Fmoc-Lys[C20-OtBu-Glu(OtBu)-AEEA-AEEA]-OH",
    "DOTA-Lys-Gly-OH",
  ];
  examples.forEach((example) => assert.match(fs.readFileSync("app.js", "utf8"), new RegExp(escapeRegExp(example))));
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
  assert.match(app.elements.get("#protectingGroups").innerHTML, /main-chain N-terminus/);
  assert.match(app.elements.get("#protectingGroups").innerHTML, /Arg side chain/);
  assert.match(app.elements.get("#protectingGroups").innerHTML, /Asp side chain/);
  assert.match(app.elements.get("#protectingGroups").innerHTML, /Lys side chain/);
  assert.notEqual(app.elements.get("#protectedAvg").textContent, "--");
  assert.notEqual(app.elements.get("#deprotectedAvg").textContent, "--");

  app.setSequence("Fmoc-Gly-OH");
  assert.equal(app.elements.get("#protectedFormula").textContent, "C17H15NO4");

  app.setSequence("Cbz-Gly-OH");
  assert.equal(app.elements.get("#protectedFormula").textContent, "C10H11NO4");

  app.setSequence("Fmoc-Arg(Pbf)-Gly-OH");
  assert.equal(app.elements.get("#protectedFormula").textContent, "C36H43N5O8S");
  assert.equal(app.elements.get("#protectedAvg").textContent, "705.8311");

  app.setSequence("Fmoc-Ser(tBu)-OH");
  assert.equal(app.elements.get("#protectedFormula").textContent, "C22H25NO5");

  app.setSequence("Fmoc-Asp(OtBu)-OH");
  assert.equal(app.elements.get("#protectedFormula").textContent, "C23H25NO6");

  app.setSequence("Ac-Gly-OH");
  assert.equal(app.elements.get("#protectedFormula").textContent, "C4H7NO3");

  app.setSequence("Dde-Lys（Fmoc）-OH");
  assert.equal(app.elements.get("#parseStatus").textContent, "已解析");
  assert.equal(app.elements.get("#protectedFormula").textContent, "C31H36N2O6");
  assert.equal(app.elements.get("#protectedAvg").textContent, "532.6366");

  app.setSequence("Boc-His（Trt）-OH");
  assert.equal(app.elements.get("#parseStatus").textContent, "已解析");
  assert.equal(app.elements.get("#protectedFormula").textContent, "C30H31N3O4");
  assert.equal(app.elements.get("#protectedAvg").textContent, "497.5938");

  app.setSequence("Fmoc-Lys(Dde)-AEEA-Glu(OtBu)-Tyr(tBu)-OH");
  assert.equal(app.elements.get("#parseStatus").textContent, "已解析");
  assert.match(app.elements.get("#protectingGroups").innerHTML, /Dde/);
  assert.match(app.elements.get("#protectingGroups").innerHTML, /Glu side chain/);
  assert.match(app.elements.get("#protectingGroups").innerHTML, /Tyr side chain/);
  assert.match(app.elements.get("#parsedSequence").innerHTML, /AEEA/);

  app.setSequence("Fmoc-Aib-Gly-Pyr-OH");
  assert.equal(app.elements.get("#parseStatus").textContent, "已解析");
  assert.match(app.elements.get("#parsedSequence").innerHTML, /Aib/);
  assert.match(app.elements.get("#parsedSequence").innerHTML, /Pyr/);

  app.setSequence("H-His-Aib-Glu-Gly-Thr-Phe-Thr-Ser-Asp-Val-Ser-Ser-Tyr-Leu-Glu-Gly-Gln-Ala-Ala-Lys(C18Diacid)-Glu-Phe-Ile-Ala-Trp-Leu-Val-Arg-Gly-Arg-Gly-OH");
  assert.equal(app.elements.get("#parseStatus").textContent, "已解析");
  assert.match(app.elements.get("#protectingGroups").innerHTML, /C18 diacid/);
  assert.match(app.elements.get("#riskList").innerHTML, /Lipidated long-acting peptide motif/);

  app.setSequence("H-Tyr-Aib-Glu-Gly-Thr-Phe-Thr-Ser-Asp-Tyr-Ser-Ile-Aib-Leu-Asp-Lys-Ile-Ala-Gln-Lys(C20Diacid)-Ala-Phe-Val-Gln-Trp-Leu-Ile-Ala-Gly-Gly-Pro-Ser-Ser-Gly-Ala-Pro-Pro-Pro-Ser-NH2");
  assert.equal(app.elements.get("#parseStatus").textContent, "已解析");
  assert.match(app.elements.get("#protectingGroups").innerHTML, /C20 diacid/);

  app.setSequence("H-His-Aib-Gln-Gly-Thr-Phe-Thr-Ser-Asp-Val-Ser-Ser-Tyr-Leu-Glu-Gly-Gln-Ala-Ala-Lys-Glu-Phe-Ile-Ala-Trp-Leu-Val-Lys(C20Diacid)-Gly-Arg-NH2");
  assert.equal(app.elements.get("#parseStatus").textContent, "已解析");
  assert.match(app.elements.get("#protectingGroups").innerHTML, /C20 diacid/);

  app.setSequence("Fmoc-Lys[C20-OtBu-Glu(OtBu)-AEEA-AEEA]-OH");
  assert.equal(app.elements.get("#parseStatus").textContent, "已解析");
  assert.equal(app.elements.get("#protectedFormula").textContent, "C66H105N5O16");
  assert.equal(app.elements.get("#protectedAvg").textContent, "1224.5836");
  assert.match(app.elements.get("#protectingGroups").innerHTML, /C20-OtBu/);
  assert.match(app.elements.get("#protectingGroups").innerHTML, /AEEA/);
  assert.match(app.elements.get("#parsedSequence").innerHTML, /side-chain chain: C20-OtBu-Glu\(OtBu\)-AEEA-AEEA/);
  assert.match(app.elements.get("#riskList").innerHTML, /Lipidated long-acting peptide motif/);

  ["DOTA-Lys-Gly-OH", "NOTA-Lys-Gly-OH", "DTPA-Lys-Gly-OH", "Hynic-Lys-Gly-OH"].forEach((sequence) => {
    app.setSequence(sequence);
    assert.equal(app.elements.get("#parseStatus").textContent, "已解析", sequence);
    assert.notEqual(app.elements.get("#protectedAvg").textContent, "--", sequence);
  });

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
