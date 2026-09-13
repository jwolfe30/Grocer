# Privacy policy — Grocer

**Last updated:** 2026-09-12  
**App:** Grocer (`com.cascadialabs.grocer`)  
**Operator:** Cascadia Labs *(placeholder name — not a registered legal entity yet)*  
**Contact (placeholder):** [privacy@cascadialabs.example](mailto:privacy@cascadialabs.example) — replace before public Play release.

This policy describes what Grocer collects, why, and what we do **not** do. It is written for shoppers and for Google Play’s data-safety disclosure. It is **not** formal legal advice.

---

## Short version

- You can build lists and optimize trips **without an account**.
- Optional accounts store email, password (hashed), ZIP, profile extras, and cloud lists.
- Receipt uploads may include pasted text and/or **photo metadata** (filename, type, size) — not full receipt image OCR yet.
- We cache **price observations** (including crowd prices from receipts) to power comparisons.
- Live Fred Meyer / QFC prices come from the **Kroger Products API** on our servers — credentials never live in the Android app.
- We **do not sell** personal data.
- We do **not** currently ship third-party advertising or analytics SDKs in the Android shell.

---

## Who this covers

- The **web app** (Next.js backend + UI).
- The **Android app** (Capacitor WebView loading that same product — see `docs/ANDROID.md`).

Guest use and signed-in use are both covered.

---

## Information we handle

### Grocery lists (guest or signed-in)

- List name, items (queries, quantities, notes, check-off state), store preferences, diet-style prefs, ZIP used for nearby stores.
- Guest lists are tied to a device list id stored in the browser/WebView (`localStorage`).
- Signed-in users can sync a **cloud list** across devices and optionally create a **share link** so household guests can open the list and check off items (no login required for guests on that link).

### Optional account

If you register:

| Data | Purpose |
|------|---------|
| Email | Sign-in identity |
| Password | Stored as a **scrypt hash** (salted); we do not store plaintext passwords |
| Display name, ZIP | Profile / local store context |
| Frequent items, alert prefs | Cloud sync & future sale/coupon alerts |
| Optional profile photo | Small image stored as a data URL on the account (demo-scale) |
| Session token | Auth; kept in client `localStorage` and looked up server-side in SQLite |

You do not need an account for core list + optimize features.

### Receipts

If you upload a receipt while signed in:

- **Pasted receipt text** and parsed line items (when provided).
- **Photo metadata only today** — name, MIME type, size, optional capture time. Full-image storage and OCR are planned follow-ups; until then we do **not** extract prices from the photo alone.
- Store name/id, ZIP, purchase/upload timestamps, totals, and cosmetic points/badges.

Parsed priced lines may become **crowd price observations** used to improve estimates for others in a similar area. Those observations include product-ish names, prices, store, ZIP, and a link back to the receipt/user id on our servers.

### Price observations & catalog

- Server-side cache of live and crowd prices (`price_observations` / related SQLite tables) so optimize and suggest stay fast and honest.
- Live Kroger (Fred Meyer / QFC) product/price lookups run **on the server** with developer credentials. The Android app only talks to Grocer’s `/api/*` endpoints.

### Technical / device data

- Standard web/server logs may include IP address, user agent, and request paths when the host records them (typical for any HTTPS site).
- Android shell requests **Internet** permission so the WebView can reach the backend. We do not currently declare camera as a separate native permission; receipt photos use the web file/camera picker inside the WebView where the OS allows it.
- No precise GPS geolocation API is required for core flows — you enter a **ZIP**.

### What we do not collect (today)

- Payment card numbers (Grocer does not process grocery checkout payments).
- Contacts, SMS, or call logs.
- Third-party ad tracking identifiers for monetization (optional ads are a later, explicit product decision).

---

## How we use information

- Provide lists, matching, optimize plans, coupons UI, and shopping mode.
- Sync optional accounts and receipt/spending history.
- Improve price coverage via cache refresh and crowd observations.
- Operate and debug the service (including Kroger/cache health for operators).

We do **not** sell personal information. We do **not** share personal data with data brokers.

---

## Sharing

| Recipient | When |
|-----------|------|
| **Kroger API** | Server-side product/price requests for covered banners — not your email or grocery list contents as a marketing handoff |
| **Household share links** | Anyone with the link can see list items and check them off |
| **Hosting / ops** | Whoever runs the Grocer backend (you or your host) necessarily processes the data above |

We may disclose information if required by law or to protect users and the service.

---

## Retention

- Account, list, session, receipt, and price data live in durable SQLite on the app host until deleted or the database is wiped by the operator.
- Session tokens remain until logout, expiry, or server-side invalidation.
- Crowd price history is append-oriented so trends and honesty labels can improve over time.

**Account deletion:** Signed-in users can delete their account in the app (**Account → Delete account**) or via `DELETE /api/account` with a Bearer session token. That removes the user record, sessions, owned cloud lists, receipts, crowd observations tied to the user, and sale alerts. Guest device lists can still be cleared in the app UI without an account. Contact the address above if you need operator help after a device is lost.

---

## Security

- Passwords hashed with scrypt.
- HTTPS recommended for any production `CAPACITOR_SERVER_URL`.
- Auth and account-deletion routes use in-memory per-IP rate limits (10/min).
- No security measure is perfect; report issues to the contact email.

---

## Children

Grocer is aimed at general grocery shopping. It is not directed at children under 13. Do not create an account for a child under 13.

---

## Your choices

- Use the app as a **guest** without email.
- Skip receipt uploads and profile photos.
- Sign out (clears the client session token).
- **Delete account** (Account panel or `DELETE /api/account`) to remove account-linked server data.
- Avoid creating share links if you do not want others to see list items.
- Contact us to correct email/profile data if you cannot sign in.

---

## Android / Play Store note

Google Play’s Data safety form should match this policy. A field-by-field mapping lives in [`docs/PLAY_STORE.md`](PLAY_STORE.md). The public URL for listings can be `https://<your-host>/privacy` once the web route is deployed.

---

## Changes

We may update this policy as the product grows (OCR, analytics, ads, wider geography). Material changes should bump **Last updated** and, for Play, the in-store privacy URL / Data safety answers.

---

## Contact

**Cascadia Labs** *(placeholder)*  
Email: **privacy@cascadialabs.example** *(placeholder — replace with a real inbox before production)*
