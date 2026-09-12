#!/usr/bin/env bash
set -euo pipefail

echo "## QA verification"
echo
echo "Started at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

echo "### npm run lint"
npm run lint
echo

echo "### npm test"
npm test
echo

echo "### npm run build"
npm run build
echo

echo "npm run qa passed (lint, ticket tests, production build) at $(date -u +%Y-%m-%dT%H:%M:%SZ)."
echo
echo "For UI or API work, also record the Grocer flows you exercised:"
echo "- List builder: add/remove items, quantity, notes, empty-list error"
echo "- Match / optimize: single-store vs multi-store, savings threshold, prefer local"
echo "- Related API routes under /api/stores, /api/catalog, /api/lists"
