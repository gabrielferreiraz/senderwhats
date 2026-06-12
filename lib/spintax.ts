export function processSpintax(text: string): string {
  return text.replace(/\{\[([^\]]+)\]\}/g, (_, options: string) => {
    const choices = options.split("|")
    return choices[Math.floor(Math.random() * choices.length)] ?? ""
  })
}
