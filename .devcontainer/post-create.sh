#!/usr/bin/env bash
# Runs once after the container is created. Restores project deps and installs
# the opencode CLI.
set -euo pipefail

# echo "==> Restoring .NET tools (fable, fsdocs)"
# dotnet tool restore

echo "==> Restoring OverARC dependencies"
dotnet restore OverARC.slnx
npm ci

# echo "==> Rebuilding Python venv (drop any host-platform .venv)"
# rm -rf .venv
# uv sync

echo "==> Installing agent CLIs globally (opencode, claude-code, codex)"
npm install -g opencode-ai @anthropic-ai/claude-code @openai/codex

echo "==> Done."
