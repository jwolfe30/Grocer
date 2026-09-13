import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — Grocer",
  description:
    "How Grocer handles grocery lists, optional accounts, receipts, and price data. We do not sell personal data.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-5 py-10 sm:py-14">
      <p
        className="text-3xl font-semibold tracking-tight text-[var(--leaf-deep)] sm:text-4xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Grocer
      </p>
      <h1
        className="mt-3 text-2xl font-semibold text-[var(--ink)] sm:text-3xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Privacy policy
      </h1>
      <p className="mt-2 text-sm text-[var(--ink-muted)]">
        Last updated: 2026-09-12 · App id{" "}
        <code className="text-[var(--ink)]">com.cascadialabs.grocer</code>
      </p>

      <div className="mt-8 space-y-8 text-[1.05rem] leading-relaxed text-[var(--ink)]">
        <section className="space-y-3">
          <p>
            Operator: <strong>Cascadia Labs</strong>{" "}
            <span className="text-[var(--ink-muted)]">
              (placeholder name — not a registered legal entity yet)
            </span>
            . Contact:{" "}
            <a
              className="font-medium text-[var(--leaf)] underline underline-offset-2"
              href="mailto:privacy@cascadialabs.example"
            >
              privacy@cascadialabs.example
            </a>{" "}
            <span className="text-[var(--ink-muted)]">(placeholder inbox)</span>.
          </p>
          <p className="text-[var(--ink-muted)]">
            Readable summary for shoppers and Play Store data safety — not formal
            legal advice. Canonical draft also lives in the repo as{" "}
            <code className="text-sm text-[var(--ink)]">docs/PRIVACY.md</code>.
          </p>
        </section>

        <section className="space-y-3">
          <h2
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Short version
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-[var(--ink)]">
            <li>Core list and optimize tools work without an account.</li>
            <li>
              Optional accounts store email, hashed password, ZIP, profile extras,
              and cloud lists.
            </li>
            <li>
              Receipt uploads may include pasted text and/or photo metadata
              (filename, type, size) — full-image OCR is not shipped yet.
            </li>
            <li>
              We cache price observations (including crowd prices from receipts)
              for comparisons.
            </li>
            <li>
              Live Fred Meyer / QFC prices use the Kroger Products API{" "}
              <em>on our servers</em> — credentials are not in the Android app.
            </li>
            <li>We do not sell personal data.</li>
            <li>
              No third-party advertising or analytics SDKs in the Android shell
              today.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            What we handle
          </h2>
          <p>
            <strong>Lists:</strong> items, prefs, ZIP, check-offs. Guests keep a
            device list id in the WebView; signed-in users can sync a cloud list
            and create household share links.
          </p>
          <p>
            <strong>Accounts (optional):</strong> email, scrypt password hash,
            display name, ZIP, frequent items, alert prefs, optional small profile
            photo, session token.
          </p>
          <p>
            <strong>Receipts (optional):</strong> pasted text / parsed lines, store
            and ZIP, timestamps, and photo metadata only until OCR lands. Priced
            lines may become crowd price observations for others nearby.
          </p>
          <p>
            <strong>Not collected for core use:</strong> payment cards, contacts,
            SMS, precise GPS. You enter a ZIP instead of continuous location.
          </p>
        </section>

        <section className="space-y-3">
          <h2
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Sharing &amp; selling
          </h2>
          <p>
            We do not sell personal information or send it to data brokers. Server
            calls to Kroger are product/price lookups, not a handoff of your email
            or list. Anyone you give a share link to can see that list’s items.
          </p>
        </section>

        <section className="space-y-3">
          <h2
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Your choices
          </h2>
          <p>
            Stay a guest, skip receipts and photos, sign out anytime, or avoid
            share links. Account deletion self-serve is planned; until then email
            the contact above once a real inbox is configured.
          </p>
        </section>

        <section className="space-y-3">
          <h2
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Children
          </h2>
          <p>
            Grocer is not directed at children under 13. Do not create an account
            for a child under 13.
          </p>
        </section>
      </div>

      <p className="mt-12 border-t border-[var(--line)] pt-6 text-sm text-[var(--ink-muted)]">
        <Link
          href="/"
          className="font-medium text-[var(--leaf)] underline underline-offset-2"
        >
          ← Back to Grocer
        </Link>
      </p>
    </main>
  );
}
