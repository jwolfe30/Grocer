# Ticket inbox

Drop a markdown file here to turn a request into a GitHub issue.

Use `scripts/new-ticket.sh feature "Title"` or copy this frontmatter:

```markdown
---
title: Short ticket title
type: feature
labels: enhancement, ready-for-agent
---

## Summary

## Problem

## Acceptance criteria

- [ ]

## QA plan

- [ ] `npm run qa`
- [ ] Exercise the changed Grocer flow
```

Pushing the file to any branch runs **Open tickets from inbox**. That workflow
creates the issue, labels it `ready-for-agent`, and writes `issue: <number>`
back into the file.

`README.md` is ignored.
