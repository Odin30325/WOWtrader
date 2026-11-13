import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forever Market Audit — Inteligencia de Mercado y Arbitraje Intradía (WoW: Forever)",
  description:
    "Plataforma híbrida de auditoría de mercado y arbitraje intradía para World of Warcraft: Forever (1.60.1_70399 | Interface 106001).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-[#060a12] text-slate-100 antialiased selection:bg-sky-500/30 selection:text-sky-200">
        {children}
      </body>
    </html>
  );
}
