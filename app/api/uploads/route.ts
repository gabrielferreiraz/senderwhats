import { NextRequest, NextResponse } from "next/server"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"

export const UPLOAD_DIR = join(process.cwd(), "public", "uploads")
const MAX_SIZE = 16 * 1024 * 1024 // 16 MB

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg":  "jpg",
  "image/png":  "png",
  "image/gif":  "gif",
  "image/webp": "webp",
  "audio/ogg":  "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3":  "mp3",
  "audio/wav":  "wav",
  "audio/webm": "webm",
}

// POST /api/uploads?type=image/png — body é o arquivo em binário puro
export async function POST(req: NextRequest) {
  const mimeType = req.nextUrl.searchParams.get("type") ?? req.headers.get("content-type") ?? ""
  const ext = ALLOWED[mimeType.split(";")[0]!.trim()]

  if (!ext) {
    return NextResponse.json(
      { error: "Formato não suportado. Imagens: JPEG, PNG, GIF, WebP. Áudios: OGG, MP3, WAV, WebM." },
      { status: 400 }
    )
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(await req.arrayBuffer())
  } catch (err) {
    console.error("[upload] Falha ao ler body:", err)
    return NextResponse.json({ error: "Falha ao ler o arquivo enviado" }, { status: 500 })
  }

  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "Arquivo vazio" }, { status: 400 })
  }

  if (buffer.byteLength > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo muito grande. Máximo 16 MB." }, { status: 400 })
  }

  const filename = `${crypto.randomUUID()}.${ext}`

  try {
    mkdirSync(UPLOAD_DIR, { recursive: true })
    writeFileSync(join(UPLOAD_DIR, filename), buffer)
    console.log("[upload] salvo:", filename, `(${buffer.byteLength} bytes)`)
  } catch (err) {
    console.error("[upload] Falha ao gravar arquivo:", err)
    return NextResponse.json({ error: "Falha ao salvar arquivo no servidor." }, { status: 500 })
  }

  return NextResponse.json({ url: `/api/uploads/${filename}` }, { status: 201 })
}
