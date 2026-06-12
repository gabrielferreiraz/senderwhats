import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { LayoutShell } from "@/components/layout/LayoutShell"
import { ThemeProvider } from "@/components/ThemeProvider"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "SenderWhats",
  description: "Sistema profissional de disparo e agendamento de mensagens WhatsApp",
  viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased overflow-hidden">
        <ThemeProvider>
          <LayoutShell>{children}</LayoutShell>
        </ThemeProvider>
      </body>
    </html>
  )
}
