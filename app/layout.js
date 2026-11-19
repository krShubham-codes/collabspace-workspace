import './globals.css';

export const metadata = { title: 'CollabSpace', description: 'Real-time collaborative workspace' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
