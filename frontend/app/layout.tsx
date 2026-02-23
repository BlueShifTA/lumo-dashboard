import "./globals.css";
import type { Metadata } from "next";

import { AppProviders } from "@/src/app/providers/AppProviders";

export const metadata: Metadata = {
  title: "Lumo Dashboard",
  description: "Eco Robot Arm + Camera Dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
