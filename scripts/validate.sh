#!/usr/bin/env bash
# scripts/validate.sh
#
# Validates:
#   - all examples/**/*.{yaml,yml}      → must PASS
#   - all conformance/valid/**/*.{yaml,yml,json} → must PASS
#   - all conformance/invalid/**/*.{yaml,yml,json} (excluding *.expected.json)
#                                        → must FAIL with a matching error
#
# Schema selection:
#   - examples/<agent>/genome.yaml          → genome.schema.json
#   - examples/<agent>/agent.lock.yaml      → agent-lock.schema.json
#   - examples/<agent>/behavior.contract.yaml → behavior-contract.schema.json
#   - conformance/<valid|invalid>/<artifact>/<name>.<ext>
#                                          → schemas/v0.1/<artifact>.schema.json
#
# Other YAML files under examples/ are NOT validated against any schema
# (e.g. memory.schema.yaml, prompts/, knowledge/snapshots.yaml,
# evals/replay_manifest.yaml, tools/mcp.lock.yaml). They are inspected
# only for valid YAML syntax.
#
# Exit non-zero on any deviation.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules ]]; then
  echo "node_modules/ missing — run 'npm ci' first." >&2
  exit 2
fi

node scripts/validate.js
