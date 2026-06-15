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

export async function POST(req: NextRequest) {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Requisição inválida (esperado multipart/form-data)" }, { status: 400 })
  }

  const file = formData.get("file")
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Campo 'file' não encontrado" }, { status: 400 })
  }

  const ext = ALLOWED[(file as File).type]
  if (!ext) {
    return NextResponse.json(
      { error: "Formato não suportado. Imagens: JPEG, PNG, GIF, WebP. Áudios: OGG, MP3, WAV, WebM." },
      { status: 400 }
    )
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(await (file as File).arrayBuffer())
  } catch {
    return NextResponse.json({ error: "Falha ao ler o arquivo enviado" }, { status: 500 })
  }

  if (buffer.byteLength > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo muito grande. Máximo 16 MB." }, { status: 400 })
  }

  const filename = `${crypto.randomUUID()}.${ext}`

  try {
    mkdirSync(UPLOAD_DIR, { recursive: true })
    writeFileSync(join(UPLOAD_DIR, filename), buffer)
  } catch (err) {
    console.error("[upload] Falha ao gravar arquivo:", err)
    return NextResponse.json({ error: "Falha ao salvar arquivo no servidor." }, { status: 500 })
  }

  // Servido via /api/uploads/[filename] para garantir funcionamento em produção
  return NextResponse.json({ url: `/api/uploads/${filename}` }, { status: 201 })
}
