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

async function collectImageFolders(folder: string, root: string, cases: ImageCase[]) {
  const entries = await readdir(folder, { withFileTypes: true });
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

  for (const entry of entries) {
    if (entry.isDirectory()) {
      await collectImageFolders(path.join(folder, entry.name), root, cases);
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
  await collectImageFolders(resolvedRoot, resolvedRoot, cases);
  cases.sort((a, b) => sortNatural(a.name, b.name));

  return {
    source: "server",
    rootName: path.basename(resolvedRoot),
    cases,
  };
}
