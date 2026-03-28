import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SciVid AI — AI Science Video Generator',
  description: 'Generate professional science animation videos with AI. Upload a reference video, provide a topic, and get a fully rendered educational video.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
