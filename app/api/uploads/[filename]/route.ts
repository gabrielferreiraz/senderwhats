import { NextRequest, NextResponse } from "next/server"
import { readFileSync } from "fs"
import { join, extname } from "path"
import { UPLOAD_DIR } from "../route"

const MIME: Record<string, string> = {
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".ogg":  "audio/ogg",
  ".mp3":  "audio/mpeg",
  ".wav":  "audio/wav",
  ".webm": "audio/webm",
}

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params

  if (!filename || filename.includes("/") || filename.includes("..") || filename.includes("\\")) {
    return new NextResponse("Not found", { status: 404 })
  }

  let buffer: Buffer
  try {
    buffer = readFileSync(join(UPLOAD_DIR, filename))
  } catch {
    return new NextResponse("Not found", { status: 404 })
  }

  const contentType = MIME[extname(filename).toLowerCase()] ?? "application/octet-stream"

  return new NextResponse(buffer.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
