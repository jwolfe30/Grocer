#!/usr/bin/env bash
set -euo pipefail

type="${1:-}"
title="${2:-}"

if [[ -z "$type" || -z "$title" ]]; then
  echo "Usage: scripts/new-ticket.sh <feature|bug|task> \"Title of the request\"" >&2
  exit 1
fi

slug="$(
  printf '%s' "$title" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g'
)"
date_prefix="$(date -u +%Y-%m-%d)"
file="tickets/inbox/${date_prefix}-${slug}.md"

mkdir -p tickets/inbox

if [[ -e "$file" ]]; then
  echo "Already exists: $file" >&2
  exit 1
fi

case "$type" in
  feature) labels="enhancement, ready-for-agent" ;;
  bug) labels="bug, ready-for-agent" ;;
  task) labels="ready-for-agent" ;;
  *)
    echo "Type must be feature, bug, or task." >&2
    exit 1
    ;;
esac

cat > "$file" <<EOF
---
title: ${title}
type: ${type}
labels: ${labels}
---

## Summary

${title}

## Problem

<!-- Why this ticket exists. -->

## Acceptance criteria

- [ ]

## QA plan

- [ ] \`npm run qa\` (lint, ticket tests, production build)
- [ ] Exercise the changed Grocer flow end to end
- [ ] Check related list / match / optimize behavior
- [ ] Cover empty, error, and edge states
EOF

echo "Wrote $file"
echo "Commit and push this file to open a GitHub issue automatically."
echo "If \`gh\` can write issues in your environment, you can also run:"
echo "  gh issue create --template ${type}.yml --title \"[${type^}]: ${title}\""
