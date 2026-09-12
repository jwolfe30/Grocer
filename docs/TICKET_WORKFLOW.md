# Ticket workflow

Every new Grocer request or feature is tracked as a GitHub Issue. Agents close
those tickets with a written summary, a change list, problem resolution, and QA
verification.

## File a ticket

Use any of these:

1. **GitHub issue forms** — [New issue](https://github.com/jwolfe30/Grocer/issues/new/choose)
   has Feature request, Bug report, and Task. Each form asks for a summary,
   acceptance criteria, and a QA plan. New issues get the `ready-for-agent`
   label and a playbook comment.
2. **Inbox file** — `scripts/new-ticket.sh feature "Title"`, then commit and
   push `tickets/inbox/*.md`. GitHub Actions opens the issue and writes
   `issue: <number>` back into the file. This is the path Cursor cloud agents
   should use when `gh issue create` is blocked.
3. **Pull request without an issue** — opening a PR that has no `Fixes #<n>`
   creates a ticket automatically. Add `Fixes #<n>` so merge closes it.

## Work a ticket

1. Branch from `master`.
2. Implement only what the ticket asks for.
3. Open a pull request that uses `.github/PULL_REQUEST_TEMPLATE.md`.
4. Include `Fixes #<issue>` in the PR body.
5. Fill in all four completion sections (see below).
6. Keep the **QA** GitHub Action green (`npm run qa`).

## Completion write-up

Required PR headings:

```markdown
## Summary
## What changed
## How problems were resolved
## QA verification
```

**QA verification** must include more than unchecked boxes:

- `npm run qa` result (lint, ticket-lib tests, production build)
- The Grocer flows you actually exercised (list builder, match/optimize, APIs)
- Empty, error, and edge states when they are in scope
- What you could not verify, if browser or live Kroger credentials were missing

On merge, **Complete tickets from merged PRs** copies that write-up onto the
linked issue, labels it `ticket-completed`, and closes it. Tickets with weak QA
notes also get `needs-qa`.

## Labels

| Label | Meaning |
| --- | --- |
| `ready-for-agent` | New ticket waiting to be implemented |
| `in-progress` | An agent or PR is working it |
| `needs-qa` | Completion write-up is missing QA evidence |
| `qa-verified` | Documented lint/build and verification passed |
| `ticket-completed` | Closed with the four-section write-up |
| `from-inbox` / `from-pr` | Opened by automation |

## Optional: Cursor Automation

Cloud agents do not create GitHub Issues unless the environment has a token
with `issues: write` (often a `GH_TOKEN` secret). Inbox files avoid that limit.

To have Cursor pick up new tickets automatically, create an automation at
[cursor.com/automations](https://cursor.com/automations):

- Trigger: GitHub **Issue label changed** → `ready-for-agent` added
- Repository: `jwolfe30/Grocer`, branch `master`
- Prompt: follow `AGENTS.md`. Implement the issue, open a PR with
  `Fixes #<n>`, fill Summary / What changed / How problems were resolved /
  QA verification, and run `npm run qa`.

That automation is configured in the Cursor dashboard, not in this repository.
