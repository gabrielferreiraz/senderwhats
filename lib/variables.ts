import { getFirstName, formatTitleCase } from "@/lib/names"

type ContactLike = {
  name?: string | null
  phone: string
  variables?: Record<string, unknown> | null
}

export function applyVariables(template: string, contact: ContactLike): string {
  let result = template

  // Smart name variables — never fall back to phone number
  result = result.replace(/\{nome\}/gi, getFirstName(contact.name))
  result = result.replace(/\{primeiro_nome\}/gi, getFirstName(contact.name))
  result = result.replace(/\{nome_completo\}/gi, formatTitleCase(contact.name))
  result = result.replace(/\{nome_bruto\}/gi, contact.name ?? "")
  result = result.replace(/\{telefone\}/gi, contact.phone)

  if (contact.variables && typeof contact.variables === "object") {
    for (const [key, value] of Object.entries(contact.variables)) {
      // Escape regex special chars so keys like "email.domain" or "total(R$)" are treated literally
      const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const regex = new RegExp(`\\{${safeKey}\\}`, "gi")
      result = result.replace(regex, String(value ?? ""))
    }
  }

  return result
}
