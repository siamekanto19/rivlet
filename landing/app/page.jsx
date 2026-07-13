"use client";

import { useEffect, useState } from "react";

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
    copy: "Each file is split into up to 32 parallel connections and reassembled \u2014 bit-for-bit identical, just finished sooner.",
  },
  {
    number: "02",
    title: "Modern & native",
    copy: "A clean Windows 11 app with real light and dark themes. Browser capture, clipboard monitoring, categories and resume all included.",
  },
  {
    number: "03",
    title: "Free & yours",
    copy: "Completely free \u2014 no subscription, no ads, no telemetry, no nag screens. Download it and go.",
  },
];

const comparisonRows = [
  ["Multi-connection acceleration", "Yes", "Yes", "yes"],
  ["Designed for Windows 11", "No", "Yes", "mixed"],
  ["True dark mode", "No", "Yes", "mixed"],
  ["Pricing", "Per major version", "Free", "text"],
  ["Nag screens & telemetry", "Yes", "None", "text"],
];

const priceItems = ["Every feature included", "Free updates", "Browser integration", "No ads or telemetry"];

const faqs = [
  {
    question: "How much does it cost?",
    answer:
      "Grabify is free. No subscription, no fee, no account \u2014 download it and use every feature. There are no ads and no telemetry.",
  },
  {
    question: "How is it faster than my browser?",
    answer:
      "Your browser downloads over a single connection and rarely uses all your bandwidth. Grabify opens many at once \u2014 up to 32 \u2014 and pulls a different slice of the file down each, then reassembles them. On capable servers that's dramatically faster.",
  },
  {
    question: "Does it work with Chrome and Edge?",
    answer:
      "Yes. Connect your browser once and Grabify captures downloads automatically as you click. Magnet links are handled too, and you can send any link from the right-click menu.",
  },
  {
    question: "What is Grabify for?",
    answer:
      "Everyday files: app installers, disk images, drivers, game files, datasets, archives and large documents. Anything your browser can download, Grabify downloads faster and can resume if interrupted.",
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

function CheckIcon() {
  return (
    <svg className="h-[15px] w-[15px] flex-none text-fg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

const wrap = "mx-auto w-full max-w-page px-5 sm:px-7";
const buttonBase = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent font-sans font-semibold transition duration-150";
const buttonPrimary = `${buttonBase} bg-fg text-bg hover:opacity-85`;
const buttonGhost = `${buttonBase} border-hair-2 bg-transparent text-fg hover:bg-inset`;
const sectionPad = "py-24 md:py-[130px]";
const eyebrow = "text-[13px] font-medium tracking-[0.02em] text-muted";
const heading = "font-display font-medium leading-[1.1] tracking-normal text-balance";

export default function Home() {
  const { scrolled, theme, toggleTheme } = useLandingEffects();

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
          <a href="#pricing" className={`${buttonPrimary} px-[18px] py-[9px] text-[14.5px]`}>
            Download
          </a>
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
              <a href="#pricing" className={`${buttonPrimary} px-[26px] py-[13px] text-[15.5px]`}>
                Download for Windows
              </a>
              <a href="#features" className={`${buttonGhost} px-[26px] py-[13px] text-[15.5px]`}>
                See how it works
              </a>
            </div>
            <p className="mt-[18px] text-[13px] tabular-nums text-faint">Free &middot; Windows 10 &amp; 11 &middot; No account needed</p>
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
                  alt="The Grabify app on Windows \u2014 a clean download list with progress, categories and speeds."
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
              <div className="mt-2 font-display text-[clamp(4rem,9vw,6rem)] font-medium leading-[.9] tracking-[-0.01em]">Free</div>
              <p className="mt-3.5 text-[1.05rem] text-muted">No cost. No catch. No account.</p>
              <a href="#" className={`${buttonPrimary} mt-[30px] px-[26px] py-[13px] text-[15.5px]`}>
                Download for Windows
              </a>
              <p className="mt-4 text-[13px] text-faint">Free for Windows 10 &amp; 11 &middot; No sign-up, no card required</p>
              <ul className="mt-[38px] flex list-none flex-wrap justify-center gap-x-[22px] gap-y-2.5 p-0">
                {priceItems.map((item) => (
                  <li key={item} className="inline-flex items-center gap-2 text-sm text-muted">
                    <CheckIcon />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
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
            <a href="#pricing" className={`${buttonPrimary} px-[26px] py-[13px] text-[15.5px]`}>
              Download for Windows <span className="font-mono text-xs opacity-70 tabular-nums">Free</span>
            </a>
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
