#!/usr/bin/env node
/**
 * Helpers for Grocer ticket automation.
 * Commands: parse-inbox, check-completion, extract-completion, field, stamp-inbox
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_HEADINGS = [
  "Summary",
  "What changed",
  "How problems were resolved",
  "QA verification",
];

export function stripHtmlComments(text) {
  return String(text || "").replace(/<!--[\s\S]*?-->/g, "");
}

export function parseFrontmatter(markdown) {
  const source = String(markdown || "").replace(/^\uFEFF/, "");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { attributes: {}, body: source.trim() };
  }

  const attributes = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    attributes[key] = value;
  }

  return { attributes, body: match[2].trim() };
}

export function headingPattern(title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^#{1,3}\\s+${escaped}\\s*$`, "im");
}

export function extractSection(markdown, title) {
  const text = String(markdown || "");
  const start = headingPattern(title).exec(text);
  if (!start) return "";

  const after = text.slice(start.index + start[0].length);
  const next = after.search(/^#{1,3}\s+\S/m);
  return (next === -1 ? after : after.slice(0, next)).trim();
}

export function extractCompletion(markdown) {
  const body = stripHtmlComments(markdown);
  const sections = {};
  for (const title of REQUIRED_HEADINGS) {
    sections[title] = extractSection(body, title);
  }
  return sections;
}

export function missingCompletionHeadings(markdown) {
  const body = stripHtmlComments(markdown);
  return REQUIRED_HEADINGS.filter((title) => !headingPattern(title).test(body));
}

export function hasQaEvidence(qaSection) {
  const text = String(qaSection || "").toLowerCase();
  if (!text.trim()) return false;
  const mentionsCommand =
    text.includes("npm run qa") ||
    text.includes("npm run lint") ||
    text.includes("npm run build");
  const mentionsResult =
    /\b(pass|passed|ok|success|failed|fail|error)\b/.test(text) ||
    text.includes("exit");
  const uncheckedOnly = /^\s*(?:- \[[ ]\].*\n?)+$/.test(text.trim());
  return mentionsCommand && mentionsResult && !uncheckedOnly;
}

export function splitLabels(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseInboxFile(markdown) {
  const parsed = parseFrontmatter(markdown);
  return {
    title: parsed.attributes.title || "",
    type: parsed.attributes.type || "task",
    labels: splitLabels(parsed.attributes.labels),
    issue: String(parsed.attributes.issue || ""),
    body: parsed.body,
    attributes: parsed.attributes,
  };
}

export function summarizeCompletion(markdown) {
  const sections = extractCompletion(markdown);
  return {
    missing: missingCompletionHeadings(markdown),
    qaOk: hasQaEvidence(sections["QA verification"]),
    sections,
  };
}

export function stampInboxIssue(markdown, number, url) {
  const issue = String(number);
  const issueUrl = String(url);
  if (markdown.startsWith("---")) {
    const parts = markdown.split("---", 3);
    let frontmatter = parts[1];
    if (!/^issue:/m.test(frontmatter)) {
      frontmatter = `${frontmatter.replace(/\s*$/, "")}\nissue: ${issue}\n`;
    }
    const body = parts[2] || "";
    return `---${frontmatter}---${body.replace(/\s*$/, "")}\n\nOpened as ${issueUrl}\n`;
  }
  return `---\nissue: ${issue}\n---\n\n${markdown.replace(/\s*$/, "")}\n\nOpened as ${issueUrl}\n`;
}

export function formatCompletionComment({
  prUrl,
  title,
  sections,
  missing = [],
}) {
  const fallback = (value, placeholder) =>
    String(value || "").trim() || placeholder;
  const missingNote = missing.length
    ? `\n_Missing PR sections: ${missing.join(", ")}. Re-open or comment if this ticket still needs work._\n`
    : "";
  return `## Ticket completed

Closed by ${prUrl}.

### Summary

${fallback(sections.Summary, title)}

### What changed

${fallback(sections["What changed"], "_Not provided in the pull request._")}

### How problems were resolved

${fallback(sections["How problems were resolved"], "_Not provided in the pull request._")}

### QA verification

${fallback(sections["QA verification"], "_Not provided in the pull request._")}
${missingNote}`;
}

export function getField(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => {
    if (current == null) return "";
    return current[key];
  }, value);
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printField(value) {
  if (value == null) {
    process.stdout.write("");
    return;
  }
  if (Array.isArray(value)) {
    process.stdout.write(value.join(","));
    return;
  }
  if (typeof value === "object") {
    printJson(value);
    return;
  }
  process.stdout.write(String(value));
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const command = process.argv[2];
  if (command === "parse-inbox") {
    printJson(parseInboxFile(fs.readFileSync(process.argv[3], "utf8")));
  } else if (command === "check-completion") {
    const summary = summarizeCompletion(fs.readFileSync(0, "utf8"));
    printJson({ ok: summary.missing.length === 0, ...summary });
    if (summary.missing.length) process.exit(1);
  } else if (command === "extract-completion") {
    printJson(summarizeCompletion(fs.readFileSync(0, "utf8")));
  } else if (command === "field") {
    const data = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
    printField(getField(data, process.argv[4]));
  } else if (command === "format-completion") {
    const data = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
    process.stdout.write(
      formatCompletionComment({
        prUrl: process.argv[4] || "",
        title: process.argv[5] || "",
        sections: data.sections || {},
        missing: data.missing || [],
      }),
    );
  } else if (command === "stamp-inbox") {
    const file = process.argv[3];
    const stamped = stampInboxIssue(
      fs.readFileSync(file, "utf8"),
      process.argv[4],
      process.argv[5],
    );
    fs.writeFileSync(file, stamped);
  } else {
    console.error(
      "Unknown command. Use parse-inbox, check-completion, extract-completion, field, format-completion, or stamp-inbox.",
    );
    process.exit(2);
  }
}
