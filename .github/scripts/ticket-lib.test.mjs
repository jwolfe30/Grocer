import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCompletionComment,
  hasQaEvidence,
  missingCompletionHeadings,
  parseInboxFile,
  stampInboxIssue,
  summarizeCompletion,
} from "./ticket-lib.mjs";

const completeBody = `
## Summary

Shoppers can pin a preferred store.

## What changed

- Saved preferLocal on the list
- Optimize reads the pin

## How problems were resolved

Unit-price rounding made the multi-store plan look cheaper; compared totals after rounding.

## QA verification

- \`npm run qa\` passed (lint, ticket-lib tests, production build)
- Optimized milk + eggs with and without prefer local
- Empty list still returns the add-item error
`;

test("parseInboxFile reads title, type, and labels", () => {
  const parsed = parseInboxFile(`---
title: Pin a preferred store
type: feature
labels: enhancement, ready-for-agent
---

Shoppers want to keep one store fixed.
`);
  assert.equal(parsed.title, "Pin a preferred store");
  assert.equal(parsed.type, "feature");
  assert.deepEqual(parsed.labels, ["enhancement", "ready-for-agent"]);
  assert.equal(parsed.issue, "");
  assert.match(parsed.body, /keep one store fixed/);
});

test("missingCompletionHeadings finds incomplete PR bodies", () => {
  assert.deepEqual(missingCompletionHeadings("## Summary\n\nDone."), [
    "What changed",
    "How problems were resolved",
    "QA verification",
  ]);
  assert.deepEqual(missingCompletionHeadings(completeBody), []);
});

test("summarizeCompletion ignores HTML comments around headings", () => {
  const wrapped = `<!-- skip -->\n${completeBody}\n<!-- ticket-source:pr-9 -->`;
  const summary = summarizeCompletion(wrapped);
  assert.deepEqual(summary.missing, []);
  assert.equal(summary.qaOk, true);
  assert.match(summary.sections.Summary, /preferred store/);
});

test("hasQaEvidence requires a command, a result, and more than empty checkboxes", () => {
  assert.equal(hasQaEvidence("- [ ] npm run qa\n- [ ] browser"), false);
  assert.equal(
    hasQaEvidence("`npm run qa` passed\nBrowser: optimized a two-item list"),
    true,
  );
  assert.equal(hasQaEvidence("looks good"), false);
});

test("formatCompletionComment fills missing sections and lists gaps", () => {
  const comment = formatCompletionComment({
    prUrl: "https://github.com/jwolfe30/Grocer/pull/4",
    title: "Add ticket workflow",
    sections: { Summary: "", "What changed": "Added issue templates" },
    missing: ["Summary", "QA verification"],
  });
  assert.match(comment, /Add ticket workflow/);
  assert.match(comment, /Added issue templates/);
  assert.match(comment, /Not provided in the pull request/);
  assert.match(comment, /Missing PR sections: Summary, QA verification/);
});

test("stampInboxIssue writes the issue number into frontmatter", () => {
  const stamped = stampInboxIssue(
    "---\ntitle: Pin a preferred store\n---\n\nBody\n",
    "12",
    "https://github.com/jwolfe30/Grocer/issues/12",
  );
  assert.match(stamped, /^---\n[\s\S]*issue: 12\n[\s\S]*---/);
  assert.match(stamped, /Opened as https:\/\/github.com\/jwolfe30\/Grocer\/issues\/12/);
});
