import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { Providers } from "./providers";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Veilend — Private Credit against Uniswap v4 LP",
  description:
    "Borrow stablecoins against your Uniswap v4 LP positions without unwinding them. Personalized LTV and APR are computed privately in a Chainlink CRE Confidential Workflow (TEE).",
  keywords: [
    "Uniswap v4",
    "Chainlink CRE",
    "Confidential Workflows",
    "TEE",
    "DeFi Lending",
    "LP Collateral",
    "ETHOnline 2026",
    "v4 Hook",
  ],
  openGraph: {
    title: "Veilend — Private Credit against Uniswap v4 LP",
    description:
      "Keep the yield. Unlock instant liquidity. Borrow against Uniswap v4 LP positions with confidential risk scoring inside Chainlink CRE enclaves.",
    type: "website",
    siteName: "Veilend",
  },
  twitter: {
    card: "summary_large_image",
    title: "Veilend — Private Credit against Uniswap v4 LP",
    description:
      "Keep the yield. Unlock instant liquidity. Borrow against Uniswap v4 LP positions with confidential risk scoring inside Chainlink CRE enclaves.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
