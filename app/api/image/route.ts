import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getImageRoot, isImageFile } from "@/lib/server-library";

export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

function isInside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function GET(request: NextRequest) {
  const caseName = request.nextUrl.searchParams.get("case");
  const category = request.nextUrl.searchParams.get("category");
  const file = request.nextUrl.searchParams.get("file");

  if (!caseName || !category || !file || !isImageFile(file)) {
    return NextResponse.json({ error: "Missing or invalid image parameters." }, { status: 400 });
  }

  const root = path.resolve(getImageRoot());
  const imagePath = path.resolve(
    root,
    caseName === "__root__" ? "" : caseName,
    file,
  );

  if (!isInside(root, imagePath)) {
    return NextResponse.json({ error: "Image path escapes the configured root." }, { status: 400 });
  }

  try {
    await stat(imagePath);
    const image = await readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();

    return new NextResponse(image, {
      headers: {
        "Content-Type": contentTypes[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }
}
