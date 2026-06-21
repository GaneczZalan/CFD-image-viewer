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

async function walkImages(folder: string, base: string, groups: Map<string, ImageItem[]>) {
  const entries = await readdir(folder, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(folder, entry.name);

    if (entry.isDirectory()) {
      await walkImages(fullPath, base, groups);
      continue;
    }

    if (!entry.isFile() || !isImageFile(entry.name)) {
      continue;
    }

    const relativeFolder = path.dirname(path.relative(base, fullPath));
    const category = relativeFolder === "." ? "__root__" : relativeFolder.split(path.sep).join("/");
    const items = groups.get(category) ?? [];
    items.push({
      name: entry.name,
      url: "",
    });
    groups.set(category, items);
  }
}

export async function scanLibrary(root: string): Promise<ImageLibrary> {
  const resolvedRoot = path.resolve(root);
  const rootStat = await stat(resolvedRoot);

  if (!rootStat.isDirectory()) {
    throw new Error(`CFD_IMAGE_ROOT is not a folder: ${resolvedRoot}`);
  }

  const entries = await readdir(resolvedRoot, { withFileTypes: true });
  const caseDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(sortNatural);

  const cases: ImageCase[] = [];

  for (const caseName of caseDirs) {
    const casePath = path.join(resolvedRoot, caseName);
    const groups = new Map<string, ImageItem[]>();
    await walkImages(casePath, casePath, groups);

    const categories = [...groups.entries()]
      .map(([category, images]) => ({
        id: category,
        name: category === "__root__" ? "Root" : category,
        images: images
          .sort((a, b) => sortNatural(a.name, b.name))
          .map((image) => ({
            ...image,
            url: `/api/image?case=${encodeURIComponent(caseName)}&category=${encodeURIComponent(category)}&file=${encodeURIComponent(image.name)}`,
          })),
      }))
      .sort((a, b) => sortNatural(a.name, b.name));

    if (categories.length > 0) {
      cases.push({
        id: caseName,
        name: caseName,
        categories,
      });
    }
  }

  return {
    source: "server",
    rootName: path.basename(resolvedRoot),
    cases,
  };
}
