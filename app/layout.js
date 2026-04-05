import "./globals.css";

export const metadata = {
  title: "Thrifty Slideshows – Video Generator",
  description: "Generate stylized TikTok-style slideshow videos",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
