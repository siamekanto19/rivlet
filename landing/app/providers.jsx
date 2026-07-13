"use client";

import { ClerkProvider } from "@clerk/clerk-react";

// Publishable key is public and safe in the client bundle. Read from the build
// env when present, else fall back to the configured key.
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  "pk_test_ZW5vdWdoLWRvYmVybWFuLTI1LmNsZXJrLmFjY291bnRzLmRldiQ";

// clerk.rivlet.pro is not live yet. These values intentionally target the
// managed Clerk instance until the custom domain has DNS plus a working Clerk
// proxy route; using the old live key would send API requests to that hostname.
const CLERK_JS_URL =
  "https://enough-doberman-25.clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js";
const CLERK_API_URL = "https://enough-doberman-25.clerk.accounts.dev";

export default function Providers({ children }) {
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      clerkJSUrl={CLERK_JS_URL}
      proxyUrl={CLERK_API_URL}
    >
      {children}
    </ClerkProvider>
  );
}
