"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, useUser, useClerk, SignedIn, SignedOut } from "@clerk/clerk-react";

const LICENSE_API = "https://grabify-licensing.siamekanto.workers.dev";

const wrap = "mx-auto w-full max-w-[720px] px-5 sm:px-7";
const heading = "font-display font-medium tracking-normal";
const btnBase = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent font-sans font-semibold transition duration-150";
const btnPrimary = `${btnBase} bg-fg text-bg hover:opacity-85`;
const btnGhost = `${btnBase} border-hair-2 bg-transparent text-fg hover:bg-inset`;

function Logo() {
  return (
    <svg className="h-5 w-5" viewBox="4 4 16 16" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 9.99997L5 19" />
        <path d="M14.9999 19V13C14.9999 11.1144 14.9999 10.1716 14.4141 9.58579C13.8284 9 12.8856 9 10.9999 9H5" />
        <path d="M18.9999 19V15C18.9999 10.286 18.9999 7.92893 17.5355 6.46447C16.071 5 13.714 5 8.99994 5H5" />
      </g>
    </svg>
  );
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function useSavedTheme() {
  useEffect(() => {
    const saved = window.localStorage.getItem("grabify-theme");
    if (saved === "dark" || saved === "light") document.documentElement.setAttribute("data-theme", saved);
  }, []);
}

export default function DashboardPage() {
  useSavedTheme();
  return (
    <>
      <SignedIn>
        <Dashboard />
      </SignedIn>
      <SignedOut>
        <Gate />
      </SignedOut>
    </>
  );
}

function Gate() {
  const clerk = useClerk();
  return (
    <main className={`${wrap} flex min-h-screen flex-col items-center justify-center text-center`}>
      <h1 className={`${heading} text-[1.8rem]`}>Sign in to your dashboard</h1>
      <p className="mt-2 text-[15px] text-muted">Manage your Grabify Pro license and devices.</p>
      <div className="mt-6 flex gap-2.5">
        <button type="button" onClick={() => clerk.openSignIn({ afterSignInUrl: "/dashboard" })} className={`${btnPrimary} px-[22px] py-[11px] text-[15px]`}>
          Log in
        </button>
        <a href="/" className={`${btnGhost} px-[22px] py-[11px] text-[15px]`}>
          Back to site
        </a>
      </div>
    </main>
  );
}

function Dashboard() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const clerk = useClerk();

  const [state, setState] = useState({ loading: true, error: "", licenses: [] });
  const [revealed, setRevealed] = useState({});
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(
    async (poll = false) => {
      try {
        const token = await getToken();
        const attempts = poll ? 8 : 1;
        for (let i = 0; i < attempts; i++) {
          const res = await fetch(`${LICENSE_API}/v1/account`, { headers: { authorization: `Bearer ${token}` } });
          if (res.ok) {
            const data = await res.json();
            if (data.licenses?.length || !poll) {
              setState({ loading: false, error: "", licenses: data.licenses || [] });
              return;
            }
          } else if (!poll) {
            setState({ loading: false, error: "Couldn't load your account. Please try again.", licenses: [] });
            return;
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        setState({ loading: false, error: "", licenses: [] });
      } catch {
        setState({ loading: false, error: "Couldn't load your account. Please try again.", licenses: [] });
      }
    },
    [getToken],
  );

  useEffect(() => {
    // Poll on first load so a just-completed purchase shows up once the webhook lands.
    const justPurchased = typeof document !== "undefined" && document.referrer.includes("paddle");
    load(justPurchased);
  }, [load]);

  async function copyKey(id, key) {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(id);
      setTimeout(() => setCopied(""), 1800);
    } catch {}
  }

  async function deactivate(licenseId, deviceId) {
    setBusy(deviceId);
    try {
      const token = await getToken();
      await fetch(`${LICENSE_API}/v1/account/deactivate`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ licenseId, deviceId }),
      });
      await load(false);
    } catch {}
    setBusy("");
  }

  return (
    <main className="min-h-screen pb-24">
      <nav className="flex h-16 items-center border-b border-hair">
        <div className={`${wrap} flex items-center gap-2`}>
          <a href="/" className="mr-auto flex items-center gap-[9px] font-sans text-[18px] font-bold tracking-[-0.02em] text-fg">
            <Logo />
            Grabify
          </a>
          <span className="hidden text-[14px] text-muted sm:inline">{user?.primaryEmailAddress?.emailAddress}</span>
          <button type="button" onClick={() => clerk.signOut({ redirectUrl: "/" })} className="rounded-lg px-3 py-2 text-[14px] text-muted transition hover:text-fg">
            Log out
          </button>
        </div>
      </nav>

      <div className={`${wrap} pt-12`}>
        <h1 className={`${heading} text-[2rem]`}>Your account</h1>
        <p className="mt-1.5 text-[15px] text-muted">Manage your Grabify Pro license and devices.</p>

        {state.loading && (
          <div className="mt-10 flex items-center gap-3 text-muted">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-hair-2 border-t-fg" aria-hidden="true" />
            Loading your account&hellip;
          </div>
        )}

        {!state.loading && state.error && <p className="mt-8 text-[14.5px] text-[#d64545]">{state.error}</p>}

        {!state.loading && !state.error && state.licenses.length === 0 && (
          <div className="mt-10 rounded-2xl border border-hair p-8 text-center">
            <h2 className={`${heading} text-[1.4rem]`}>No Pro license yet</h2>
            <p className="mx-auto mt-2 max-w-[42ch] text-[14.5px] text-muted">You&rsquo;re signed in, but haven&rsquo;t purchased Grabify Pro. Get it to unlock every feature on up to 3 devices.</p>
            <a href="/#pricing" className={`${btnPrimary} mt-6 px-[22px] py-[11px] text-[15px]`}>
              Get Grabify Pro
            </a>
          </div>
        )}

        {!state.loading &&
          state.licenses.map((lic) => (
            <div key={lic.licenseId} className="mt-10 flex flex-col gap-8">
              {/* license */}
              <section className="rounded-2xl border border-hair p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className={`${heading} text-[1.2rem]`}>Grabify Pro Lifetime</div>
                    <div className="mt-0.5 text-[13.5px] text-muted">Purchased {fmtDate(lic.createdAt)} · covers Grabify {lic.versionScope || "1.x"}</div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.02em] ${lic.status === "active" ? "bg-fg text-bg" : "bg-inset text-muted"}`}>
                    {lic.status === "active" ? "Active" : lic.status}
                  </span>
                </div>

                <div className="mt-6">
                  <div className="text-[13px] font-medium tracking-[0.02em] text-muted">Your license key</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-xl border border-hair-2 bg-inset p-2.5">
                    <code className="flex-1 select-all break-all px-1 font-mono text-[15px] text-fg">
                      {revealed[lic.licenseId] ? lic.licenseKey || "unavailable" : "GRBFY-••••-••••-••••"}
                    </code>
                    <button type="button" onClick={() => setRevealed((r) => ({ ...r, [lic.licenseId]: !r[lic.licenseId] }))} className={`${btnGhost} px-3 py-1.5 text-[13px]`}>
                      {revealed[lic.licenseId] ? "Hide" : "Reveal"}
                    </button>
                    <button type="button" onClick={() => copyKey(lic.licenseId, lic.licenseKey)} disabled={!lic.licenseKey} className={`${btnPrimary} px-3 py-1.5 text-[13px] disabled:opacity-50`}>
                      {copied === lic.licenseId ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="mt-2.5 text-[13.5px] leading-[1.6] text-muted">
                    Open <span className="font-medium text-fg">Grabify → Settings → License</span>, paste this key and click <span className="font-medium text-fg">Activate</span>.
                  </p>
                </div>
              </section>

              {/* devices */}
              <section className="rounded-2xl border border-hair p-6">
                <div className="flex items-center justify-between">
                  <div className={`${heading} text-[1.05rem]`}>Devices</div>
                  <span className="text-[13.5px] text-muted">
                    {(lic.devices || []).length} of {lic.deviceLimit} used
                  </span>
                </div>
                {(lic.devices || []).length === 0 ? (
                  <p className="mt-3 text-[14px] text-muted">No devices activated yet. Activate Grabify on a PC with your key.</p>
                ) : (
                  <ul className="mt-4 flex list-none flex-col gap-2 p-0">
                    {lic.devices.map((d) => (
                      <li key={d.deviceId} className="flex items-center justify-between rounded-xl border border-hair px-4 py-3">
                        <div>
                          <div className="text-[14.5px] font-medium text-fg">{d.name || "Windows PC"}</div>
                          <div className="text-[12.5px] text-muted">Activated {fmtDate(d.activatedAt)}</div>
                        </div>
                        <button type="button" onClick={() => deactivate(lic.licenseId, d.deviceId)} disabled={busy === d.deviceId} className="rounded-lg border border-hair-2 px-3 py-1.5 text-[13px] font-semibold text-[#d64545] transition hover:bg-inset disabled:opacity-50">
                          {busy === d.deviceId ? "Removing…" : "Deactivate"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-[12.5px] text-muted">Deactivating frees a slot so you can activate another device.</p>
              </section>
            </div>
          ))}
      </div>
    </main>
  );
}
