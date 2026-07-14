#!/usr/bin/env bash
# ============================================================================
# 一键发布到 GitHub  ·  One-command deploy
# 用法 Usage:
#   bash deploy.sh https://github.com/<你的账号>/<仓库名>.git
# 例:
#   bash deploy.sh https://github.com/mikefu24/peptide-calcullator.git
#
# 前提：本机已登录 GitHub（git 凭据 / gh auth / SSH 均可）。
# ============================================================================
set -e

REPO_URL="${1:-}"
if [ -z "$REPO_URL" ]; then
  echo "用法: bash deploy.sh https://github.com/<账号>/<仓库>.git"
  echo "（仓库需先在 GitHub 网页上创建为空仓库，或使用已存在的仓库）"
  exit 1
fi

# 在本目录初始化并提交
if [ ! -d .git ]; then git init; fi
git add .
git commit -m "feat: 保护肽分子量计算器 v2.2 — iOS 图标 + 三配色 + Δmass 杂质分析 + 离线单文件版" || echo "（无改动可提交）"
git branch -M main

# 绑定远端并推送
if git remote | grep -q '^origin$'; then git remote set-url origin "$REPO_URL"; else git remote add origin "$REPO_URL"; fi
git push -u origin main

echo ""
echo "✅ 已推送到 $REPO_URL"
echo "→ 开启网页版 (GitHub Pages)：仓库 Settings → Pages → Source 选 'main' 分支 / 根目录 (/root)，"
echo "  几分钟后即可通过 https://<账号>.github.io/<仓库>/ 在线访问。"
echo "→ 离线版：直接把 dist/保护肽分子量计算器-离线版.html 双击打开即可。"
