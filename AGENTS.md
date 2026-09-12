# Agent playbook

Grocer tracks work in GitHub Issues. New requests and features become tickets
before implementation. Tickets are complete only after a pull request records
the outcome, the changes, how problems were resolved, and QA verification.

## 1. Turn the request into a ticket

Do this first, before writing product code.

1. Search existing issues for a duplicate.
2. Open a ticket if none exists:
   - Preferred: `scripts/new-ticket.sh feature|bug|task "Title"`, commit the
     inbox file, and push. The **Open tickets from inbox** workflow creates the
     issue and stamps `issue: <number>` into the file.
   - GitHub UI: Feature request, Bug report, or Task templates.
   - If `gh issue create` works in this environment, use the same title/body as
     the templates (`feature.yml`, `bug.yml`, `task.yml`).
3. If you are already on a PR with no `Fixes #<n>`, the **Ensure PR has a
   ticket** workflow opens one. Add `Fixes #<n>` to the PR body.

Do not start implementation on an untitled chat request. The ticket is the
source of truth.

## 2. Implement against the ticket

- Branch from `master`.
- Keep the issue number in the PR (`Fixes #123`).
- Add the `in-progress` label when you start, if you can write labels.

## 3. Complete the ticket

The PR body must use `.github/PULL_REQUEST_TEMPLATE.md` and fill in all four
sections:

| Section | What to write |
| --- | --- |
| **Summary** | Restate the issue and the outcome |
| **What changed** | Files, APIs, and user-visible behavior |
| **How problems were resolved** | Defects you hit, tradeoffs, leftover follow-ups |
| **QA verification** | Commands run, results, and flows actually exercised |

Merging the PR posts that write-up onto the issue, labels it
`ticket-completed`, and closes it. Missing QA evidence gets `needs-qa`.

## 4. QA verification (required)

Run `npm run qa` before you claim the ticket is done. That runs lint, ticket
workflow tests, and a production build. Paste the result into **QA
verification** with pass/fail, not empty checkboxes.

For Grocer product changes, also record what you exercised:

- List builder: add/remove items, quantity, notes, empty-list error
- Match / optimize: single-store vs multi-store, savings threshold, prefer local
- Related routes: `/api/stores`, `/api/catalog`, `/api/lists`, match, optimize
- Edge states you touched (empty, error, missing Kroger credentials)

If browser tools are available, use them for UI changes. If not, say what you
could not verify and use `curl` or tests instead.

CI workflow **QA** must stay green on the PR.

## 5. Do not skip the write-up

A merged PR without the four sections still opens or updates a ticket, but it
is incomplete. Fill the template before you ask for review.
