import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppUpdaterProvider } from "@/components/app-updater-provider";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
<<<<<<< HEAD
import { DownloadProvider } from "@/contexts/download-context";
import { GlobalDownloadStatusBar } from "@/components/global-download-status-bar";
import { OllamaHealthProvider } from "@/contexts/ollama-health-context";
import { ServiceInterruptionOverlay } from "@/components/ui/service-interruption-overlay";
=======
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OllaHub",
  description: "Interface moderna para Ollama",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
<<<<<<< HEAD
          <OllamaHealthProvider>
            <DownloadProvider>
              <KeyboardShortcuts />
              {children}
              <AppUpdaterProvider />
              <GlobalDownloadStatusBar />
              <ServiceInterruptionOverlay />
            </DownloadProvider>
          </OllamaHealthProvider>
=======
          <KeyboardShortcuts />
          {children}
          <AppUpdaterProvider />
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
        </ThemeProvider>
      </body>
    </html>
  );
}
