import "./globals.css";

export const metadata = {
  title: "Grabify \u2014 The download manager, remade",
  description:
    "A fast, modern download manager for Windows. Splits every file across many connections so downloads finish sooner. Free for Windows.",
  openGraph: {
    title: "Grabify \u2014 the download manager, remade",
    description: "A fast, modern download manager for Windows. Free.",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
