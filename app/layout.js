import "./globals.css";
import "@fontsource/tiktok-sans/latin-700.css";
import "@fontsource/tiktok-sans/latin-400.css";

export const metadata = {
  title: "Slideshows – Video Generator",
  description: "Generate stylized TikTok-style slideshow videos",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
