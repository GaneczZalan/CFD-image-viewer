import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export type ImageItem = {
  name: string;
  url: string;
};

export type ImageCategory = {
  id: string;
  name: string;
  images: ImageItem[];
};

export type ImageCase = {
  id: string;
  name: string;
  categories: ImageCategory[];
};

export type ImageLibrary = {
  source: "server";
  rootName: string;
  cases: ImageCase[];
  scanDepth: number;
};

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);

export function isImageFile(fileName: string) {
  return imageExtensions.has(path.extname(fileName).toLowerCase());
}

export function getImageRoot() {
  return process.env.CFD_IMAGE_ROOT || path.join(process.cwd(), "images");
}

function sortNatural(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function getScanDepth() {
  const rawDepth = process.env.CFD_SCAN_DEPTH;
  const parsedDepth = rawDepth ? Number(rawDepth) : 4;

  if (!Number.isFinite(parsedDepth) || parsedDepth < 0) {
    return 4;
  }

  return Math.floor(parsedDepth);
}

function getScanTimeoutMs() {
  const rawTimeout = process.env.CFD_SCAN_TIMEOUT_MS;
  const parsedTimeout = rawTimeout ? Number(rawTimeout) : 15000;

  if (!Number.isFinite(parsedTimeout) || parsedTimeout < 1000) {
    return 15000;
  }

  return Math.floor(parsedTimeout);
}

function assertScanDeadline(deadline: number) {
  if (Date.now() > deadline) {
    throw new Error(
      "Image root scan timed out. Use a smaller -ScanDepth value or point -ImageRoot closer to the result folders.",
    );
  }
}

async function collectImageFolders(folder: string, root: string, cases: ImageCase[], depth: number, maxDepth: number, deadline: number) {
  assertScanDeadline(deadline);

  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (depth === 0) {
      throw error;
    }

    return;
  }
  const imageFiles = entries
    .filter((entry) => entry.isFile() && isImageFile(entry.name))
    .map((entry) => entry.name)
    .sort(sortNatural);

  if (imageFiles.length > 0) {
    const relativeFolder = path.relative(root, folder).split(path.sep).join("/");
    const caseId = relativeFolder === "" ? "__root__" : relativeFolder;
    const caseName = relativeFolder === "" ? path.basename(root) : relativeFolder;

    cases.push({
      id: caseId,
      name: caseName,
      categories: [
        {
          id: "__root__",
          name: "Images",
          images: imageFiles.map((fileName) => ({
            name: fileName,
            url: `/api/image?case=${encodeURIComponent(caseId)}&category=${encodeURIComponent("__root__")}&file=${encodeURIComponent(fileName)}`,
          })),
        },
      ],
    });
  }

  if (depth >= maxDepth) {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      await collectImageFolders(path.join(folder, entry.name), root, cases, depth + 1, maxDepth, deadline);
    }
  }
}

export async function scanLibrary(root: string): Promise<ImageLibrary> {
  const resolvedRoot = path.resolve(root);
  const rootStat = await stat(resolvedRoot);

  if (!rootStat.isDirectory()) {
    throw new Error(`CFD_IMAGE_ROOT is not a folder: ${resolvedRoot}`);
  }

  const cases: ImageCase[] = [];
  const scanDepth = getScanDepth();
  const deadline = Date.now() + getScanTimeoutMs();

  await collectImageFolders(resolvedRoot, resolvedRoot, cases, 0, scanDepth, deadline);
  cases.sort((a, b) => sortNatural(a.name, b.name));

  return {
    source: "server",
    rootName: path.basename(resolvedRoot),
    cases,
    scanDepth,
  };
}
