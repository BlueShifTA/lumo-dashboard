import "./globals.css";

export const metadata = {
  title: "Lumo Dashboard",
  description: "Eco Robot Arm + Camera Dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
