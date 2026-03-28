import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SciVid AI — AI Science Video Generator',
  description: 'Generate professional science animation videos with AI. Upload a reference video, provide a topic, and get a fully rendered educational video.',
  other: {
    google: 'notranslate',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark notranslate" translate="no">
      <body className="antialiased min-h-screen notranslate">
        {children}
      </body>
    </html>
  );
}
