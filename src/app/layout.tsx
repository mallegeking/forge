import type { Metadata, Viewport } from "next";
import { Archivo, Barlow_Condensed, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import { BottomTabBar } from "@/components/nav/bottom-tab-bar";

// "Ember" type system: Archivo (body/UI) + Barlow Condensed (display).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Forge",
  description: "Your personal training log.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Forge",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#15110d",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const dict = getDictionary(locale);

  // Dark mode only: the `dark` class is fixed on <html>.
  return (
    <html
      lang={locale}
      className={`${archivo.variable} ${barlowCondensed.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <I18nProvider dict={dict} locale={locale}>
          <div className="mx-auto w-full max-w-lg px-4 pt-5 pb-28">
            {children}
          </div>
          <BottomTabBar />
        </I18nProvider>
      </body>
    </html>
  );
}
