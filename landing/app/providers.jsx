"use client";

import { ClerkProvider } from "@clerk/clerk-react";

// Publishable key is public and safe in the client bundle. Read from the build
// env when present, else fall back to the configured key.
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  "pk_test_ZW5vdWdoLWRvYmVybWFuLTI1LmNsZXJrLmFjY291bnRzLmRldiQ";

export default function Providers({ children }) {
  return <ClerkProvider publishableKey={PUBLISHABLE_KEY}>{children}</ClerkProvider>;
}
