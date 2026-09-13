# Grocer QA checklist

Run after every feature or UI change before calling the work done.

## Smoke (required)

```bash
npm run qa:smoke
```

Expect: homepage 200, `/api/stores` returns ≥10 stores, `/api/kroger/status` 200, suggest returns offers.

## UI checklist (manual, ~3 min)

1. **Stores**
   - [ ] Store picker visible under Optimize (not only in shopping mode)
   - [ ] Collapsed summary shows store **names** (not just “0 stores”)
   - [ ] Show expands full Include / Prefer / Exclude controls
2. **List**
   - [ ] Add item via suggest; delete still works
   - [ ] Checked items strike through
   - [ ] Suggest dropdown only opens for the **focused** row (DEV +15 must not stack every dropdown)
3. **Optimize**
   - [ ] Optimize shows progress bar and finishes (or clear error)
   - [ ] Plan shows totals / stops
   - [ ] Plan line expands priced options; picking one updates plan **without** a long API wait
   - [ ] **Live-first:** when live/cache coverage is thin, completion status uses warn copy (not “Done — live…”); plan total / stop headers show mostly modeled or mostly est. when applicable
4. **Let’s shop**
   - [ ] Button hides main list + item matches
   - [ ] Items are strike-outable; progress updates
   - [ ] Sticky header shows **Back to plan**, running total, and progress
   - [ ] Check targets are large (phone-friendly); prices stay readable
   - [ ] Back to plan restores list + matches + stores (never trapped without Back)
   - [ ] Every master-list item appears in the plan (priced or under “No price match yet”)
5. **Coupons**
   - [ ] Plan lines with applicable coupons show None / Auto / specific clip dropdown
   - [ ] Changing the pick updates line price + plan total locally (no re-optimize / Kroger wait)
   - [ ] Savings delta (“Save $X”) appears when a coupon applies; None clears it
6. **Matching**
   - [ ] Coffee does not satisfy ground beef / black beans
   - [ ] Yogurt, cheddar, tomatoes, oatmeal, paper towels can match seed/live offers

## Regression notes

- Shopping mode must not leave `stores` empty when returning.
- Shopping mode must always expose a clear **Back to plan** control.
- `/api/stores` failure must fall back to `AREA_STORES` on the client.
- Unmatched list items must stay on the plan (never silently dropped).
- Never commit `.env.local` secrets.
