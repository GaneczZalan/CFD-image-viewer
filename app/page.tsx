"use client";

import { ChangeEvent, PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Eraser, FolderOpen, Maximize2, Minimize2, Minus, Pencil, RotateCcw, Square, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";

// Firefox ESR / Windows Server polyfill
if (typeof crypto !== "undefined" && typeof crypto.randomUUID !== "function") {
  /** @ts-expect-error - override built-in type */
  crypto.randomUUID = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    return (
      hex.slice(0, 8) +
      "-" +
      hex.slice(8, 12) +
      "-" +
      hex.slice(12, 16) +
      "-" +
      hex.slice(16, 20) +
      "-" +
      hex.slice(20)
    );
  };
}

type ImageItem = {
  name: string;
  url: string;
};

type ImageCategory = {
  id: string;
  name: string;
  images: ImageItem[];
};

type ImageCase = {
  id: string;
  name: string;
  categories: ImageCategory[];
};

type ImageLibrary = {
  source: "server" | "local";
  rootName: string;
  cases: ImageCase[];
};

type Slot = {
  id: string;
  caseId: string;
  label: string;
};

type Theme = "light" | "dark";
type TimingMode = "fps" | "frame" | "total";
type StillFormat = "png" | "jpeg" | "webp";
type AnimationFormat = "webm" | "mp4";
type DrawTool = "none" | "pencil" | "arrow" | "line" | "rect" | "roundRect" | "eraser";
type Point = { x: number; y: number };
type DrawTargets = "all" | string[];
type TargetMode = "source" | "all" | "custom";
type Annotation = {
  id: string;
  slotId: string;
  targets: DrawTargets;
  tool: Exclude<DrawTool, "none" | "eraser">;
  color: string;
  points: Point[];
};

const maxSlots = 4;

function makeSlot(caseItem: ImageCase): Slot {
  return {
    id: crypto.randomUUID(),
    caseId: caseItem.id,
    label: caseItem.name,
  };
}

function naturalSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function getFrameMatchName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const frameMatch = baseName.match(/(\d+)$/);

  return frameMatch?.[1] ?? baseName;
}

function withFrameMatchNames(images: ImageItem[]) {
  const counts = new Map<string, number>();

  for (const image of images) {
    const matchName = getFrameMatchName(image.name);
    counts.set(matchName, (counts.get(matchName) ?? 0) + 1);
  }

  return images.map((image) => {
    const matchName = getFrameMatchName(image.name);

    return {
      ...image,
      name: counts.get(matchName) === 1 ? matchName : image.name,
    };
  });
}

function getCategory(caseItem: ImageCase | undefined, categoryId: string) {
  return caseItem?.categories.find((category) => category.id === categoryId);
}

function formatCategoryName(categoryId: string) {
  if (categoryId === "__root__") {
    return "ROOT";
  }

  return categoryId
    .split("/")
    .map((part) => part.replace(/^#/, "").toUpperCase())
    .join(" / ");
}

function intersectNames(lists: string[][]) {
  if (lists.length === 0) {
    return [];
  }

  const [first, ...rest] = lists;
  return first.filter((name) => rest.every((list) => list.includes(name))).sort(naturalSort);
}

function getSlotImage(caseItem: ImageCase | undefined, categoryId: string, imageName: string) {
  return getCategory(caseItem, categoryId)?.images.find((image) => image.name === imageName);
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function getAnnotationBounds(annotation: Annotation) {
  const xs = annotation.points.map((point) => point.x);
  const ys = annotation.points.map((point) => point.y);

  return {
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    minX: Math.min(...xs),
    minY: Math.min(...ys),
  };
}

function isPointNearAnnotation(point: Point, annotation: Annotation) {
  const bounds = getAnnotationBounds(annotation);
  const tolerance = 0.025;

  return (
    point.x >= bounds.minX - tolerance &&
    point.x <= bounds.maxX + tolerance &&
    point.y >= bounds.minY - tolerance &&
    point.y <= bounds.maxY + tolerance
  );
}

function annotationShownOn(annotation: Annotation, paneId: string) {
  return annotation.targets === "all" || annotation.targets.includes(paneId);
}

async function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export default function Home() {
  const [library, setLibrary] = useState<ImageLibrary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [imageName, setImageName] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isAnimationExporting, setIsAnimationExporting] = useState(false);
  const [stillFormat, setStillFormat] = useState<StillFormat>("png");
  const [animationFormat, setAnimationFormat] = useState<AnimationFormat>("webm");
  const [supportsMp4Export, setSupportsMp4Export] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [animationStart, setAnimationStart] = useState("");
  const [animationEnd, setAnimationEnd] = useState("");
  const [timingMode, setTimingMode] = useState<TimingMode>("fps");
  const [timingValue, setTimingValue] = useState(12);
  const [animationWidth, setAnimationWidth] = useState(2400);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnimationOpen, setIsAnimationOpen] = useState(false);
  const [openCasePickerId, setOpenCasePickerId] = useState<string | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(
    null,
  );
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);
  const [drawTool, setDrawTool] = useState<DrawTool>("none");
  const [drawColor, setDrawColor] = useState("#ff3333");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [draftAnnotation, setDraftAnnotation] = useState<Annotation | null>(null);
  const [targetMode, setTargetMode] = useState<TargetMode>("all");
  const [customTargetIds, setCustomTargetIds] = useState<string[]>([]);
  const [isScopeOpen, setIsScopeOpen] = useState(false);
  const [aspectByUrl, setAspectByUrl] = useState<Record<string, number>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pickingSlotId, setPickingSlotId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slotFileInputRef = useRef<HTMLInputElement>(null);
  const appRef = useRef<HTMLElement>(null);

  const casesById = useMemo(() => {
    return new Map(library?.cases.map((caseItem) => [caseItem.id, caseItem]) ?? []);
  }, [library]);

  const selectedCases = useMemo(() => {
    return slots.map((slot) => casesById.get(slot.caseId)).filter(Boolean) as ImageCase[];
  }, [casesById, slots]);

  const categoryOptions = useMemo(() => {
    if (selectedCases.length === 0) {
      return [];
    }

    return intersectNames(selectedCases.map((caseItem) => caseItem.categories.map((category) => category.id)));
  }, [selectedCases]);

  const imageOptions = useMemo(() => {
    if (selectedCases.length === 0 || !categoryId) {
      return [];
    }

    return intersectNames(
      selectedCases.map((caseItem) => getCategory(caseItem, categoryId)?.images.map((image) => image.name) ?? []),
    );
  }, [categoryId, selectedCases]);

  const activeIndex = Math.max(0, imageOptions.indexOf(imageName));

  const animationRange = useMemo(() => {
    if (imageOptions.length === 0 || !animationStart || !animationEnd) {
      return [];
    }

    const startIndex = imageOptions.indexOf(animationStart);
    const endIndex = imageOptions.indexOf(animationEnd);

    if (startIndex < 0 || endIndex < 0) {
      return [];
    }

    const first = Math.min(startIndex, endIndex);
    const last = Math.max(startIndex, endIndex);
    return imageOptions.slice(first, last + 1);
  }, [animationEnd, animationStart, imageOptions]);

  const frameDurationMs = useMemo(() => {
    const safeValue = Math.max(0.01, timingValue);

    if (timingMode === "frame") {
      return safeValue;
    }

    if (timingMode === "total") {
      return animationRange.length > 0 ? (safeValue * 1000) / animationRange.length : 1000;
    }

    return 1000 / safeValue;
  }, [animationRange.length, timingMode, timingValue]);

  const effectiveFps = 1000 / frameDurationMs;
  const totalDurationSeconds = (animationRange.length * frameDurationMs) / 1000;

  const loadServerLibrary = useCallback(async () => {
    setError(null);

    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not load server image library.");
      }

      setLibrary(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load server image library.");
    }
  }, []);

  useEffect(() => {
    loadServerLibrary();
  }, [loadServerLibrary]);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("cfd-viewer-theme");

    if (storedTheme === "dark" || storedTheme === "light") {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("cfd-viewer-theme", theme);
  }, [theme]);

  useEffect(() => {
    setSupportsMp4Export("MediaRecorder" in window && MediaRecorder.isTypeSupported("video/mp4"));
  }, []);

  useEffect(() => {
    if (zoom === 1) {
      setPan({ x: 0, y: 0 });
    }
  }, [zoom]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await appRef.current?.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen rejections (e.g. permission or unsupported).
    }
  }, []);

  useEffect(() => {
    if (!library || slots.length > 0 || library.cases.length === 0) {
      return;
    }

    setSlots(library.cases.slice(0, 2).map(makeSlot));
  }, [library, slots.length]);

  useEffect(() => {
    if (categoryOptions.length === 0) {
      setCategoryId("");
      return;
    }

    if (!categoryOptions.includes(categoryId)) {
      setCategoryId(categoryOptions[0]);
    }
  }, [categoryId, categoryOptions]);

  useEffect(() => {
    if (imageOptions.length === 0) {
      setImageName("");
      return;
    }

    if (!imageOptions.includes(imageName)) {
      setImageName(imageOptions[0]);
    }
  }, [imageName, imageOptions]);

  useEffect(() => {
    if (imageOptions.length === 0) {
      setAnimationStart("");
      setAnimationEnd("");
      setIsPlaying(false);
      return;
    }

    if (!imageOptions.includes(animationStart)) {
      setAnimationStart(imageOptions[0]);
    }

    if (!imageOptions.includes(animationEnd)) {
      setAnimationEnd(imageOptions[imageOptions.length - 1]);
    }
  }, [animationEnd, animationStart, imageOptions]);

  const stepImage = useCallback(
    (direction: 1 | -1) => {
      if (imageOptions.length === 0) {
        return;
      }

      const current = imageOptions.indexOf(imageName);
      const next = current < 0 ? 0 : (current + direction + imageOptions.length) % imageOptions.length;
      setImageName(imageOptions[next]);
    },
    [imageName, imageOptions],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "SELECT" || target?.tagName === "TEXTAREA";

      if (isTyping) {
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepImage(1);
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepImage(-1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stepImage]);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "F11") {
        event.preventDefault();
        toggleFullscreen();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleFullscreen]);

  useEffect(() => {
    if (!isPlaying || animationRange.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setImageName((current) => {
        const currentIndex = animationRange.indexOf(current);
        const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % animationRange.length;
        return animationRange[nextIndex];
      });
    }, frameDurationMs);

    return () => window.clearTimeout(timer);
  }, [animationRange, frameDurationMs, imageName, isPlaying]);

  function addSlot() {
    if (!library || slots.length >= maxSlots) {
      return;
    }

    const usedCaseIds = new Set(slots.map((slot) => slot.caseId));
    const nextCase = library.cases.find((caseItem) => !usedCaseIds.has(caseItem.id)) ?? library.cases[0];

    if (nextCase) {
      setSlots((current) => [...current, makeSlot(nextCase)]);
    }
  }

  function removeSlot(slotId: string) {
    setSlots((current) => current.filter((slot) => slot.id !== slotId));
    setAnnotations((current) => current.filter((annotation) => annotation.slotId !== slotId));
  }

  function updateSlot(slotId: string, changes: Partial<Slot>) {
    setSlots((current) => current.map((slot) => (slot.id === slotId ? { ...slot, ...changes } : slot)));
  }

  function onCaseChange(slotId: string, caseId: string) {
    const caseItem = casesById.get(caseId);
    updateSlot(slotId, {
      caseId,
      label: caseItem?.name ?? caseId,
    });
    setOpenCasePickerId(null);
  }

  function playAnimation() {
    if (animationRange.length === 0) {
      return;
    }

    if (!animationRange.includes(imageName)) {
      setImageName(animationRange[0]);
    }

    setIsPlaying(true);
  }

  function zoomBy(delta: number) {
    setZoom((current) => Math.min(6, Math.max(1, Number((current + delta).toFixed(2)))));
  }

  function resetZoom() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function getExportColors() {
    return theme === "dark"
      ? {
          background: "#0b1220",
          panel: "#111827",
          line: "#334155",
          text: "#f8fafc",
          imageBackground: "#050816",
        }
      : {
          background: "#f5f7fb",
          panel: "#ffffff",
          line: "#d6dbe6",
          text: "#111827",
          imageBackground: "#ffffff",
        };
  }

  function getExportItems(frameName: string) {
    return slots
      .map((slot) => {
        const caseItem = casesById.get(slot.caseId);
        const image = getSlotImage(caseItem, categoryId, frameName);
        return image
          ? {
              slotId: slot.id,
              label: slot.label || caseItem?.name || slot.caseId,
              image,
            }
          : null;
      })
      .filter(Boolean) as Array<{ slotId: string; label: string; image: ImageItem }>;
  }

  // Maps a pointer position to image-content normalized coordinates [0,1].
  // Primary path: invert the annotation SVG's own screen transform (getScreenCTM),
  // which already encodes the viewBox, preserveAspectRatio letterboxing and the
  // zoom/pan CSS transform — so capture is the exact inverse of how it renders.
  function getImagePoint(stage: HTMLDivElement, clientX: number, clientY: number, aspect: number): Point {
    const svg = stage.querySelector("svg") as SVGSVGElement | null;

    if (svg && aspect > 0) {
      const ctm = svg.getScreenCTM();

      if (ctm) {
        const inverse = ctm.inverse();
        const userX = inverse.a * clientX + inverse.c * clientY + inverse.e;
        const userY = inverse.b * clientX + inverse.d * clientY + inverse.f;

        return { x: clamp01(userX / aspect), y: clamp01(userY) };
      }
    }

    // Fallback: derive the letterboxed image box from the rendered <img> rect.
    const img = stage.querySelector("img");
    const rect = (img ?? stage).getBoundingClientRect();
    let contentX = rect.left;
    let contentY = rect.top;
    let contentWidth = rect.width;
    let contentHeight = rect.height;

    if (aspect > 0 && rect.width > 0 && rect.height > 0) {
      const boxAspect = rect.width / rect.height;

      if (boxAspect > aspect) {
        contentWidth = rect.height * aspect;
        contentX = rect.left + (rect.width - contentWidth) / 2;
      } else {
        contentHeight = rect.width / aspect;
        contentY = rect.top + (rect.height - contentHeight) / 2;
      }
    }

    return {
      x: clamp01((clientX - contentX) / contentWidth),
      y: clamp01((clientY - contentY) / contentHeight),
    };
  }

  function resolveDrawTargets(sourceId: string): DrawTargets {
    if (targetMode === "all") {
      return "all";
    }

    if (targetMode === "custom") {
      return Array.from(new Set([sourceId, ...customTargetIds]));
    }

    return [sourceId];
  }

  function eraseAnnotation(slotId: string, point: Point) {
    setAnnotations((current) => {
      const targetIndex = [...current]
        .reverse()
        .findIndex((annotation) => annotationShownOn(annotation, slotId) && isPointNearAnnotation(point, annotation));

      if (targetIndex < 0) {
        return current;
      }

      const realIndex = current.length - 1 - targetIndex;
      return current.filter((_, index) => index !== realIndex);
    });
  }

  function startDrawing(slotId: string, event: PointerEvent<HTMLDivElement>, aspect: number) {
    const point = getImagePoint(event.currentTarget, event.clientX, event.clientY, aspect);
    setFocusedPaneId(slotId);

    if (drawTool === "eraser") {
      eraseAnnotation(slotId, point);
      return;
    }

    if (drawTool === "none") {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDraftAnnotation({
      color: drawColor,
      id: crypto.randomUUID(),
      points: [point],
      slotId,
      targets: resolveDrawTargets(slotId),
      tool: drawTool,
    });
  }

  function continueDrawing(event: PointerEvent<HTMLDivElement>, aspect: number) {
    if (!draftAnnotation) {
      return;
    }

    const point = getImagePoint(event.currentTarget, event.clientX, event.clientY, aspect);
    setDraftAnnotation((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        points: current.tool === "pencil" ? [...current.points, point] : [current.points[0], point],
      };
    });
  }

  function finishDrawing() {
    if (draftAnnotation && draftAnnotation.points.length >= 2) {
      setAnnotations((existing) => [...existing, draftAnnotation]);
    }
    setDraftAnnotation(null);
  }

  function undoAnnotation() {
    setAnnotations((current) => current.slice(0, -1));
  }

  // Annotations are stored in image-normalized [0,1] coordinates. The SVG viewBox is
  // "0 0 aspect 1", so the x axis is stretched by the image aspect ratio for plotting.
  function renderAnnotation(annotation: Annotation, aspect: number) {
    const bounds = getAnnotationBounds(annotation);
    const first = annotation.points[0];
    const last = annotation.points[annotation.points.length - 1] ?? first;
    const px = (point: Point) => point.x * aspect;
    const firstX = px(first);
    const lastX = px(last);
    const common = {
      stroke: annotation.color,
      strokeLinecap: "round" as const,
      strokeLinejoin: "round" as const,
      strokeWidth: 0.006,
    };

    if (annotation.tool === "pencil") {
      return (
        <polyline
          key={annotation.id}
          fill="none"
          points={annotation.points.map((point) => `${px(point)},${point.y}`).join(" ")}
          {...common}
        />
      );
    }

    if (annotation.tool === "rect" || annotation.tool === "roundRect") {
      return (
        <rect
          key={annotation.id}
          fill="none"
          height={Math.max(0.001, bounds.maxY - bounds.minY)}
          rx={annotation.tool === "roundRect" ? 0.025 * aspect : 0}
          ry={annotation.tool === "roundRect" ? 0.025 : 0}
          width={Math.max(0.001, (bounds.maxX - bounds.minX) * aspect)}
          x={bounds.minX * aspect}
          y={bounds.minY}
          {...common}
        />
      );
    }

    if (annotation.tool === "arrow") {
      const angle = Math.atan2(last.y - first.y, lastX - firstX);
      const headLength = 0.035;
      const left = {
        x: lastX - headLength * Math.cos(angle - Math.PI / 6),
        y: last.y - headLength * Math.sin(angle - Math.PI / 6),
      };
      const right = {
        x: lastX - headLength * Math.cos(angle + Math.PI / 6),
        y: last.y - headLength * Math.sin(angle + Math.PI / 6),
      };

      return (
        <g key={annotation.id}>
          <line x1={firstX} x2={lastX} y1={first.y} y2={last.y} {...common} />
          <polyline
            fill="none"
            points={`${left.x},${left.y} ${lastX},${last.y} ${right.x},${right.y}`}
            {...common}
          />
        </g>
      );
    }

    return <line key={annotation.id} x1={firstX} x2={lastX} y1={first.y} y2={last.y} {...common} />;
  }

  function drawCanvasAnnotation(
    context: CanvasRenderingContext2D,
    annotation: Annotation,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    const toCanvasPoint = (point: Point) => ({
      x: x + point.x * width,
      y: y + point.y * height,
    });
    const first = toCanvasPoint(annotation.points[0]);
    const last = toCanvasPoint(annotation.points[annotation.points.length - 1] ?? annotation.points[0]);
    const bounds = getAnnotationBounds(annotation);

    context.save();
    context.strokeStyle = annotation.color;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 7;

    if (annotation.tool === "pencil") {
      context.beginPath();
      annotation.points.forEach((point, index) => {
        const canvasPoint = toCanvasPoint(point);

        if (index === 0) {
          context.moveTo(canvasPoint.x, canvasPoint.y);
          return;
        }

        context.lineTo(canvasPoint.x, canvasPoint.y);
      });
      context.stroke();
      context.restore();
      return;
    }

    if (annotation.tool === "rect" || annotation.tool === "roundRect") {
      const rectX = x + bounds.minX * width;
      const rectY = y + bounds.minY * height;
      const rectWidth = Math.max(1, (bounds.maxX - bounds.minX) * width);
      const rectHeight = Math.max(1, (bounds.maxY - bounds.minY) * height);

      context.beginPath();

      if (annotation.tool === "roundRect") {
        context.roundRect(rectX, rectY, rectWidth, rectHeight, Math.min(24, rectWidth / 5, rectHeight / 5));
      } else {
        context.rect(rectX, rectY, rectWidth, rectHeight);
      }

      context.stroke();
      context.restore();
      return;
    }

    context.beginPath();
    context.moveTo(first.x, first.y);
    context.lineTo(last.x, last.y);
    context.stroke();

    if (annotation.tool === "arrow") {
      const angle = Math.atan2(last.y - first.y, last.x - first.x);
      const headLength = 28;

      context.beginPath();
      context.moveTo(last.x, last.y);
      context.lineTo(last.x - headLength * Math.cos(angle - Math.PI / 6), last.y - headLength * Math.sin(angle - Math.PI / 6));
      context.moveTo(last.x, last.y);
      context.lineTo(last.x - headLength * Math.cos(angle + Math.PI / 6), last.y - headLength * Math.sin(angle + Math.PI / 6));
      context.stroke();
    }

    context.restore();
  }

  function drawAnnotationsOnCanvas(
    context: CanvasRenderingContext2D,
    slotId: string,
    clip: { x: number; y: number; width: number; height: number },
    content: { x: number; y: number; width: number; height: number },
  ) {
    context.save();
    context.beginPath();
    context.rect(clip.x, clip.y, clip.width, clip.height);
    context.clip();
    annotations
      .filter((annotation) => annotationShownOn(annotation, slotId))
      .forEach((annotation) => drawCanvasAnnotation(context, annotation, content.x, content.y, content.width, content.height));
    context.restore();
  }

  function createComparisonCanvas() {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas export is not available in this browser.");
    }

    return { canvas, context };
  }

  function sizeComparisonCanvas(canvas: HTMLCanvasElement, itemCount: number, width = 2400) {
    const gap = 36;
    const labelHeight = 84;
    const margin = 44;
    const columns = itemCount === 1 ? 1 : 2;
    const rows = itemCount <= 2 ? 1 : 2;
    const cellWidth = (width - margin * 2 - gap * (columns - 1)) / columns;
    const cellHeight = cellWidth * 0.66 + labelHeight;
    const height = margin * 2 + rows * cellHeight + gap * (rows - 1);

    canvas.width = width;
    canvas.height = height;

    return { cellHeight, cellWidth, columns, gap, height, labelHeight, margin, rows, width };
  }

  function drawImageInBox(
    context: CanvasRenderingContext2D,
    image: HTMLImageElement,
    x: number,
    y: number,
    width: number,
    height: number,
    useCurrentView: boolean,
  ) {
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale * (useCurrentView ? zoom : 1);
    const drawHeight = image.naturalHeight * scale * (useCurrentView ? zoom : 1);
    const drawX = x + (width - drawWidth) / 2 + (useCurrentView ? pan.x * 2 : 0);
    const drawY = y + (height - drawHeight) / 2 + (useCurrentView ? pan.y * 2 : 0);

    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    context.restore();

    return { height: drawHeight, width: drawWidth, x: drawX, y: drawY };
  }

  function drawComparisonFrame(
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    exportItems: Array<{ slotId: string; label: string; image: ImageItem }>,
    loadedImages: HTMLImageElement[],
    useCurrentView: boolean,
    width = 2400,
  ) {
    const colors = getExportColors();
    const layout = sizeComparisonCanvas(canvas, exportItems.length, width);

    context.fillStyle = colors.background;
    context.fillRect(0, 0, layout.width, layout.height);
    context.font = "500 42px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";

    exportItems.forEach((item, index) => {
      const image = loadedImages[index];
      const isThirdVItem = exportItems.length === 3 && index === 2;
      const col = isThirdVItem ? 0.5 : index % layout.columns;
      const row = exportItems.length <= 2 ? 0 : Math.floor(index / layout.columns);
      const x = layout.margin + col * (layout.cellWidth + layout.gap);
      const y = layout.margin + row * (layout.cellHeight + layout.gap);
      const imageBoxY = y + layout.labelHeight;
      const imageBoxHeight = layout.cellHeight - layout.labelHeight;

      context.fillStyle = colors.panel;
      context.fillRect(x, y, layout.cellWidth, layout.cellHeight);
      context.fillStyle = colors.imageBackground;
      context.fillRect(x, imageBoxY, layout.cellWidth, imageBoxHeight);
      context.strokeStyle = colors.line;
      context.lineWidth = 2;
      context.strokeRect(x, y, layout.cellWidth, layout.cellHeight);
      context.fillStyle = colors.text;
      context.fillText(item.label, x + layout.cellWidth / 2, y + layout.labelHeight / 2, layout.cellWidth - 32);
      const drawn = drawImageInBox(context, image, x, imageBoxY, layout.cellWidth, imageBoxHeight, useCurrentView);
      drawAnnotationsOnCanvas(
        context,
        item.slotId,
        { height: imageBoxHeight, width: layout.cellWidth, x, y: imageBoxY },
        drawn,
      );
    });
  }

  function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function getStillMimeType(format: StillFormat) {
    return format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
  }

  function getAnimationMimeType(format: AnimationFormat) {
    if (format === "mp4") {
      return MediaRecorder.isTypeSupported("video/mp4;codecs=h264")
        ? "video/mp4;codecs=h264"
        : MediaRecorder.isTypeSupported("video/mp4")
          ? "video/mp4"
          : "";
    }

    return MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
  }

  function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string) {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
            return;
          }

          reject(new Error("Could not create the download file."));
        },
        mimeType,
        mimeType === "image/jpeg" ? 0.92 : undefined,
      );
    });
  }

  function parseLocalFolder(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])] as Array<File & { webkitRelativePath?: string }>;

    if (files.length === 0) {
      return;
    }

    const imageFiles = files.filter((file) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name));
    const groups = new Map<string, Map<string, ImageItem[]>>();
    const rootName = imageFiles[0]?.webkitRelativePath?.split("/")?.[0] ?? "Local folder";

    for (const file of imageFiles) {
      const parts = (file.webkitRelativePath || file.name).split("/").filter(Boolean);

      if (parts.length < 3) {
        continue;
      }

      const caseName = parts[1];

      if (!caseName.includes("F1")) {
        continue;
      }

      const category = parts.slice(2, -1).join("/") || "__root__";
      const caseGroups = groups.get(caseName) ?? new Map<string, ImageItem[]>();
      const categoryImages = caseGroups.get(category) ?? [];
      categoryImages.push({
        name: file.name,
        url: URL.createObjectURL(file),
      });
      caseGroups.set(category, categoryImages);
      groups.set(caseName, caseGroups);
    }

    const localCases = [...groups.entries()]
      .map(([caseName, caseGroups]) => ({
        id: caseName,
        name: caseName,
        categories: [...caseGroups.entries()]
          .map(([category, images]) => ({
            id: category,
            name: category === "__root__" ? "Root" : category,
            images: withFrameMatchNames(images.sort((a, b) => naturalSort(a.name, b.name))),
          }))
          .sort((a, b) => naturalSort(a.name, b.name)),
      }))
      .sort((a, b) => naturalSort(a.name, b.name));

    setLibrary({
      source: "local",
      rootName,
      cases: localCases,
    });
    setSlots(localCases.slice(0, 2).map(makeSlot));
    setError(null);
    event.target.value = "";
  }

  // Load a single folder from the user's computer directly into one slot.
  // The selected folder's subfolders become variable categories; frame
  // matching works exactly as it does for the main library. No naming or
  // nesting-depth requirement, so any folder anywhere can be picked.
  function parseSlotFolder(slotId: string, event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])] as Array<File & { webkitRelativePath?: string }>;
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    const imageFiles = files.filter((file) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name));

    if (imageFiles.length === 0) {
      setError("No images were found in the selected folder.");
      return;
    }

    const folderName = imageFiles[0]?.webkitRelativePath?.split("/")?.[0] ?? "Folder";
    const groups = new Map<string, ImageItem[]>();

    for (const file of imageFiles) {
      const parts = (file.webkitRelativePath || file.name).split("/").filter(Boolean);
      // parts[0] is the picked folder itself; anything between it and the
      // file name is the variable category (flattened with "/").
      const category = parts.slice(1, -1).join("/") || "__root__";
      const categoryImages = groups.get(category) ?? [];
      categoryImages.push({ name: file.name, url: URL.createObjectURL(file) });
      groups.set(category, categoryImages);
    }

    const categories = [...groups.entries()]
      .map(([category, images]) => ({
        id: category,
        name: category === "__root__" ? "Root" : category,
        images: withFrameMatchNames(images.sort((a, b) => naturalSort(a.name, b.name))),
      }))
      .sort((a, b) => naturalSort(a.name, b.name));

    const newCase: ImageCase = {
      id: `local:${crypto.randomUUID()}`,
      name: folderName,
      categories,
    };

    setLibrary((current) => {
      const base = current ?? { source: "local" as const, rootName: folderName, cases: [] };
      return { ...base, cases: [...base.cases, newCase] };
    });
    updateSlot(slotId, { caseId: newCase.id, label: folderName });
    setOpenCasePickerId(null);
    setError(null);
  }

  async function exportMontage() {
    if (slots.length === 0 || !categoryId || !imageName) {
      return;
    }

    setIsExporting(true);

    try {
      const exportItems = getExportItems(imageName);
      const loadedImages = await Promise.all(exportItems.map((item) => loadImage(item.image.url)));
      const { canvas, context } = createComparisonCanvas();
      drawComparisonFrame(context, canvas, exportItems, loadedImages, true);

      const link = document.createElement("a");
      const safeName = imageName.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_");
      const blob = await canvasToBlob(canvas, getStillMimeType(stillFormat));
      const url = URL.createObjectURL(blob);
      link.download = `cfd-comparison-${safeName}-${exportItems.length}up.${stillFormat === "jpeg" ? "jpg" : stillFormat}`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not export the montage.");
    } finally {
      setIsExporting(false);
    }
  }

  async function exportAnimation() {
    if (animationRange.length === 0) {
      return;
    }

    if (!("MediaRecorder" in window)) {
      setError("This browser cannot record animations. Use Chrome or Edge for WebM export.");
      return;
    }

    setIsAnimationExporting(true);
    setError(null);

    try {
      const firstItems = getExportItems(animationRange[0]);

      if (firstItems.length === 0) {
        throw new Error("No visible images are available for this animation range.");
      }

      const { canvas, context } = createComparisonCanvas();
      sizeComparisonCanvas(canvas, firstItems.length, animationWidth);
      const stream = canvas.captureStream(Math.min(60, Math.max(1, Math.round(effectiveFps))));
      const mimeType = getAnimationMimeType(animationFormat);

      if (!mimeType) {
        throw new Error("This browser cannot export that animation format. Use WebM, or add server FFmpeg for MP4/AVI.");
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      const imageCache = new Map<string, Promise<HTMLImageElement>>();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      const finished = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      recorder.start();

      for (const frame of animationRange) {
        const exportItems = getExportItems(frame);
        const loadedImages = await Promise.all(
          exportItems.map((item) => {
            const cached = imageCache.get(item.image.url);

            if (cached) {
              return cached;
            }

            const promise = loadImage(item.image.url);
            imageCache.set(item.image.url, promise);
            return promise;
          }),
        );
        drawComparisonFrame(context, canvas, exportItems, loadedImages, true, animationWidth);
        const [track] = stream.getVideoTracks();

        if ("requestFrame" in track) {
          (track as CanvasCaptureMediaStreamTrack).requestFrame();
        }

        await wait(frameDurationMs);
      }

      recorder.stop();
      await finished;
      stream.getTracks().forEach((track) => track.stop());

      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName = categoryId.replace(/[^\w.-]+/g, "_") || "animation";
      link.download = `cfd-animation-${safeName}-${animationRange.length}frames.${animationFormat}`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not export the animation.");
    } finally {
      setIsAnimationExporting(false);
    }
  }

  function renderStepper() {
    return (
      <div className="stepper">
        <button className="icon-button" aria-label="Previous image" onClick={() => stepImage(-1)}>
          ‹
        </button>
        <span>
          {imageOptions.length > 0 ? activeIndex + 1 : 0} / {imageOptions.length}
        </span>
        <button className="icon-button" aria-label="Next image" onClick={() => stepImage(1)}>
          ›
        </button>
      </div>
    );
  }

  function renderZoomActions() {
    return (
      <div className="zoom-actions">
        <button className="icon-button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(-0.25)}>
          <ZoomOut aria-hidden="true" size={17} strokeWidth={2.2} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="icon-button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(0.25)}>
          <ZoomIn aria-hidden="true" size={17} strokeWidth={2.2} />
        </button>
        <button className="icon-button" aria-label="Reset view" title="Reset view" onClick={resetZoom}>
          <RotateCcw aria-hidden="true" size={16} strokeWidth={2.2} />
        </button>
      </div>
    );
  }

  function renderDrawActions() {
    return (
      <>
        <div className="draw-actions">
          <button
            className={`tool-button ${drawTool === "none" ? "active" : ""}`}
            aria-label="View and pan mode"
            title="View and pan"
            onClick={() => setDrawTool("none")}
          >
            View
          </button>
          <button
            className={`icon-button ${drawTool === "pencil" ? "active" : ""}`}
            aria-label="Pencil"
            title="Pencil"
            onClick={() => setDrawTool("pencil")}
          >
            <Pencil aria-hidden="true" size={16} strokeWidth={2.2} />
          </button>
          <button
            className={`icon-button ${drawTool === "arrow" ? "active" : ""}`}
            aria-label="Arrow"
            title="Arrow"
            onClick={() => setDrawTool("arrow")}
          >
            <ArrowUpRight aria-hidden="true" size={17} strokeWidth={2.2} />
          </button>
          <button
            className={`icon-button ${drawTool === "line" ? "active" : ""}`}
            aria-label="Line"
            title="Line"
            onClick={() => setDrawTool("line")}
          >
            <Minus aria-hidden="true" size={18} strokeWidth={2.2} />
          </button>
          <button
            className={`icon-button ${drawTool === "rect" ? "active" : ""}`}
            aria-label="Rectangle"
            title="Rectangle"
            onClick={() => setDrawTool("rect")}
          >
            <Square aria-hidden="true" size={15} strokeWidth={2.2} />
          </button>
          <button
            className={`tool-button ${drawTool === "roundRect" ? "active" : ""}`}
            aria-label="Rounded rectangle"
            title="Rounded rectangle"
            onClick={() => setDrawTool("roundRect")}
          >
            R
          </button>
          <button
            className={`icon-button ${drawTool === "eraser" ? "active" : ""}`}
            aria-label="Eraser"
            title="Eraser"
            onClick={() => setDrawTool("eraser")}
          >
            <Eraser aria-hidden="true" size={16} strokeWidth={2.2} />
          </button>
          <input
            aria-label="Drawing color"
            className="color-input"
            type="color"
            value={drawColor}
            onChange={(event) => setDrawColor(event.target.value)}
          />
          <button className="icon-button" aria-label="Undo last drawing" title="Undo drawing" onClick={undoAnnotation}>
            <Undo2 aria-hidden="true" size={16} strokeWidth={2.2} />
          </button>
          <button
            className="icon-button danger"
            aria-label="Clear all drawings"
            title="Clear drawings"
            onClick={() => setAnnotations([])}
          >
            <Trash2 aria-hidden="true" size={15} strokeWidth={2.2} />
          </button>
          <button
            className={`tool-button ${targetMode !== "source" ? "active" : ""}`}
            aria-label="Choose which panes drawings apply to"
            title="Choose which panes new drawings apply to"
            onClick={() => setIsScopeOpen((current) => !current)}
          >
            {targetMode === "all" ? "All" : targetMode === "custom" ? "Pick" : "One"}
          </button>
        </div>

        {isScopeOpen ? (
          <div className="scope-popover">
            <div className="popover-header">
              <strong>Apply new drawings to</strong>
              <button className="tiny-button" onClick={() => setIsScopeOpen(false)}>
                Close
              </button>
            </div>
            <div className="scope-modes">
              <button
                className={`tool-button ${targetMode === "source" ? "active" : ""}`}
                onClick={() => setTargetMode("source")}
              >
                Drawn pane only
              </button>
              <button
                className={`tool-button ${targetMode === "all" ? "active" : ""}`}
                onClick={() => setTargetMode("all")}
              >
                All panes
              </button>
              <button
                className={`tool-button ${targetMode === "custom" ? "active" : ""}`}
                onClick={() => setTargetMode("custom")}
              >
                Selected panes
              </button>
            </div>
            {targetMode === "custom" ? (
              <div className="scope-targets">
                {slots.map((slot, index) => (
                  <label className="scope-check" key={slot.id}>
                    <input
                      type="checkbox"
                      checked={customTargetIds.includes(slot.id)}
                      onChange={(event) =>
                        setCustomTargetIds((current) =>
                          event.target.checked
                            ? [...current, slot.id]
                            : current.filter((id) => id !== slot.id),
                        )
                      }
                    />
                    <span>
                      Folder {index + 1} — {slot.label || casesById.get(slot.caseId)?.name || slot.caseId}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
            <p className="scope-hint">
              The pane you draw on is always included. Existing drawings keep their own targets.
            </p>
          </div>
        ) : null}
      </>
    );
  }

  function renderAnimationControls() {
    return (
      <>
        <div className="animation-actions">
          <button
            className="icon-button"
            aria-label={isPlaying ? "Pause animation" : "Play animation"}
            disabled={animationRange.length === 0}
            title={isPlaying ? "Pause animation" : "Play animation"}
            onClick={isPlaying ? () => setIsPlaying(false) : playAnimation}
          >
            {isPlaying ? "II" : "▶"}
          </button>
          <button
            className="icon-button"
            aria-label="Go to first animation frame"
            title="First animation frame"
            disabled={animationRange.length === 0}
            onClick={() => {
              setIsPlaying(false);
              setImageName(animationRange[0]);
            }}
          >
            |‹
          </button>
          <button
            className="button secondary compact-button"
            onClick={() => setIsAnimationOpen((current) => !current)}
          >
            Animation
          </button>
          <span className="animation-summary">
            {animationRange.length} fr · {effectiveFps.toFixed(1)} FPS · {totalDurationSeconds.toFixed(2)} s
          </span>
        </div>

        {isAnimationOpen ? (
          <div className="animation-popover">
            <div className="popover-header">
              <strong>Animation settings</strong>
              <button className="tiny-button" onClick={() => setIsAnimationOpen(false)}>
                Close
              </button>
            </div>

            <label className="field">
              <span>First image</span>
              <select value={animationStart} onChange={(event) => setAnimationStart(event.target.value)}>
                {imageOptions.map((image) => (
                  <option key={image} value={image}>
                    {image}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Last image</span>
              <select value={animationEnd} onChange={(event) => setAnimationEnd(event.target.value)}>
                {imageOptions.map((image) => (
                  <option key={image} value={image}>
                    {image}
                  </option>
                ))}
              </select>
            </label>

            <div className="popover-grid">
              <label className="field timing-mode">
                <span>Timing</span>
                <select
                  value={timingMode}
                  onChange={(event) => {
                    const nextMode = event.target.value as TimingMode;
                    setTimingMode(nextMode);
                    setTimingValue(nextMode === "fps" ? 12 : nextMode === "frame" ? 80 : 6);
                  }}
                >
                  <option value="fps">FPS</option>
                  <option value="frame">Frame duration ms</option>
                  <option value="total">Total duration s</option>
                </select>
              </label>

              <label className="field timing-value">
                <span>{timingMode === "fps" ? "FPS" : timingMode === "frame" ? "Milliseconds" : "Seconds"}</span>
                <input
                  min={timingMode === "fps" ? 1 : 0.1}
                  max={timingMode === "fps" ? 60 : undefined}
                  step={timingMode === "frame" ? 10 : 0.1}
                  type="number"
                  value={timingValue}
                  onChange={(event) => setTimingValue(Number(event.target.value) || 1)}
                />
              </label>
            </div>
            <label className="field">
              <span>Resolution</span>
              <select
                value={animationWidth}
                onChange={(event) => setAnimationWidth(Number(event.target.value))}
              >
                <option value={1280}>Low — 1280px wide</option>
                <option value={1920}>Full HD — 1920px wide</option>
                <option value={2400}>Standard — 2400px wide</option>
                <option value={3200}>High — 3200px wide</option>
                <option value={3840}>4K — 3840px wide</option>
              </select>
            </label>
            <label className="field">
              <span>Download format</span>
              <select
                value={animationFormat}
                onChange={(event) => setAnimationFormat(event.target.value as AnimationFormat)}
              >
                <option value="webm">WebM</option>
                <option disabled={!supportsMp4Export} value="mp4">
                  MP4 browser support
                </option>
              </select>
            </label>
            <button
              className="button primary"
              disabled={isAnimationExporting || animationRange.length === 0}
              onClick={exportAnimation}
            >
              {isAnimationExporting ? "Recording..." : `Download ${animationFormat.toUpperCase()}`}
            </button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <main ref={appRef} className={`app-shell theme-${theme} ${isFullscreen ? "is-fullscreen" : ""}`}>
      <section className="toolbar">
        <div className="brand-block">
          <p className="eyebrow">CFD Image Viewer</p>
          <h1>Compare simulation folders</h1>
          <p className="source-line">
            Main folder: {library ? `${library.rootName} (${library.source})` : "Loading..."}
          </p>
        </div>

        <div className="toolbar-actions">
          <button className="button secondary" title="Fullscreen (F11)" onClick={toggleFullscreen}>
            <Maximize2 aria-hidden="true" size={15} strokeWidth={2.2} /> Fullscreen
          </button>
          <button
            className="button secondary"
            onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
          >
            {theme === "light" ? "Dark theme" : "White theme"}
          </button>
          <button className="button secondary" onClick={() => fileInputRef.current?.click()}>
            <FolderOpen aria-hidden="true" size={15} strokeWidth={2.2} /> Open main folder
          </button>
          <input
            ref={fileInputRef}
            className="hidden-input"
            type="file"
            multiple
            // @ts-expect-error Chromium directory picker attribute.
            webkitdirectory=""
            onChange={parseLocalFolder}
          />
          <input
            ref={slotFileInputRef}
            className="hidden-input"
            type="file"
            multiple
            // @ts-expect-error Chromium directory picker attribute.
            webkitdirectory=""
            onChange={(event) => {
              if (pickingSlotId) {
                parseSlotFolder(pickingSlotId, event);
                setPickingSlotId(null);
              }
            }}
          />
          <button className="button secondary" onClick={loadServerLibrary}>
            Refresh server
          </button>
          <button className="button secondary" disabled={slots.length >= maxSlots} onClick={addSlot}>
            Add folder
          </button>
          <select
            aria-label="Still image download format"
            className="compact-select"
            value={stillFormat}
            onChange={(event) => setStillFormat(event.target.value as StillFormat)}
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPG</option>
            <option value="webp">WebP</option>
          </select>
          <button className="button primary" disabled={isExporting || slots.length === 0} onClick={exportMontage}>
            {isExporting ? "Exporting..." : "Download view"}
          </button>
        </div>
      </section>

      {error ? <div className="notice">{error}</div> : null}

      <section className="control-band">
        <label className="field">
          <span>Variable</span>
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {formatCategoryName(category)}
              </option>
            ))}
          </select>
        </label>

        <label className="field image-field">
          <span>Image</span>
          <select value={imageName} onChange={(event) => setImageName(event.target.value)}>
            {imageOptions.map((image) => (
              <option key={image} value={image}>
                {image}
              </option>
            ))}
          </select>
        </label>

        {renderStepper()}

        {renderZoomActions()}

        {renderDrawActions()}

        {renderAnimationControls()}
      </section>

      <section className="slot-strip">
        {slots.map((slot, index) => (
          <div className="slot-panel" key={slot.id}>
            <div className="slot-main-row">
              <span className="slot-name">Folder {index + 1}</span>
              <div className="slot-actions">
                <button
                  className="tiny-icon-button"
                  aria-label={`Open folder selector for folder ${index + 1}`}
                  title="Select folder"
                  onClick={() => setOpenCasePickerId((current) => (current === slot.id ? null : slot.id))}
                >
                  <FolderOpen aria-hidden="true" size={16} strokeWidth={2.2} />
                </button>
                {slots.length > 1 ? (
                  <button
                    className="tiny-icon-button danger"
                    aria-label={`Remove folder ${index + 1}`}
                    title="Remove folder"
                    onClick={() => removeSlot(slot.id)}
                  >
                    <Trash2 aria-hidden="true" size={15} strokeWidth={2.2} />
                  </button>
                ) : null}
              </div>
            </div>
            {openCasePickerId === slot.id ? (
              <div className="slot-picker">
                {library && library.cases.length > 0 ? (
                  <select value={slot.caseId} onChange={(event) => onCaseChange(slot.id, event.target.value)}>
                    {library.cases.map((caseItem) => (
                      <option key={caseItem.id} value={caseItem.id}>
                        {caseItem.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  className="button secondary compact-button"
                  onClick={() => {
                    setPickingSlotId(slot.id);
                    slotFileInputRef.current?.click();
                  }}
                >
                  <FolderOpen aria-hidden="true" size={14} strokeWidth={2.2} /> Pick folder from computer
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </section>

      {isFullscreen ? (
        <section className="fullscreen-bar">
          {renderStepper()}
          {renderZoomActions()}
          {renderDrawActions()}
          {renderAnimationControls()}
          <select
            aria-label="Still image download format"
            className="compact-select"
            value={stillFormat}
            onChange={(event) => setStillFormat(event.target.value as StillFormat)}
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPG</option>
            <option value="webp">WebP</option>
          </select>
          <button className="button primary" disabled={isExporting || slots.length === 0} onClick={exportMontage}>
            {isExporting ? "Saving..." : "Save image"}
          </button>
          <button className="button secondary" title="Exit fullscreen (Esc)" onClick={toggleFullscreen}>
            <Minimize2 aria-hidden="true" size={15} strokeWidth={2.2} /> Exit
          </button>
        </section>
      ) : null}

      <section className={`viewer-grid count-${slots.length}`}>
        {slots.map((slot) => {
          const caseItem = casesById.get(slot.caseId);
          const image = getSlotImage(caseItem, categoryId, imageName);
          const aspect = image ? aspectByUrl[image.url] ?? 1 : 1;

          return (
            <article className="image-pane" key={slot.id}>
              {editingLabelId === slot.id ? (
                <input
                  autoFocus
                  className="pane-label-input"
                  value={slot.label}
                  onBlur={() => setEditingLabelId(null)}
                  onChange={(event) => updateSlot(slot.id, { label: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "Escape") {
                      setEditingLabelId(null);
                    }
                  }}
                  placeholder={caseItem?.name || slot.caseId}
                />
              ) : (
                <button className="pane-label" onClick={() => setEditingLabelId(slot.id)}>
                  {slot.label || caseItem?.name || slot.caseId}
                </button>
              )}
              {image ? (
                <div
                  className={`image-stage ${zoom > 1 ? "is-zoomed" : ""} ${focusedPaneId === slot.id ? "is-focused" : ""} ${
                    drawTool !== "none" ? "is-drawing" : ""
                  }`}
                  onClick={() => setFocusedPaneId(slot.id)}
                  onWheel={(event) => {
                    if (drawTool !== "none") {
                      return;
                    }

                    if (focusedPaneId !== slot.id) {
                      return;
                    }

                    event.preventDefault();
                    zoomBy(event.deltaY > 0 ? -0.15 : 0.15);
                  }}
                  onPointerDown={(event) => {
                    setFocusedPaneId(slot.id);

                    if (drawTool !== "none") {
                      startDrawing(slot.id, event, aspect);
                      return;
                    }

                    if (zoom <= 1) {
                      return;
                    }

                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDragStart({
                      pointerId: event.pointerId,
                      x: event.clientX,
                      y: event.clientY,
                      panX: pan.x,
                      panY: pan.y,
                    });
                  }}
                  onPointerMove={(event) => {
                    if (draftAnnotation) {
                      continueDrawing(event, aspect);
                      return;
                    }

                    if (!dragStart || dragStart.pointerId !== event.pointerId) {
                      return;
                    }

                    setPan({
                      x: dragStart.panX + event.clientX - dragStart.x,
                      y: dragStart.panY + event.clientY - dragStart.y,
                    });
                  }}
                  onPointerUp={(event) => {
                    if (draftAnnotation) {
                      finishDrawing();
                      return;
                    }

                    if (dragStart?.pointerId === event.pointerId) {
                      setDragStart(null);
                    }
                  }}
                  onPointerCancel={() => {
                    setDraftAnnotation(null);
                    setDragStart(null);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={`${slot.label} ${image.name}`}
                    draggable={false}
                    src={image.url}
                    onLoad={(event) => {
                      const target = event.currentTarget;

                      if (!target.naturalWidth || !target.naturalHeight) {
                        return;
                      }

                      const ratio = target.naturalWidth / target.naturalHeight;
                      setAspectByUrl((current) =>
                        current[image.url] === ratio ? current : { ...current, [image.url]: ratio },
                      );
                    }}
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    }}
                  />
                  <svg
                    className="annotation-layer"
                    preserveAspectRatio="xMidYMid meet"
                    viewBox={`0 0 ${aspect} 1`}
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      transformOrigin: "center center",
                    }}
                  >
                    {annotations
                      .filter((annotation) => annotationShownOn(annotation, slot.id))
                      .map((annotation) => renderAnnotation(annotation, aspect))}
                    {draftAnnotation && annotationShownOn(draftAnnotation, slot.id)
                      ? renderAnnotation(draftAnnotation, aspect)
                      : null}
                  </svg>
                </div>
              ) : (
                <div className="missing-image">Missing image in this folder</div>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
