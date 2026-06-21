import { NextResponse } from "next/server";
import { getImageRoot, scanLibrary } from "@/lib/server-library";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const root = getImageRoot();
    const library = await scanLibrary(root);

    return NextResponse.json(library);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not scan the CFD image library.",
      },
      { status: 500 },
    );
  }
}
