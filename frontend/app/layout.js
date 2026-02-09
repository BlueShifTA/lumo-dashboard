import "./globals.css";

export const metadata = {
  title: "App Template",
  description: "FastAPI + Next.js Template",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
