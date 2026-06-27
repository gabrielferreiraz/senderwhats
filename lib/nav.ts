import {
  LayoutDashboard,
  Smartphone,
  Users,
  Megaphone,
  FileCode,
  MessageCircle,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  href: string
  label: string
  Icon: LucideIcon
}

export const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/instancias", label: "Instâncias", Icon: Smartphone },
  { href: "/contatos", label: "Contatos", Icon: Users },
  { href: "/campanhas", label: "Campanhas", Icon: Megaphone },
  { href: "/scripts", label: "Scripts", Icon: FileCode },
  { href: "/chat", label: "Chat", Icon: MessageCircle },
]
