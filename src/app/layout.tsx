import type { Metadata, Viewport } from 'next';
import { Barlow, Bodoni_Moda } from 'next/font/google';
import './globals.css';
const bodyFont = Barlow({ subsets: ['latin'], weight: ['400', '500', '600'], style: 'normal', display: 'swap', variable: '--font-body' });
const titleFont = Bodoni_Moda({ subsets: ['latin'], weight: '500', style: 'normal', display: 'swap', variable: '--font-title' });
export const viewport: Viewport = { themeColor: '#401029', colorScheme: 'dark' };
export const metadata: Metadata = {
  title: 'Syd & Dan | Christmas lists',
  description: 'Christmas wish lists for Syd and Dan.',
  robots: { index: false, follow: false },
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en" className={`${bodyFont.variable} ${titleFont.variable}`}><body><a className="skip-link" href="#main-content">Skip to wish lists</a>{children}</body></html>;
}
