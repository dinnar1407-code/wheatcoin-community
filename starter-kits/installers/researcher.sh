#!/usr/bin/env bash
set -euo pipefail

KIT_SLUG="researcher"
KIT_NAME="Researcher Kit"
WORKDIR="${OPENCLAW_WORKDIR:-$HOME/.openclaw/workspace}"
SKILLS=(
  "agent-browser"
  "markdown-converter"
  "obsidian-notesmd-cli"
  "video-frames"
  "openai-whisper-api"
  "find-skills"
)

echo "🧰 Installing $KIT_NAME"
echo "📁 Target OpenClaw workspace: $WORKDIR"

if ! command -v clawhub >/dev/null 2>&1; then
  echo "⚠️ clawhub CLI not found. Attempting to install via npm..."
  if command -v npm >/dev/null 2>&1; then
    npm i -g clawhub
  else
    echo "❌ npm is not installed. Please install Node.js/npm first, then re-run this script."
    exit 1
  fi
fi

mkdir -p "$WORKDIR"

for skill in "${SKILLS[@]}"; do
  echo "➡️ Installing $skill"
  clawhub install "$skill" --workdir "$WORKDIR"
done

echo "✅ $KIT_NAME installed successfully."
echo "📦 Bundle key: $KIT_SLUG"
