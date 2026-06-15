import { NextRequest, NextResponse } from "next/server"
import { writeFileSync, mkdirSync, statSync } from "fs"
import { join } from "path"

const UPLOAD_DIR = join(process.cwd(), "public", "uploads")
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

// GET /api/uploads — diagnóstico: verifica se o diretório está acessível
export async function GET() {
  try {
    mkdirSync(UPLOAD_DIR, { recursive: true })
    const stat = statSync(UPLOAD_DIR)
    return NextResponse.json({
      ok: true,
      uploadDir: UPLOAD_DIR,
      isDirectory: stat.isDirectory(),
      cwd: process.cwd(),
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err), uploadDir: UPLOAD_DIR }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  console.log("[upload] POST recebido, content-type:", req.headers.get("content-type"))

  let formData: FormData
  try {
    formData = await req.formData()
    console.log("[upload] formData parsed OK, keys:", [...formData.keys()])
  } catch (err) {
    console.error("[upload] Falha ao parsear formData:", err)
    return NextResponse.json({ error: "Requisição inválida (esperado multipart/form-data)" }, { status: 400 })
  }

  const file = formData.get("file")
  if (!file || typeof file === "string") {
    console.error("[upload] Campo 'file' ausente ou inválido")
    return NextResponse.json({ error: "Campo 'file' não encontrado" }, { status: 400 })
  }

  console.log("[upload] arquivo recebido — type:", (file as File).type, "size:", (file as File).size)

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
    console.log("[upload] buffer lido OK, bytes:", buffer.byteLength)
  } catch (err) {
    console.error("[upload] Falha ao ler arrayBuffer:", err)
    return NextResponse.json({ error: "Falha ao ler o arquivo enviado" }, { status: 500 })
  }

  if (buffer.byteLength > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo muito grande. Máximo 16 MB." }, { status: 400 })
  }

  const filename = `${crypto.randomUUID()}.${ext}`

  try {
    mkdirSync(UPLOAD_DIR, { recursive: true })
    writeFileSync(join(UPLOAD_DIR, filename), buffer)
    console.log("[upload] arquivo salvo:", join(UPLOAD_DIR, filename))
  } catch (err) {
    console.error("[upload] Falha ao gravar arquivo:", err)
    return NextResponse.json(
      { error: "Falha ao salvar arquivo no servidor." },
      { status: 500 }
    )
  }

  return NextResponse.json({ url: `/uploads/${filename}` }, { status: 201 })
}
