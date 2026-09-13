"use client";

import { useEffect, useId, useRef, useState } from "react";
import type {
  FrequentItem,
  PublicUser,
  Receipt,
  ReceiptImageMeta,
  SaleAlert,
} from "@/lib/account-types";
import { formatUsd } from "@/lib/pricing";

const TOKEN_KEY = "grocer_token";

type Spending = {
  receiptCount: number;
  totalSpentUsd: number;
  byStore: Array<{ storeName: string; totalUsd: number; trips: number }>;
  recentLines: Array<{
    name: string;
    priceUsd: number;
    storeName: string;
    purchasedAt: string;
  }>;
};

type Props = {
  zip: string;
  onApplyFrequentItems: (items: FrequentItem[]) => void;
  onAuthChange: (user: PublicUser | null) => void;
};

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function AccountMenu({ zip, onApplyFrequentItems, onAuthChange }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [alerts, setAlerts] = useState<SaleAlert[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [spending, setSpending] = useState<Spending | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [storeName, setStoreName] = useState("Super 1 Foods");
  const [receiptText, setReceiptText] = useState(
    "Whole milk 3.49\nCage free eggs 2.99\nWheat bread 2.79\nBananas 1.18",
  );
  const [receiptPhoto, setReceiptPhoto] = useState<ReceiptImageMeta | null>(null);
  const [frequentDraft, setFrequentDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function loadAccount(token: string) {
    const res = await fetch("/api/account", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
      onAuthChange(null);
      return;
    }
    const data = await res.json();
    setUser(data.user);
    setAlerts(data.alerts ?? []);
    setReceipts(data.receipts ?? []);
    setSpending(data.spending ?? null);
    onAuthChange(data.user);
  }

  useEffect(() => {
    const token = getStoredToken();
    if (token) void loadAccount(token);
  }, []);

  useEffect(() => {
    if (user?.frequentItems?.length) {
      setFrequentDraft(user.frequentItems.map((i) => i.query).join("\n"));
    }
  }, [user?.id]);

  function openDialog(nextMode: "login" | "register" = "login") {
    setMode(nextMode);
    setError(null);
    setMessage(null);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function authSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          displayName: displayName || undefined,
          zip,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          typeof data.error === "string"
            ? data.error
            : "Auth failed — check email/password.";
        throw new Error(msg);
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
      onAuthChange(data.user);
      await loadAccount(data.token);
      setMessage(
        mode === "register"
          ? "Account created. Your list can sync across devices."
          : "Welcome back — cloud list ready.",
      );
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    const token = getStoredToken();
    if (token) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setAlerts([]);
    setReceipts([]);
    setSpending(null);
    onAuthChange(null);
    setMessage(null);
    closeDialog();
  }

  async function deleteAccount() {
    const confirmed = window.confirm(
      "Delete your account permanently? This removes your cloud lists, receipts, alerts, and sign-in. This cannot be undone.",
    );
    if (!confirmed) return;
    const token = getStoredToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Could not delete account.",
        );
      }
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
      setAlerts([]);
      setReceipts([]);
      setSpending(null);
      onAuthChange(null);
      setMessage("Account deleted.");
      closeDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete account.");
    } finally {
      setBusy(false);
    }
  }

  async function saveFrequent() {
    const token = getStoredToken();
    if (!token || !user) return;
    const queries = frequentDraft
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    const frequentItems = queries.map((query) => ({
      query,
      quantity: 1,
    }));
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ frequentItems }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError("Could not save frequent items.");
      return;
    }
    setUser(data.user);
    setMessage("Frequent items saved.");
  }

  async function toggleAlerts(key: "sales" | "coupons", value: boolean) {
    const token = getStoredToken();
    if (!token || !user) return;
    const alertPrefs = { ...user.alertPrefs, [key]: value };
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ alertPrefs }),
    });
    const data = await res.json();
    if (res.ok) {
      setUser(data.user);
      setAlerts(data.alerts ?? []);
    }
  }

  async function uploadReceipt() {
    const token = getStoredToken();
    if (!token) return;
    if (!receiptText.trim() && !receiptPhoto) {
      setError("Paste receipt lines or attach a photo first.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storeName,
          zip,
          rawText: receiptText,
          imageMeta: receiptPhoto ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setUser(data.user);
      setSpending(data.spending);
      setReceipts((prev) => [data.receipt, ...prev]);
      setMessage(data.message);
      setReceiptPhoto(null);
      if (photoInputRef.current) photoInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function onReceiptPhotoChange(file: File | null) {
    if (!file) {
      setReceiptPhoto(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file from your camera or gallery.");
      return;
    }
    setError(null);
    setReceiptPhoto({
      name: file.name || "receipt.jpg",
      mimeType: file.type || "image/*",
      sizeBytes: file.size,
      capturedAt: new Date().toISOString(),
    });
    setMessage(
      `Photo ready: ${file.name || "receipt"} (${Math.round(file.size / 1024)} KB). OCR is a follow-up — paste priced lines below to contribute crowd prices.`,
    );
  }

  async function toggleDevAuth() {
    setBusy(true);
    setError(null);
    try {
      if (user) {
        await logout();
        return;
      }
      const res = await fetch("/api/auth/dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error("Could not enable dev login.");
      localStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
      onAuthChange(data.user);
      await loadAccount(data.token);
      setMessage("Dev login on — testing as signed-in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dev toggle failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAvatar(file: File | null) {
    const token = getStoredToken();
    if (!token || !user) return;
    if (!file) {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ avatarUrl: null }),
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        onAuthChange(data.user);
        setMessage("Profile photo removed.");
      }
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file for your profile photo.");
      return;
    }
    if (file.size > 400_000) {
      setError("Keep profile photos under about 400KB for this demo.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read image."));
      reader.readAsDataURL(file);
    });
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ avatarUrl: dataUrl }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError("Could not save profile photo.");
      return;
    }
    setUser(data.user);
    onAuthChange(data.user);
    setMessage("Profile photo saved.");
  }

  return (
    <>
      <div className="absolute top-5 left-5 z-40 flex items-center gap-2 md:top-8 md:left-8">
        <label className="inline-flex cursor-pointer items-center gap-2 border border-[var(--line)] bg-[var(--card)]/90 px-2.5 py-1.5 text-xs font-semibold tracking-wide text-[var(--ink-muted)] uppercase backdrop-blur">
          <span>Dev</span>
          <input
            type="checkbox"
            className="peer sr-only"
            checked={Boolean(user)}
            disabled={busy}
            onChange={() => void toggleDevAuth()}
            aria-label="Developer toggle logged in"
          />
          <span
            className="relative h-5 w-9 rounded-full bg-[#c9d5cc] transition peer-checked:bg-[var(--leaf)] peer-disabled:opacity-50 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4"
            aria-hidden
          />
          <span className="normal-case tracking-normal">
            {user ? "Logged in" : "Logged out"}
          </span>
        </label>
      </div>

      <div className="absolute top-5 right-5 z-40 md:top-8 md:right-8">
        <button
          type="button"
          onClick={() => openDialog("login")}
          className="inline-flex items-center gap-2 text-sm font-semibold underline-offset-4 hover:underline"
        >
          <UserAvatar
            name={user?.displayName}
            avatarUrl={user?.avatarUrl}
            size="sm"
          />
          <span className={user ? "text-[var(--leaf-deep)]" : "text-[var(--ink)]"}>
            {user ? user.displayName : "Log in"}
          </span>
        </button>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-[min(100vw-2rem,32rem)] max-h-[min(90vh,40rem)] overflow-auto border border-[var(--line)] bg-white p-0 text-[var(--ink)] shadow-[0_20px_50px_rgba(20,32,26,0.2)] backdrop:bg-[rgba(20,32,26,0.35)] open:flex open:flex-col"
        onClick={(e) => {
          if (e.target === dialogRef.current) closeDialog();
        }}
        onClose={() => {
          setError(null);
        }}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-[var(--line)] bg-white px-5 py-4">
          <div>
            <h2 id={titleId} className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {user ? "Your account" : mode === "login" ? "Log in" : "Create account"}
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              {user
                ? "Cloud list, staples, alerts, receipts — free, no paywall."
                : "Optional. Guests can still build lists on this device."}
            </p>
          </div>
          <button
            type="button"
            onClick={closeDialog}
            className="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <div className="px-5 py-4">
          {!user ? (
            <form onSubmit={authSubmit} className="grid gap-3">
              {mode === "register" ? (
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display name"
                  className="border border-[var(--line)] px-3 py-2"
                />
              ) : null}
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="border border-[var(--line)] px-3 py-2"
                autoComplete="email"
              />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (6+ characters)"
                className="border border-[var(--line)] px-3 py-2"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              <button
                type="submit"
                disabled={busy}
                className="bg-[var(--leaf)] px-4 py-2.5 font-semibold text-white disabled:opacity-60"
              >
                {busy
                  ? "Working…"
                  : mode === "login"
                    ? "Log in"
                    : "Create free account"}
              </button>

              {mode === "login" ? (
                <p className="text-sm text-[var(--ink-muted)]">
                  No account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("register");
                      setError(null);
                    }}
                    className="font-semibold text-[var(--leaf-deep)] underline-offset-2 hover:underline"
                  >
                    Create an account
                  </button>
                </p>
              ) : (
                <p className="text-sm text-[var(--ink-muted)]">
                  Already have one?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                    }}
                    className="font-semibold text-[var(--leaf-deep)] underline-offset-2 hover:underline"
                  >
                    Log in
                  </button>
                </p>
              )}
            </form>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    name={user.displayName}
                    avatarUrl={user.avatarUrl}
                    size="lg"
                  />
                  <div>
                    <p className="font-semibold">{user.displayName}</p>
                    <p className="text-sm text-[var(--ink-muted)]">
                      {user.points} points · badges are flair only
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="text-sm text-[var(--ink-muted)] underline-offset-2 hover:underline"
                  >
                    Sign out
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteAccount()}
                    className="text-sm text-[var(--warn)] underline-offset-2 hover:underline disabled:opacity-60"
                  >
                    Delete account
                  </button>
                </div>
              </div>

              <div>
                <h3 className="font-semibold">Profile photo</h3>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  Optional. Shown next to your name in the top corner.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <label className="cursor-pointer border border-[var(--leaf)] px-3 py-1.5 text-sm font-semibold text-[var(--leaf-deep)]">
                    Choose photo
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        void saveAvatar(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {user.avatarUrl ? (
                    <button
                      type="button"
                      onClick={() => void saveAvatar(null)}
                      className="border border-[var(--line)] px-3 py-1.5 text-sm"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>

              {user.badges.length ? (
                <ul className="flex flex-wrap gap-2">
                  {user.badges.map((badge) => (
                    <li
                      key={badge.id}
                      title={badge.description}
                      className="border border-[var(--line)] bg-[#f7faf6] px-2.5 py-1.5 text-sm"
                    >
                      <span className="mr-1">{badge.flair}</span>
                      {badge.name}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div>
                <h3 className="font-semibold">Frequent items</h3>
                <textarea
                  value={frequentDraft}
                  onChange={(e) => setFrequentDraft(e.target.value)}
                  rows={4}
                  className="mt-2 w-full border border-[var(--line)] px-3 py-2 text-sm"
                  placeholder={"whole milk\neggs\ncoffee"}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveFrequent()}
                    className="border border-[var(--leaf)] px-3 py-1.5 text-sm font-semibold text-[var(--leaf-deep)]"
                  >
                    Save staples
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onApplyFrequentItems(user.frequentItems);
                      closeDialog();
                    }}
                    className="border border-[var(--line)] px-3 py-1.5 text-sm"
                    disabled={!user.frequentItems.length}
                  >
                    Add to list
                  </button>
                </div>
              </div>

              <div>
                <h3 className="font-semibold">Alerts</h3>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={user.alertPrefs.sales}
                    onChange={(e) => void toggleAlerts("sales", e.target.checked)}
                  />
                  Sales on my staples
                </label>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={user.alertPrefs.coupons}
                    onChange={(e) => void toggleAlerts("coupons", e.target.checked)}
                  />
                  Coupons on my staples
                </label>
                <ul className="mt-3 max-h-28 space-y-2 overflow-auto text-sm">
                  {alerts.slice(0, 4).map((alert) => (
                    <li key={alert.id} className="border-b border-[var(--line)] pb-2">
                      <p className="font-medium">{alert.title}</p>
                      <p className="text-[var(--ink-muted)]">{alert.storeName}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-semibold">Upload a receipt</h3>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  Photo capture saves metadata now; OCR line extract is a follow-up.
                  Paste priced lines to contribute crowd prices.
                </p>
                <input
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Store name"
                  className="mt-2 w-full border border-[var(--line)] px-3 py-2 text-sm"
                />
                <label className="mt-2 block text-sm font-medium">
                  Receipt photo
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="mt-1 block w-full text-sm"
                    onChange={(e) =>
                      onReceiptPhotoChange(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
                {receiptPhoto ? (
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    Attached: {receiptPhoto.name} ·{" "}
                    {Math.round(receiptPhoto.sizeBytes / 1024)} KB
                    <button
                      type="button"
                      className="ml-2 underline"
                      onClick={() => {
                        setReceiptPhoto(null);
                        if (photoInputRef.current) photoInputRef.current.value = "";
                      }}
                    >
                      Remove
                    </button>
                  </p>
                ) : null}
                <textarea
                  value={receiptText}
                  onChange={(e) => setReceiptText(e.target.value)}
                  rows={4}
                  placeholder={"Whole milk 3.49\nEggs · 2.99"}
                  className="mt-2 w-full border border-[var(--line)] px-3 py-2 font-mono text-sm"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void uploadReceipt()}
                  className="mt-2 bg-[var(--leaf)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "Uploading…" : "Upload receipt"}
                </button>
                {spending ? (
                  <p className="mt-2 text-sm text-[var(--ink-muted)]">
                    {spending.receiptCount} receipt
                    {spending.receiptCount === 1 ? "" : "s"} ·{" "}
                    {formatUsd(spending.totalSpentUsd)} logged
                    {receipts[0] ? ` · latest ${receipts[0].storeName}` : ""}
                    {receipts[0]?.imageMeta ? " · photo" : ""}
                  </p>
                ) : null}
              </div>
            </div>
          )}

          {message ? <p className="mt-4 text-sm text-[var(--sale)]">{message}</p> : null}
          {error ? <p className="mt-4 text-sm text-[var(--warn)]">{error}</p> : null}
        </div>
      </dialog>
    </>
  );
}

function UserAvatar({
  name,
  avatarUrl,
  size = "sm",
}: {
  name?: string;
  avatarUrl?: string | null;
  size?: "sm" | "lg";
}) {
  const dim = size === "lg" ? "h-12 w-12" : "h-8 w-8";
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name ? `${name} profile` : "Profile"}
        className={`${dim} rounded-full border border-[var(--line)] object-cover`}
      />
    );
  }
  return (
    <span
      className={`${dim} inline-flex items-center justify-center rounded-full border border-[var(--line)] bg-[#e8eee8] text-[var(--ink-muted)]`}
      aria-hidden={!name}
      title={name ? undefined : "Not signed in"}
    >
      <AnonymousUserIcon className={size === "lg" ? "h-7 w-7" : "h-5 w-5"} />
      <span className="sr-only">{name ? `${name} avatar` : "Anonymous user"}</span>
    </span>
  );
}

function AnonymousUserIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Zm0 1.75c-3.55 0-6.75 1.78-6.75 4v.75h13.5V17.75c0-2.22-3.2-4-6.75-4Z" />
    </svg>
  );
}

/** @deprecated use AccountMenu */
export const AccountPanel = AccountMenu;
