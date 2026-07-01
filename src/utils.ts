import type {
  AmirielDocument,
  AmirielFont,
  AmirielMedia,
  AmirielMediaPlacement,
  AmirielPage,
  AmirielTextBlock,
  AmirielTextColor,
  AmirielTheme,
} from "./types";
import { AMIRIEL_BUILTIN_THEME_IDS, themeDefaultTextColorFor } from "./themes";

export const AMIRIEL_TEXT_COLORS: Record<AmirielTextColor, string> = {
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#ca8a04",
  green: "#16a34a",
  cyan: "#0891b2",
  blue: "#2563eb",
  purple: "#9333ea",
  pink: "#ec4899",
  brown: "#92400e",
  gray: "#6b7280",
  black: "#000000",
  white: "#ffffff",
};

export const AMIRIEL_TEXT_COLOR_OPTIONS = Object.keys(AMIRIEL_TEXT_COLORS) as AmirielTextColor[];
export const AMIRIEL_FONT_OPTIONS: AmirielFont[] = ["system", "serif", "handwritten"];
export const AMIRIEL_THEME_OPTIONS = AMIRIEL_BUILTIN_THEME_IDS;

export const AMIRIEL_THEME_DEFAULT_TEXT_COLOR = {
  midnight: "white",
  paper: "black",
  memorial: "white",
} as const satisfies Record<string, AmirielTextColor>;

export const AMIRIEL_FONT_STACKS: Record<AmirielFont, string> = {
  system: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  serif: "Georgia, 'Times New Roman', 'Noto Serif', 'Noto Serif CJK SC', serif",
  handwritten: "'Segoe Print', 'Bradley Hand', 'Kaiti SC', STKaiti, KaiTi, 'Noto Serif CJK SC', cursive, serif",
};

export function themeDefaultTextBlockColor(theme?: AmirielTheme): AmirielTextColor {
  return themeDefaultTextColorFor(theme);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function safeAspectRatio(width?: number, height?: number) {
  if (width && height && width > 0 && height > 0) return clamp(width / height, 0.1, 10);
  return 4 / 3;
}

export function mediaAspectRatio(media?: AmirielMedia) {
  return safeAspectRatio(media?.width, media?.height);
}

export function fallbackHeightPercent(width: number, aspectRatio: number) {
  return clamp(width / aspectRatio, 8, 100);
}

export function heightPercentForWidth(width: number, aspectRatio: number, paperWidth: number, paperHeight: number) {
  if (paperWidth <= 0 || paperHeight <= 0) return fallbackHeightPercent(width, aspectRatio);
  return clamp((width * paperWidth) / (paperHeight * aspectRatio), 8, 100);
}

export function widthPercentForHeight(height: number, aspectRatio: number, paperWidth: number, paperHeight: number) {
  if (paperWidth <= 0 || paperHeight <= 0) return clamp(height * aspectRatio, 8, 100);
  return clamp((height * paperHeight * aspectRatio) / paperWidth, 8, 100);
}

export function mediaSizeWithinPaper(
  preferredWidth: number,
  aspectRatio: number,
  paperWidth: number,
  paperHeight: number,
  maxWidth: number,
  maxHeight: number,
) {
  let width = clamp(preferredWidth, 8, Math.max(8, maxWidth));
  let height = heightPercentForWidth(width, aspectRatio, paperWidth, paperHeight);
  if (height > maxHeight) {
    height = Math.max(8, maxHeight);
    width = clamp(widthPercentForHeight(height, aspectRatio, paperWidth, paperHeight), 8, Math.max(8, maxWidth));
    height = heightPercentForWidth(width, aspectRatio, paperWidth, paperHeight);
  }
  return { width, height };
}

export function normalizeTextBlock(block: AmirielTextBlock, index = 0): AmirielTextBlock {
  return {
    id: block.id,
    x: clamp(block.x, 0, 92),
    y: clamp(block.y, 0, 92),
    width: clamp(block.width || 88, 12, 96),
    height: clamp(block.height || 22, 8, 100),
    text: block.text || "",
    z: Math.max(1, Math.round(block.z || index + 1)),
    ...(block.font && AMIRIEL_FONT_OPTIONS.includes(block.font) ? { font: block.font } : {}),
    ...(block.fontSize ? { fontSize: clamp(block.fontSize, 10, 48) } : {}),
    ...(block.bold ? { bold: true } : {}),
    ...(block.italic ? { italic: true } : {}),
    ...(block.underline ? { underline: true } : {}),
    ...(block.color && AMIRIEL_TEXT_COLOR_OPTIONS.includes(block.color) ? { color: block.color } : {}),
  };
}

export function normalizeTextBlocks(page: AmirielPage): AmirielTextBlock[] {
  const existing = (page.textBlocks ?? []).filter((block) => Boolean(block.id));
  if (existing.length) return existing.map((block, index) => normalizeTextBlock(block, index));
  if (!page.text?.trim()) return [];
  return [{
    id: `legacy-${page.id}`,
    x: 4,
    y: 16,
    width: 88,
    height: 28,
    text: page.text,
    z: 1,
  }];
}

export function normalizePlacement(placement: AmirielMediaPlacement, media?: AmirielMedia): AmirielMediaPlacement {
  const aspectRatio = placement.aspectRatio || mediaAspectRatio(media) || safeAspectRatio(placement.width, placement.height);
  const x = clamp(placement.x, 0, 92);
  const y = clamp(placement.y, 0, 92);
  const width = clamp(placement.width, 8, 100 - x);
  const height = clamp(placement.height || fallbackHeightPercent(width, aspectRatio), 8, 100 - y);
  return {
    id: placement.id,
    mediaId: placement.mediaId,
    x,
    y,
    width,
    height,
    aspectRatio,
    z: Math.max(1, Math.round(placement.z || 1)),
  };
}

export function normalizeMediaPlacements(page: AmirielPage, mediaList: AmirielMedia[]): AmirielMediaPlacement[] {
  const existing = (page.mediaPlacements ?? []).filter((placement) => Boolean(placement.id && placement.mediaId));
  if (existing.length) {
    return existing.map((placement) => normalizePlacement(placement, mediaList.find((item) => item.id === placement.mediaId)));
  }

  return (page.mediaIds ?? []).map((mediaId, index) => {
    const media = mediaList.find((item) => item.id === mediaId);
    const aspectRatio = mediaAspectRatio(media);
    const width = 38;
    return normalizePlacement({
      id: crypto.randomUUID(),
      mediaId,
      x: 10 + (index % 2) * 42,
      y: 28 + Math.floor(index / 2) * 28,
      width,
      height: fallbackHeightPercent(width, aspectRatio),
      aspectRatio,
      z: index + 1,
    }, media);
  });
}

export function combinedPageText(page?: AmirielPage) {
  if (!page) return "";
  const blocks = page.textBlocks ?? [];
  if (blocks.length) return blocks.map((block) => block.text).join("\n");
  return page.text || "";
}

export function syncPageText(page: AmirielPage) {
  page.text = combinedPageText(page);
}

function clonePlainDeep<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => clonePlainDeep(item)) as T;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, clonePlainDeep(entry)]),
  ) as T;
}

export function normalizeDocument(value: AmirielDocument): AmirielDocument {
  const clone = clonePlainDeep(value);
  clone.theme ||= "midnight";
  clone.media ||= [];
  const fallbackPages: AmirielPage[] = [{
    id: crypto.randomUUID(),
    order: 0,
    text: "",
    font: "handwritten",
    mediaIds: [],
    mediaPlacements: [],
    textBlocks: [],
  }];
  clone.pages = (clone.pages?.length ? clone.pages : fallbackPages).map((page, index) => ({
    ...page,
    order: index,
    font: page.font || "handwritten",
    mediaIds: page.mediaIds || [],
    mediaPlacements: normalizeMediaPlacements(page, clone.media),
    textBlocks: normalizeTextBlocks(page),
  }));
  for (const page of clone.pages) syncPageText(page);
  return clone;
}

export function formatVideoDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}
