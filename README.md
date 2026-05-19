# Protected Peptide Calculator

面向多肽合成研发人员的保护肽分子量计算原型。打开 `index.html` 即可使用。

在线访问：

- Netlify: https://protected-peptide-calculator.netlify.app

当前功能：

- 解析 `Fmoc-Arg(Pbf)-Gly-Asp(OtBu)-Lys(Boc)-OH` 这类保护肽序列
- 识别 N 端、C 端和侧链保护基，未知保护基会提示错误
- 内置 5 个示例序列：
  - `Fmoc-Arg(Pbf)-Gly-Asp(OtBu)-Lys(Boc)-OH`
  - `H-Arg-Gly-Asp-Phe-Lys-NH2`
  - `Ac-Gly-Gly-Phe-OH`
  - `Boc-Ala-Val-Leu-Phe-OMe`
  - `Fmoc-Lys(Boc)-Gly-Pro-OH`
- 输出保护肽平均分子量、单同位素质量
- 输出脱保护后多肽平均分子量、单同位素质量
- 输出保护肽和脱保护肽分子式
- 支持 TFA、HCl、AcOH 盐型当量修正
- 汇总保护基列表
- 根据常见序列模式提示合成风险，包括 Pro/Kaiser test 和 Asp-Gly/aspartimide
- 生成可复制的结果报告
- 响应式布局支持手机浏览器使用
- 支持 `System / Light / Dark` 主题
- 支持 `Copy Result`、`Export CSV`、`Export PDF`

友好错误提示：

- `Unknown amino acid: Xxx`
- `Unknown protecting group: ABC`
- `Missing C-terminal group`
- `Parentheses not closed`
- `Invalid sequence separator`

计算模型：

- 氨基酸按肽链残基分子式计入
- 线性肽默认加末端 `H2O`
- 保护基按连接后的净增分子式计入
- C 端 `NH2`、`OMe`、`OEt` 会修正末端分子式

这是研发估算工具原型。用于放行、注册或精确工艺文件前，应结合企业内部保护基数据库和标准品结果校准。

技术说明：

- 当前实现是纯前端 Web App，本地计算，不依赖服务器
- 可直接部署到 Vercel、GitHub Pages 或任何静态托管
- 核心计算逻辑集中在 `app.js`，后续可平滑迁移到 React / Next.js / TypeScript
- 后续可封装为 PWA 或桌面版

验收测试：

```bash
node acceptance.test.js
```
