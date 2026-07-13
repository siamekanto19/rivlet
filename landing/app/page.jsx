"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser, useClerk, useAuth } from "@clerk/clerk-react";

// Paddle checkout config. These are sandbox values (client token is public and
// safe in the browser). For go-live, swap to the production token + price id and
// set environment to "production" (Track 4).
const PADDLE = {
  environment: "sandbox",
  clientToken: "test_89eb29f145561d3c5f4db7d4f60",
  priceId: "pri_01kxd3gkx1zk5ghgghq49qnk9x",
};

const PRICE = { launch: "$9.99", regular: "$12.99" };
const LICENSE_API = "https://grabify-licensing.siamekanto.workers.dev";
// Public installer asset. Kept under /public so Next.js serves it as a direct
// attachment without routing a 15 MB executable through application code.
const DOWNLOAD_URL = "/downloads/Grabify-Setup.exe";

const navLinks = [
  ["Features", "#features"],
  ["vs IDM", "#compare"],
  ["Pricing", "#pricing"],
  ["FAQ", "#faq"],
];

const featureCards = [
  {
    number: "01",
    title: "Genuinely fast",
    copy: "Each file is split into up to 32 parallel connections and reassembled — bit-for-bit identical, just finished sooner.",
  },
  {
    number: "02",
    title: "Modern & native",
    copy: "A clean Windows 11 app with real light and dark themes. Browser capture, clipboard monitoring, categories and resume all included.",
  },
  {
    number: "03",
    title: "Yours, not rented",
    copy: "Free to download and use. Pro is a one-time purchase — never a subscription — and stays ad-free, telemetry-free and un-throttled.",
  },
];

const comparisonRows = [
  ["Multi-connection acceleration", "Yes", "Yes", "yes"],
  ["Designed for Windows 11", "No", "Yes", "mixed"],
  ["True dark mode", "No", "Yes", "mixed"],
  ["Pricing", "Higher-priced license", "$12.99 lifetime", "text"],
  ["Nag screens & telemetry", "Yes", "None", "text"],
];

// Free vs Pro capability matrix. Cell values: true (included), false (not
// available), or a string (a specific limit).
const planRows = [
  ["HTTP, torrents, browser capture, categories, resume", true, true],
  ["Active downloads at once", "3", "16"],
  ["Connections per download", "4", "16"],
  ["Download queues", "Default only", "Unlimited"],
  ["Scheduling & completion actions", false, true],
  ["Bandwidth control", "Global", "Per-download & queue"],
  ["Custom proxy, host profiles, saved logins", false, true],
  ["Video", "Up to 720p", "Full resolution & formats"],
];

const faqs = [
  {
    question: "How much does it cost?",
    answer:
      "Grabify is free to download and use — the free tier covers everyday downloading with up to 3 downloads at once. Grabify Pro is a one-time " +
      PRICE.regular +
      " (" +
      PRICE.launch +
      " during launch) that lifts the limits and unlocks queues, scheduling, bandwidth control, proxy/auth and full-resolution video, on up to 3 of your Windows devices. No subscription, ever.",
  },
  {
    question: "Can I get a refund?",
    answer:
      "Yes. Pro comes with a 14-day money-back guarantee, handled by our payment provider Paddle. A refund or chargeback simply returns Grabify to the free tier — your settings and queued downloads are kept.",
  },
  {
    question: "How is it faster than my browser?",
    answer:
      "Your browser downloads over a single connection and rarely uses all your bandwidth. Grabify opens many at once — up to 32 — and pulls a different slice of the file down each, then reassembles them. On capable servers that's dramatically faster.",
  },
  {
    question: "What is Grabify for?",
    answer:
      "Everyday files you have the right to download: app installers, disk images, drivers, game files, datasets, archives, large documents and your own media. Please respect the terms of the sites you use and applicable copyright law.",
  },
  {
    question: "Does it work with Chrome and Edge?",
    answer:
      "Yes. Connect your browser once and Grabify captures downloads automatically as you click. Magnet links are handled too, and you can send any link from the right-click menu.",
  },
];

function Logo({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="4 4 16 16" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 9.99997L5 19" />
        <path d="M14.9999 19V13C14.9999 11.1144 14.9999 10.1716 14.4141 9.58579C13.8284 9 12.8856 9 10.9999 9H5" />
        <path d="M18.9999 19V15C18.9999 10.286 18.9999 7.92893 17.5355 6.46447C16.071 5 13.714 5 8.99994 5H5" />
      </g>
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function CheckIcon({ className = "h-[15px] w-[15px] flex-none text-fg" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function PlusMark() {
  return (
    <span className="relative h-5 w-5 flex-none transition-transform duration-200 group-open:rotate-90" aria-hidden="true">
      <span className="absolute left-1/2 top-[3px] h-3.5 w-[1.5px] -translate-x-1/2 rounded-sm bg-muted transition-opacity duration-200 group-open:opacity-0" />
      <span className="absolute left-[3px] top-1/2 h-[1.5px] w-3.5 -translate-y-1/2 rounded-sm bg-muted" />
    </span>
  );
}

// Renders a Free/Pro comparison cell from a boolean or a string limit.
function PlanCell({ value, pro }) {
  if (value === true) return <CheckIcon className={`h-[15px] w-[15px] ${pro ? "text-fg" : "text-muted"}`} />;
  if (value === false) return <span className="text-faint">—</span>;
  return <span className={pro ? "font-medium text-fg" : "text-muted"}>{value}</span>;
}

function useLandingEffects() {
  const [scrolled, setScrolled] = useState(false);
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    const root = document.documentElement;
    const saved = window.localStorage.getItem("grabify-theme");
    if (saved === "dark" || saved === "light") {
      root.setAttribute("data-theme", saved);
      setTheme(saved);
    }

    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );

    document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

    return () => {
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("grabify-theme", next);
    setTheme(next);
  };

  return { scrolled, theme, toggleTheme };
}

// Loads Paddle.js, wires the checkout.completed event to onCompleted (with the
// Paddle transaction id), and exposes a checkout opener for the Pro plan.
function usePaddle(onCompleted) {
  const [ready, setReady] = useState(false);
  const cbRef = useRef(onCompleted);
  cbRef.current = onCompleted;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const init = () => {
      try {
        if (PADDLE.environment === "sandbox") window.Paddle.Environment.set("sandbox");
        window.Paddle.Initialize({
          token: PADDLE.clientToken,
          eventCallback: (event) => {
            if (event?.name === "checkout.completed") {
              const txn = event?.data?.transaction_id || event?.data?.transactionId;
              if (txn && cbRef.current) cbRef.current(txn);
            }
          },
        });
        setReady(true);
      } catch (err) {
        console.error("Paddle init failed", err);
      }
    };
    if (window.Paddle) {
      init();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = init;
    document.body.appendChild(script);
  }, []);

  const openCheckout = () => {
    if (window.Paddle && ready) {
      window.Paddle.Checkout.open({ items: [{ priceId: PADDLE.priceId, quantity: 1 }] });
    }
  };

  return { ready, openCheckout };
}

const wrap = "mx-auto w-full max-w-page px-5 sm:px-7";
const buttonBase = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent font-sans font-semibold transition duration-150";
const buttonPrimary = `${buttonBase} bg-fg text-bg hover:opacity-85`;
const buttonGhost = `${buttonBase} border-hair-2 bg-transparent text-fg hover:bg-inset`;
const sectionPad = "py-24 md:py-[130px]";
const eyebrow = "text-[13px] font-medium tracking-[0.02em] text-muted";
const heading = "font-display font-medium leading-[1.1] tracking-normal text-balance";

export default function Home() {
  const { scrolled, theme, toggleTheme } = useLandingEffects();
  const { isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const clerk = useClerk();

  // Whether the signed-in user already owns Pro — so we don't offer to sell the
  // lifetime deal twice.
  const [hasPro, setHasPro] = useState(false);

  const fetchHasPro = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return false;
      const res = await fetch(`${LICENSE_API}/v1/account`, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) return false;
      const data = await res.json();
      return (data.licenses || []).some((l) => l.status === "active");
    } catch {
      return false;
    }
  }, [getToken]);

  useEffect(() => {
    let cancelled = false;
    if (!isSignedIn) {
      setHasPro(false);
      return;
    }
    fetchHasPro().then((owns) => {
      if (!cancelled) setHasPro(owns);
    });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, fetchHasPro]);

  // After a completed purchase, send the buyer to their dashboard where the
  // license key and devices live (no email, no on-screen key here).
  function handleCompleted() {
    try {
      window.Paddle?.Checkout?.close?.();
    } catch {}
    window.location.href = "/dashboard";
  }

  const { ready: paddleReady } = usePaddle(handleCompleted);

  // Gate purchase behind an account, and never sell the lifetime deal twice.
  // Already Pro → dashboard. Not signed in → Clerk sign-up. Signed in → Paddle
  // checkout carrying the account email + Clerk user id, so the webhook links
  // the license to this user.
  async function handleGetPro() {
    if (hasPro) {
      window.location.href = "/dashboard";
      return;
    }
    if (!isSignedIn) {
      clerk.openSignUp({ afterSignUpUrl: "/", afterSignInUrl: "/" });
      return;
    }
    if (!window.Paddle) return;
    // Final guard against double-buying the lifetime deal: re-check ownership
    // server-side right before opening checkout (covers the initial-load race
    // and any stale state).
    if (await fetchHasPro()) {
      setHasPro(true);
      window.location.href = "/dashboard";
      return;
    }
    const email = user?.primaryEmailAddress?.emailAddress;
    window.Paddle.Checkout.open({
      items: [{ priceId: PADDLE.priceId, quantity: 1 }],
      ...(email ? { customer: { email } } : {}),
      customData: { user_id: user.id },
    });
  }

  return (
    <>
      <nav
        id="nav"
        aria-label="Primary"
        className={`fixed inset-x-0 top-0 z-50 flex h-16 items-center border-b transition duration-200 ${
          scrolled ? "border-hair bg-bg/80 backdrop-blur-[14px] backdrop-saturate-[180%]" : "border-transparent bg-transparent"
        }`}
      >
        <div className={`${wrap} flex items-center gap-2`}>
          <a className="mr-auto flex items-center gap-[9px] font-sans text-[19px] font-bold tracking-[-0.02em] text-fg" href="#top" aria-label="Grabify home">
            <Logo />
            Grabify
          </a>
          <div className="hidden items-center gap-1 md:flex">
            {navLinks.map(([label, href]) => (
              <a key={href} className="rounded-lg px-3 py-2 text-[14.5px] font-normal text-muted transition hover:text-fg" href={href}>
                {label}
              </a>
            ))}
          </div>
          <button
            className="ml-0.5 grid h-[34px] w-[34px] place-items-center rounded-lg border-0 bg-transparent text-muted transition hover:text-fg"
            id="themeToggle"
            type="button"
            aria-label="Toggle light and dark"
            title="Toggle theme"
            onClick={toggleTheme}
          >
            {theme === "dark" ? <MoonIcon /> : <SunIcon />}
          </button>
          {isSignedIn ? (
            <div className="flex items-center gap-1.5">
              <a href="/dashboard" className={`${buttonGhost} px-[16px] py-[8px] text-[14px]`}>
                Dashboard
              </a>
              <button type="button" onClick={() => clerk.signOut()} className="rounded-lg px-2.5 py-2 text-[14px] text-muted transition hover:text-fg">
                Log out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => clerk.openSignIn({ afterSignInUrl: "/", afterSignUpUrl: "/" })}
              className={`${buttonGhost} px-[16px] py-[8px] text-[14px]`}
            >
              Log in
            </button>
          )}
          {!hasPro && (
            <a href="#pricing" className={`${buttonPrimary} px-[18px] py-[9px] text-[14.5px]`}>
              Get Pro
            </a>
          )}
        </div>
      </nav>

      <main id="top">
        <section className="relative pt-[120px] text-center sm:pt-[150px]">
          <div
            className="pointer-events-none absolute inset-x-0 top-[-90px] z-0 h-[680px] overflow-hidden [mask-image:radial-gradient(125%_84%_at_50%_0%,#000_40%,transparent_80%)] [-webkit-mask-image:radial-gradient(125%_84%_at_50%_0%,#000_40%,transparent_80%)]"
            aria-hidden="true"
          >
            <span className="beam absolute left-1/2 top-[-12%] h-[126%] w-[150px] -translate-x-1/2 rotate-[-32deg] [animation-delay:-.4s]" />
            <span className="beam absolute left-1/2 top-[-12%] h-[126%] w-[130px] -translate-x-1/2 rotate-[-16deg] [animation-delay:-2.6s]" />
            <span className="beam absolute left-1/2 top-[-12%] h-[126%] w-60 -translate-x-1/2 rotate-0 [animation-delay:-4.1s]" />
            <span className="beam absolute left-1/2 top-[-12%] h-[126%] w-[130px] -translate-x-1/2 rotate-[16deg] [animation-delay:-6.2s]" />
            <span className="beam absolute left-1/2 top-[-12%] h-[126%] w-[150px] -translate-x-1/2 rotate-[32deg] [animation-delay:-7.3s]" />
          </div>

          <div className={`${wrap} relative z-[1]`}>
            <h1 className={`${heading} mx-auto max-w-[15ch] text-[clamp(2.6rem,6.4vw,4.6rem)] leading-[1.06] tracking-[-0.01em]`}>
              The download manager, remade.
            </h1>
            <p className="mx-auto mt-[22px] max-w-[46ch] text-[clamp(1.05rem,1.5vw,1.24rem)] font-normal leading-[1.55] text-muted">
              Grabify splits every file across many connections, so downloads finish in a fraction of the time. Fast like IDM &mdash; without the interface from 2005.
            </p>
            <div className="mt-[34px] flex flex-wrap justify-center gap-[11px]">
              <a href={DOWNLOAD_URL} download="Grabify-Setup.exe" className={`${buttonPrimary} px-[26px] py-[13px] text-[15.5px]`}>
                Download for Windows
              </a>
              <a href="#pricing" className={`${buttonGhost} px-[26px] py-[13px] text-[15.5px]`}>
                See Free vs Pro
              </a>
            </div>
            <p className="mt-[18px] text-[13px] tabular-nums text-faint">Windows 10 &amp; 11 &middot; Free to download &middot; Pro from {PRICE.launch}</p>
          </div>

          <div className={`${wrap} relative z-[1] mt-[52px] sm:mt-[76px]`}>
            <div className="reveal in mx-auto max-w-[1000px] rounded-[28px] bg-[#0b0b0c] p-3.5 shadow-device">
              <div className="overflow-hidden rounded-2xl bg-screen-bg leading-none">
                <img
                  className={theme === "dark" ? "hidden" : "block h-auto w-full"}
                  src="/assets/app-light-padded.png"
                  width="1842"
                  height="1152"
                  decoding="async"
                  fetchPriority="high"
                  alt="The Grabify app on Windows — a clean download list with progress, categories and speeds."
                />
                <img
                  className={theme === "dark" ? "block h-auto w-full" : "hidden"}
                  src="/assets/app-dark-padded.png"
                  width="1838"
                  height="1150"
                  decoding="async"
                  alt="The Grabify app in dark mode."
                />
              </div>
            </div>
          </div>
        </section>

        <section className={sectionPad} id="features">
          <div className={wrap}>
            <div className="reveal max-w-[640px]">
              <span className={eyebrow}>Why Grabify</span>
              <h2 className={`${heading} mt-3.5 text-[clamp(1.9rem,3.6vw,2.7rem)]`}>Everything a download manager should be. Nothing it shouldn't.</h2>
            </div>
            <div className="reveal mt-16 grid border-t border-hair md:grid-cols-3">
              {featureCards.map((feature, index) => (
                <div
                  key={feature.number}
                  className={`border-hair py-[30px] md:border-r md:px-[34px] md:py-9 md:pb-10 ${
                    index === 0 ? "border-t md:border-t-0 md:pl-0" : "border-t md:border-t-0"
                  } ${index === featureCards.length - 1 ? "md:border-r-0 md:pr-0" : ""}`}
                >
                  <div className="font-mono text-xs tracking-[0.04em] text-faint">{feature.number}</div>
                  <h3 className={`${heading} mb-2.5 mt-3.5 text-[1.24rem]`}>{feature.title}</h3>
                  <p className="text-[14.5px] font-normal leading-[1.6] text-muted">{feature.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pb-24 md:pb-[130px]" id="compare">
          <div className={wrap}>
            <div className="reveal max-w-[640px]">
              <span className={eyebrow}>The switch</span>
              <h2 className={`${heading} mt-3.5 text-[clamp(1.9rem,3.6vw,2.7rem)]`}>You've used IDM for 20 years. It shows.</h2>
              <p className="mt-4 text-[1.08rem] font-normal leading-[1.6] text-muted">Grabify keeps the multi-connection speed you rely on and drops everything that makes IDM feel dated.</p>
            </div>
            <div className="reveal mt-14 overflow-hidden rounded-xl border border-hair">
              <div className="grid grid-cols-[1.3fr_.85fr_.85fr] items-center md:grid-cols-[1.4fr_1fr_1fr]">
                <div className="px-5 py-4 text-[13px] font-semibold uppercase tracking-[0.02em] text-muted">&nbsp;</div>
                <div className="px-5 py-4 text-[13px] font-semibold uppercase tracking-[0.02em] text-muted">IDM</div>
                <div className="border-l border-hair px-5 py-4 text-[13px] font-semibold uppercase tracking-[0.02em] text-fg">Grabify</div>
              </div>
              {comparisonRows.map(([feature, idm, grabify, tone]) => (
                <div key={feature} className="grid grid-cols-[1.3fr_.85fr_.85fr] items-center border-t border-hair md:grid-cols-[1.4fr_1fr_1fr]">
                  <div className="px-5 py-4 text-[14.5px] text-muted">{feature}</div>
                  <div className={`border-l border-hair px-5 py-4 text-[14.5px] tabular-nums ${tone === "mixed" ? "text-faint" : "text-fg"}`}>{idm}</div>
                  <div className="border-l border-hair px-5 py-4 text-[14.5px] font-medium tabular-nums text-fg">{grabify}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pb-24 md:pb-[130px]" id="pricing">
          <div className={wrap}>
            <div className="reveal mx-auto max-w-[560px] text-center">
              <span className={eyebrow}>Pricing</span>
              <h2 className={`${heading} mt-3.5 text-[clamp(1.9rem,3.6vw,2.7rem)]`}>Free to start. Pro when you need more.</h2>
              <p className="mt-3.5 text-[1.05rem] text-muted">A one-time purchase, not a subscription. No account needed to download or activate.</p>
            </div>

            {/* plan cards */}
            <div className="reveal mx-auto mt-14 grid max-w-[760px] gap-5 md:grid-cols-2">
              {/* Free */}
              <div className="flex flex-col rounded-2xl border border-hair p-7">
                <div className="text-[13px] font-semibold uppercase tracking-[0.03em] text-muted">Free</div>
                <div className="mt-3 font-display text-[3.2rem] font-medium leading-none">$0</div>
                <p className="mt-3 text-[14.5px] text-muted">Everything you need for everyday downloading.</p>
                <ul className="mt-6 flex flex-1 list-none flex-col gap-2.5 p-0">
                  {["Multi-connection acceleration", "Browser capture & torrents", "3 downloads, 4 connections each", "Video up to 720p"].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-muted">
                      <CheckIcon className="h-[15px] w-[15px] flex-none text-muted" />
                      {item}
                    </li>
                  ))}
                </ul>
                <a href={DOWNLOAD_URL} download="Grabify-Setup.exe" className={`${buttonGhost} mt-7 px-[22px] py-[12px] text-[15px]`}>
                  Download for Windows
                </a>
              </div>

              {/* Pro */}
              <div className="relative flex flex-col rounded-2xl border-2 border-fg p-7">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-semibold uppercase tracking-[0.03em] text-fg">Pro Lifetime</div>
                  <span className="rounded-full bg-fg px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.03em] text-bg">Launch price</span>
                </div>
                <div className="mt-3 flex items-end gap-2.5">
                  <span className="font-display text-[3.2rem] font-medium leading-none">{PRICE.launch}</span>
                  <span className="mb-1 text-[1.1rem] text-faint line-through">{PRICE.regular}</span>
                </div>
                <p className="mt-3 text-[14.5px] text-muted">One-time &middot; 3 Windows devices &middot; all 1.x updates.</p>
                <ul className="mt-6 flex flex-1 list-none flex-col gap-2.5 p-0">
                  {["16 downloads, 16 connections each", "Unlimited queues, scheduling, actions", "Per-download & per-queue speed limits", "Proxy, host profiles, saved logins", "Full-resolution video & format choice"].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-fg">
                      <CheckIcon className="h-[15px] w-[15px] flex-none text-fg" />
                      {item}
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={handleGetPro} disabled={!hasPro && !paddleReady} className={`${buttonPrimary} mt-7 px-[22px] py-[12px] text-[15px] disabled:opacity-60`}>
                  {hasPro ? "Open your dashboard" : !paddleReady ? "Loading checkout…" : isSignedIn ? "Get Grabify Pro" : "Sign up & get Pro"}
                </button>
                {hasPro && <p className="mt-2.5 text-center text-[13px] font-medium text-fg">✓ You already own Grabify Pro Lifetime</p>}
              </div>
            </div>

            <p className="reveal mx-auto mt-5 max-w-[560px] text-center text-[13px] text-faint">
              {PRICE.launch} launch price for the first 14 days, then {PRICE.regular}. 14-day money-back guarantee &middot; secure checkout by Paddle.
            </p>

            {/* full comparison */}
            <div className="reveal mx-auto mt-14 max-w-[760px] overflow-hidden rounded-xl border border-hair">
              <div className="grid grid-cols-[1.6fr_.7fr_.9fr] items-center md:grid-cols-[1.7fr_1fr_1fr]">
                <div className="px-5 py-3.5 text-[12px] font-semibold uppercase tracking-[0.02em] text-muted">Compare</div>
                <div className="border-l border-hair px-5 py-3.5 text-[12px] font-semibold uppercase tracking-[0.02em] text-muted">Free</div>
                <div className="border-l border-hair px-5 py-3.5 text-[12px] font-semibold uppercase tracking-[0.02em] text-fg">Pro</div>
              </div>
              {planRows.map(([feature, free, pro]) => (
                <div key={feature} className="grid grid-cols-[1.6fr_.7fr_.9fr] items-center border-t border-hair md:grid-cols-[1.7fr_1fr_1fr]">
                  <div className="px-5 py-3.5 text-[14px] text-muted">{feature}</div>
                  <div className="border-l border-hair px-5 py-3.5 text-[14px] tabular-nums">
                    <PlanCell value={free} pro={false} />
                  </div>
                  <div className="border-l border-hair px-5 py-3.5 text-[14px] tabular-nums">
                    <PlanCell value={pro} pro={true} />
                  </div>
                </div>
              ))}
            </div>

            <p className="reveal mx-auto mt-8 max-w-[600px] text-center text-[13px] leading-[1.6] text-faint">
              Grabify is a general-purpose download accelerator for files you have the right to download. Please respect the terms of the sites you use and applicable copyright law.
            </p>
          </div>
        </section>

        <section className="pb-24 md:pb-[130px]" id="faq">
          <div className={wrap}>
            <div className="reveal mx-auto max-w-[640px] text-center">
              <span className={eyebrow}>FAQ</span>
              <h2 className={`${heading} mt-3.5 text-[clamp(1.9rem,3.6vw,2.7rem)]`}>Good to know.</h2>
            </div>
            <div className="reveal mx-auto mt-14 max-w-[760px] border-t border-hair">
              {faqs.map((faq) => (
                <details key={faq.question} className="group border-b border-hair">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-5 px-0.5 py-[22px] font-display text-[1.12rem] font-medium [&::-webkit-details-marker]:hidden">
                    {faq.question}
                    <PlusMark />
                  </summary>
                  <div className="max-w-[66ch] px-0.5 pb-6 text-[14.5px] font-normal leading-[1.7] text-muted">{faq.answer}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="pb-10 pt-[120px] text-center">
          <div className={wrap}>
            <h2 className={`${heading} text-[clamp(2rem,4.4vw,3.2rem)]`}>Stop watching progress bars.</h2>
            <p className="mx-auto mb-[30px] mt-[18px] max-w-[40ch] text-[1.08rem] text-muted">The speed you loved about IDM, in an app built for Windows today.</p>
            <a href={DOWNLOAD_URL} download="Grabify-Setup.exe" className={`${buttonPrimary} px-[26px] py-[13px] text-[15.5px]`}>
              Download for Windows <span className="font-mono text-xs opacity-70 tabular-nums">Free</span>
            </a>
            <p className="mt-4 text-[13px] text-faint">Free to download &middot; Pro from {PRICE.launch} one-time</p>
          </div>
        </section>
      </main>

      <footer className="mt-20 border-t border-hair py-11">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-5 text-[13px] text-faint`}>
          <a className="flex items-center gap-[9px] font-sans text-base font-bold tracking-[-0.02em] text-muted" href="#top">
            <Logo />
            Grabify
          </a>
          <nav className="flex flex-wrap gap-5">
            {[
              ["Features", "#features"],
              ["Pricing", "#pricing"],
              ["FAQ", "#faq"],
              ["Contact", "mailto:hello@grabify.app"],
            ].map(([label, href]) => (
              <a key={href} href={href} className="text-muted hover:text-fg">
                {label}
              </a>
            ))}
          </nav>
          <span>&copy; 2026 Grabify &middot; Not affiliated with IDM / Tonec Inc.</span>
        </div>
      </footer>
    </>
  );
}
