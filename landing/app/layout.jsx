import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "Grabify \u2014 The download manager, remade",
  description:
    "A fast, modern download manager for Windows. Splits every file across many connections so downloads finish sooner. Free to download; Pro is a one-time purchase.",
  openGraph: {
    title: "Grabify \u2014 the download manager, remade",
    description: "A fast, modern download manager for Windows. Free to download, Pro from $9.99 one-time.",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
