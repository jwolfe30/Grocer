// Registers two throwaway accounts on the target. Expects a production build (dev login must 404).
const BASE = process.env.GROCER_BASE_URL ?? "http://localhost:3000";
let failed = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failed++;
};
const j = (token) => ({
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});
const stamp = Date.now();

async function register(tag) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: j(),
    body: JSON.stringify({ email: `sec-${tag}-${stamp}@example.com`, password: "secret123", zip: "98042" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`register ${tag}: ${res.status} ${JSON.stringify(data)}`);
  return data.token;
}

const dev = await fetch(`${BASE}/api/auth/dev`, { method: "POST", headers: j(), body: "{}" });
check("dev login hidden in production build", dev.status === 404, `status ${dev.status}`);

const a = await register("a");
const b = await register("b");

const create = await fetch(`${BASE}/api/lists`, {
  method: "POST",
  headers: j(a),
  body: JSON.stringify({ name: "A list", zip: "98042", items: [{ query: "milk", quantity: 1 }] }),
});
const created = await create.json();
const id = created.list?.id;
// Ensure ownership regardless of whether POST claims: owner PATCH claims it.
const claim = await fetch(`${BASE}/api/lists/${id}`, { method: "PATCH", headers: j(a), body: JSON.stringify({ name: "A list" }) });
const claimed = await claim.json();
check("owner can PATCH and owns list", claim.ok && Boolean(claimed.list?.userId), `status ${claim.status}`);

for (const [label, token] of [["anonymous", null], ["other user", b]]) {
  const g = await fetch(`${BASE}/api/lists/${id}`, { headers: j(token) });
  check(`${label} GET owned list -> 404`, g.status === 404, `status ${g.status}`);
  const p = await fetch(`${BASE}/api/lists/${id}`, { method: "PATCH", headers: j(token), body: JSON.stringify({ name: "hijacked" }) });
  check(`${label} PATCH owned list -> 404`, p.status === 404, `status ${p.status}`);
  const o = await fetch(`${BASE}/api/lists/${id}/optimize`, { method: "POST", headers: j(token), body: "{}" });
  check(`${label} optimize owned list -> 404`, o.status === 404, `status ${o.status}`);
  const m = await fetch(`${BASE}/api/lists/${id}/match`, { method: "POST", headers: j(token), body: "{}" });
  check(`${label} match owned list -> 404`, m.status === 404, `status ${m.status}`);
}

const ownerGet = await fetch(`${BASE}/api/lists/${id}`, { headers: j(a) });
const ownerData = await ownerGet.json();
check("owner GET still works and name unchanged", ownerGet.ok && ownerData.list?.name === "A list", `status ${ownerGet.status}`);

const devCreate = await fetch(`${BASE}/api/lists`, {
  method: "POST",
  headers: j(),
  body: JSON.stringify({ name: "Device list", zip: "98042", items: [{ query: "eggs", quantity: 1 }] }),
});
const devList = (await devCreate.json()).list;
const devGet = await fetch(`${BASE}/api/lists/${devList.id}`);
check("device list still readable by id without login", devGet.ok, `status ${devGet.status}`);

const me = await fetch(`${BASE}/api/account`, { headers: j(a) });
check("fresh session accepted", me.ok, `status ${me.status}`);
const bogus = await fetch(`${BASE}/api/account`, { headers: j("not-a-real-token") });
check("bogus token rejected", bogus.status === 401 || bogus.status === 403, `status ${bogus.status}`);

console.log(failed ? `\n${failed} check(s) failed` : "\nAll security checks passed");
process.exit(failed ? 1 : 0);
