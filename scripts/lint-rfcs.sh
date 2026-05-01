#!/usr/bin/env bash
# scripts/lint-rfcs.sh
#
# Lints every file under rfcs/ that matches NNNN-*.md (excluding the template).
# Asserts:
#   1) The file starts with the canonical front-matter table (Field | Value).
#   2) All required sections are present, in any order.
#   3) RFC numbers are unique.
#
# Exits non-zero on any violation.

set -euo pipefail

RFC_DIR="$(cd "$(dirname "$0")/../rfcs" && pwd)"
fail=0
declare -A seen_numbers

required_sections=(
  "## Summary"
  "## Detailed design"
  "## Alternatives considered"
  "## Open questions"
  "## Security considerations"
  "## Compatibility"
  "## References"
)

shopt -s nullglob
for rfc in "$RFC_DIR"/[0-9][0-9][0-9][0-9]-*.md; do
  base="$(basename "$rfc")"
  num="${base:0:4}"

  # Skip the canonical template (number 0000).
  if [[ "$num" == "0000" ]]; then
    continue
  fi

  # Uniqueness check.
  if [[ -n "${seen_numbers[$num]:-}" ]]; then
    echo "ERROR: duplicate RFC number $num: $base and ${seen_numbers[$num]}" >&2
    fail=1
  fi
  seen_numbers[$num]="$base"

  # Front-matter table check: first non-empty content line must be the H1
  # title, and within the first 12 lines we must see a markdown table header.
  first_line="$(grep -m1 -v '^[[:space:]]*$' "$rfc" || true)"
  if [[ ! "$first_line" =~ ^#\ RFC[[:space:]] ]]; then
    echo "ERROR: $base: first non-empty line must start with '# RFC <number>: <title>'" >&2
    fail=1
  fi

  if ! head -12 "$rfc" | grep -qE '^\| Field[[:space:]]+\| Value' ; then
    echo "ERROR: $base: missing canonical front-matter table (Field | Value)" >&2
    fail=1
  fi

  # Required-section presence check.
  for section in "${required_sections[@]}"; do
    if ! grep -qxF "$section" "$rfc"; then
      echo "ERROR: $base: missing required section '$section'" >&2
      fail=1
    fi
  done
done

if [[ "$fail" -ne 0 ]]; then
  echo "RFC lint failed." >&2
  exit 1
fi

echo "RFC lint OK ($(ls "$RFC_DIR"/[0-9][0-9][0-9][0-9]-*.md | wc -l | tr -d ' ') files checked)."
