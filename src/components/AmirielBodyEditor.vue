<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  CheckIcon,
  FilmIcon,
  PhotoIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/vue/24/outline";
import type {
  AmirielDocument,
  AmirielEditorLimits,
  AmirielLabels,
  AmirielMedia,
  AmirielMediaPlacement,
  AmirielMediaRequest,
  AmirielPage,
  AmirielTextBlock,
  AmirielTextColor,
  AmirielTheme,
  AmirielFont,
} from "../types";
import {
  AMIRIEL_FONT_OPTIONS,
  AMIRIEL_FONT_STACKS,
  AMIRIEL_TEXT_COLORS,
  AMIRIEL_TEXT_COLOR_OPTIONS,
  AMIRIEL_THEME_OPTIONS,
  clamp,
  combinedPageText,
  heightPercentForWidth,
  mediaAspectRatio,
  mediaSizeWithinPaper,
  normalizeDocument,
  safeAspectRatio,
  syncPageText,
  themeDefaultTextBlockColor,
} from "../utils";
import { formatAmirielLabel, resolveAmirielLabels } from "../labels";
import AmirielCoreMediaLightbox from "./AmirielMediaLightbox.vue";
import AmirielCoreMediaVideo from "./AmirielMediaVideo.vue";
import AmirielCoreMediaVideoThumbnail from "./AmirielMediaVideoThumbnail.vue";
import GithubMarkIcon from "./GithubMarkIcon.vue";

const DEFAULT_GITHUB_URL = "https://github.com/dingdangdog/Amiriel";

const props = withDefaults(defineProps<{
  modelValue: AmirielDocument;
  readonly?: boolean;
  limits?: AmirielEditorLimits;
  locale?: "en" | "zh";
  labels?: Partial<AmirielLabels>;
  accept?: string;
  showGithubLink?: boolean;
  githubUrl?: string;
}>(), {
  readonly: false,
  locale: "en",
  accept: "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime",
  showGithubLink: true,
  githubUrl: DEFAULT_GITHUB_URL,
});

const emit = defineEmits<{
  "update:modelValue": [value: AmirielDocument];
  "media-request": [request: AmirielMediaRequest];
  "media-removed": [media: AmirielMedia];
}>();

type DragKind = "placement" | "text";
type DragMode = "move" | "resize" | "resize-nw";

interface DragState {
  kind: DragKind;
  mode: DragMode;
  id: string;
  pointerId: number;
  target: HTMLElement;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  paperWidth: number;
  paperHeight: number;
}

const draft = ref<AmirielDocument>(normalizeDocument(props.modelValue));
const selectedPageId = ref(draft.value.pages[0]?.id ?? "");
const activePlacementId = ref("");
const activeTextBlockId = ref("");
const fontMenuId = ref("");
const sizeMenuId = ref("");
const colorMenuId = ref("");
const previewPaperRef = ref<HTMLElement | null>(null);
const uploadBusy = ref(false);
const pendingUpload = ref<{
  file: File;
  previewUrl: string;
  mediaType: "image" | "video";
  status: "uploading" | "failed";
  progress: number | null;
  error?: string;
} | null>(null);
const lightboxMedia = ref<AmirielMedia | null>(null);
const lightboxOpen = ref(false);
const lastTextBlockFont = ref<AmirielFont>("handwritten");
const lastTextBlockColor = ref<AmirielTextColor>(themeDefaultTextBlockColor(draft.value.theme));
const overflowingTextBlockIds = ref(new Set<string>());
const textareaRefs = new Map<string, HTMLTextAreaElement>();
let dragState: DragState | null = null;
let overflowObserver: ResizeObserver | null = null;
let syncingFromParent = false;

const textBlockFontSizes = [12, 14, 16, 18, 20, 24] as const;
const resolvedLabels = computed(() => resolveAmirielLabels(props.locale, props.labels));
const resolvedLimits = computed(() => ({
  maxPages: props.limits?.maxPages ?? 20,
  maxTextBlocksPerPage: props.limits?.maxTextBlocksPerPage ?? 4,
  maxImages: props.limits?.maxImages ?? 3,
  maxVideos: props.limits?.maxVideos ?? 1,
}));
const selectedPage = computed(() => draft.value.pages.find((page) => page.id === selectedPageId.value) ?? draft.value.pages[0]);
const mediaCounts = computed(() => ({
  images: draft.value.media.filter((item) => item.type === "image").length,
  videos: draft.value.media.filter((item) => item.type === "video").length,
}));
const pageLimitReached = computed(() => draft.value.pages.length >= resolvedLimits.value.maxPages);
const uploadLimitReached = computed(() =>
  mediaCounts.value.images >= resolvedLimits.value.maxImages &&
  mediaCounts.value.videos >= resolvedLimits.value.maxVideos,
);

watch(
  () => props.modelValue,
  (value) => {
    syncingFromParent = true;
    draft.value = normalizeDocument(value);
    if (!draft.value.pages.some((page) => page.id === selectedPageId.value)) {
      selectedPageId.value = draft.value.pages[0]?.id ?? "";
    }
    nextTick(() => {
      syncingFromParent = false;
      refreshOverflowStates();
    });
  },
  { deep: true },
);

watch(
  () => draft.value.theme,
  (theme) => {
    lastTextBlockColor.value = themeDefaultTextBlockColor(theme);
  },
);

function label(template: string, values: Record<string, string | number>) {
  return formatAmirielLabel(template, values);
}

function commit() {
  if (syncingFromParent) return;
  const value = normalizeDocument(draft.value);
  draft.value = value;
  emit("update:modelValue", value);
  nextTick(refreshOverflowStates);
}

function fontStyle(font?: AmirielFont) {
  return { fontFamily: AMIRIEL_FONT_STACKS[font || "handwritten"] };
}

function textBlockFont(block: AmirielTextBlock, pageFont?: AmirielFont) {
  return block.font || pageFont || "handwritten";
}

function textBlockFontSize(block: AmirielTextBlock) {
  return block.fontSize || 16;
}

function textBlockColorHex(block: AmirielTextBlock) {
  return block.color ? AMIRIEL_TEXT_COLORS[block.color] : undefined;
}

function textBlockContentStyle(block: AmirielTextBlock, pageFont?: AmirielFont) {
  return {
    ...fontStyle(textBlockFont(block, pageFont)),
    fontSize: `${textBlockFontSize(block)}px`,
    fontWeight: block.bold ? "700" : undefined,
    fontStyle: block.italic ? "italic" : undefined,
    textDecoration: block.underline ? "underline" : undefined,
    ...(textBlockColorHex(block) ? { color: textBlockColorHex(block) } : {}),
  };
}

function textBlockStyle(block: AmirielTextBlock) {
  return {
    left: `${block.x}%`,
    top: `${block.y}%`,
    width: `${block.width}%`,
    height: `${block.height || 22}%`,
    zIndex: block.z,
  };
}

function mediaById(id: string) {
  return draft.value.media.find((item) => item.id === id);
}

function mediaThumbnail(item: AmirielMedia) {
  return item.thumbnailUrl || item.url;
}

function pageTextBlocks(page?: AmirielPage) {
  return page?.textBlocks ?? [];
}

function pagePlacements(page?: AmirielPage) {
  return page?.mediaPlacements ?? [];
}

function pageHasMedia(page: AmirielPage | undefined, mediaId: string) {
  return Boolean(page?.mediaPlacements?.some((placement) => placement.mediaId === mediaId));
}

function currentPaperRect() {
  return previewPaperRef.value?.getBoundingClientRect();
}

function placementStyle(placement: AmirielMediaPlacement) {
  const media = mediaById(placement.mediaId);
  return {
    left: `${placement.x}%`,
    top: `${placement.y}%`,
    width: `${placement.width}%`,
    aspectRatio: String(placement.aspectRatio || safeAspectRatio(media?.width, media?.height) || safeAspectRatio(placement.width, placement.height)),
    zIndex: placement.z,
  };
}

function nextZ(page: AmirielPage) {
  return Math.max(
    0,
    ...(page.mediaPlacements ?? []).map((placement) => placement.z),
    ...(page.textBlocks ?? []).map((block) => block.z),
  ) + 1;
}

function syncPageMediaIds(page: AmirielPage) {
  page.mediaIds = Array.from(new Set((page.mediaPlacements ?? []).map((placement) => placement.mediaId)));
}

function selectTheme(theme: AmirielTheme) {
  if (props.readonly) return;
  draft.value.theme = theme;
  commit();
}

function addPage() {
  if (props.readonly || pageLimitReached.value) return;
  const page: AmirielPage = {
    id: crypto.randomUUID(),
    order: draft.value.pages.length,
    text: "",
    font: "handwritten",
    mediaIds: [],
    mediaPlacements: [],
    textBlocks: [],
  };
  draft.value.pages.push(page);
  selectedPageId.value = page.id;
  commit();
}

function removePage(id: string) {
  if (props.readonly || draft.value.pages.length <= 1) return;
  const removedIndex = draft.value.pages.findIndex((page) => page.id === id);
  draft.value.pages = draft.value.pages
    .filter((page) => page.id !== id)
    .map((page, index) => ({ ...page, order: index }));
  selectedPageId.value = draft.value.pages[Math.max(removedIndex - 1, 0)]?.id ?? draft.value.pages[0]?.id ?? "";
  commit();
}

function textBlockLimitReached(page?: AmirielPage) {
  return (page?.textBlocks ?? []).length >= resolvedLimits.value.maxTextBlocksPerPage;
}

function addTextBlockAt(event?: PointerEvent) {
  if (!selectedPage.value || props.readonly || !previewPaperRef.value || textBlockLimitReached(selectedPage.value)) return;
  const rect = previewPaperRef.value.getBoundingClientRect();
  const x = event ? ((event.clientX - rect.left) / rect.width) * 100 : 8;
  const y = event ? ((event.clientY - rect.top) / rect.height) * 100 : 28;
  const block: AmirielTextBlock = {
    id: crypto.randomUUID(),
    x: clamp(x, 0, 78),
    y: clamp(y, 0, 88),
    width: 42,
    height: 18,
    text: "",
    z: nextZ(selectedPage.value),
    font: lastTextBlockFont.value,
    fontSize: 16,
    color: lastTextBlockColor.value,
  };
  selectedPage.value.textBlocks = [...(selectedPage.value.textBlocks ?? []), block];
  activeTextBlockId.value = block.id;
  activePlacementId.value = "";
  syncPageText(selectedPage.value);
  commit();
}

function removeTextBlock(blockId: string) {
  if (!selectedPage.value || props.readonly) return;
  selectedPage.value.textBlocks = (selectedPage.value.textBlocks ?? []).filter((block) => block.id !== blockId);
  if (activeTextBlockId.value === blockId) activeTextBlockId.value = "";
  syncPageText(selectedPage.value);
  commit();
}

function confirmRemoveTextBlock(blockId: string) {
  if (!window.confirm(resolvedLabels.value.deleteTextBlockConfirm)) return;
  removeTextBlock(blockId);
}

function selectTextBlock(page: AmirielPage, block: AmirielTextBlock) {
  activeTextBlockId.value = block.id;
  activePlacementId.value = "";
  block.z = nextZ(page);
}

function deselectTextBlock(blockId: string, container: HTMLElement) {
  window.setTimeout(() => {
    if (dragState) return;
    if (container.contains(document.activeElement)) return;
    if (activeTextBlockId.value !== blockId) return;
    activeTextBlockId.value = "";
    closeMenus();
  }, 0);
}

function onTextBlockFocusOut(event: FocusEvent, blockId: string) {
  deselectTextBlock(blockId, event.currentTarget as HTMLElement);
}

function onTextBlockInput(page: AmirielPage) {
  syncPageText(page);
  commit();
}

function toggleTextBlockFontMenu(blockId: string) {
  fontMenuId.value = fontMenuId.value === blockId ? "" : blockId;
  sizeMenuId.value = "";
  colorMenuId.value = "";
}

function toggleTextBlockSizeMenu(blockId: string) {
  sizeMenuId.value = sizeMenuId.value === blockId ? "" : blockId;
  fontMenuId.value = "";
  colorMenuId.value = "";
}

function toggleTextBlockColorMenu(blockId: string) {
  colorMenuId.value = colorMenuId.value === blockId ? "" : blockId;
  fontMenuId.value = "";
  sizeMenuId.value = "";
}

function selectTextBlockFont(block: AmirielTextBlock, font: AmirielFont) {
  block.font = font;
  lastTextBlockFont.value = font;
  fontMenuId.value = "";
  commit();
}

function selectTextBlockFontSize(block: AmirielTextBlock, size: number) {
  block.fontSize = size;
  sizeMenuId.value = "";
  commit();
}

function selectTextBlockColor(block: AmirielTextBlock, color: AmirielTextColor) {
  block.color = color;
  lastTextBlockColor.value = color;
  colorMenuId.value = "";
  commit();
}

function toggleTextBlockBold(block: AmirielTextBlock) {
  block.bold = !block.bold;
  commit();
}

function toggleTextBlockItalic(block: AmirielTextBlock) {
  block.italic = !block.italic;
  commit();
}

function toggleTextBlockUnderline(block: AmirielTextBlock) {
  block.underline = !block.underline;
  commit();
}

function selectPlacement(page: AmirielPage, placement: AmirielMediaPlacement) {
  activePlacementId.value = placement.id;
  activeTextBlockId.value = "";
  placement.z = nextZ(page);
}

function addMediaToPage(mediaId: string) {
  if (!selectedPage.value || props.readonly) return;
  const aspectRatio = mediaAspectRatio(mediaById(mediaId));
  const z = nextZ(selectedPage.value);
  const offset = (z - 1) % 6;
  const rect = currentPaperRect();
  const x = 10 + (offset % 3) * 8;
  const y = 24 + Math.floor(offset / 3) * 8;
  const size = mediaSizeWithinPaper(38, aspectRatio, rect?.width || 0, rect?.height || 0, 100 - x, 100 - y);
  const placement: AmirielMediaPlacement = {
    id: crypto.randomUUID(),
    mediaId,
    x,
    y,
    width: size.width,
    height: size.height,
    aspectRatio,
    z,
  };
  selectedPage.value.mediaPlacements = [...(selectedPage.value.mediaPlacements ?? []), placement];
  activePlacementId.value = placement.id;
  activeTextBlockId.value = "";
  syncPageMediaIds(selectedPage.value);
}

function detachMediaFromPage(page: AmirielPage, mediaId: string) {
  page.mediaPlacements = (page.mediaPlacements ?? []).filter((placement) => placement.mediaId !== mediaId);
  syncPageMediaIds(page);
  commit();
}

function removePlacementFromPage(page: AmirielPage, placementId: string) {
  page.mediaPlacements = (page.mediaPlacements ?? []).filter((placement) => placement.id !== placementId);
  if (activePlacementId.value === placementId) activePlacementId.value = "";
  syncPageMediaIds(page);
  commit();
}

function toggleMediaOnSelectedPage(mediaId: string) {
  if (!selectedPage.value || props.readonly) return;
  if (pageHasMedia(selectedPage.value, mediaId)) {
    detachMediaFromPage(selectedPage.value, mediaId);
    return;
  }
  addMediaToPage(mediaId);
  commit();
}

function removeMedia(id: string) {
  if (props.readonly) return;
  const media = mediaById(id);
  draft.value.media = draft.value.media.filter((item) => item.id !== id);
  draft.value.pages = draft.value.pages.map((page) => ({
    ...page,
    mediaIds: (page.mediaIds ?? []).filter((mediaId) => mediaId !== id),
    mediaPlacements: (page.mediaPlacements ?? []).filter((placement) => placement.mediaId !== id),
  }));
  if (media) emit("media-removed", media);
  commit();
}

function clearPendingUpload() {
  if (pendingUpload.value?.previewUrl) {
    URL.revokeObjectURL(pendingUpload.value.previewUrl);
  }
  pendingUpload.value = null;
}

async function runMediaUpload(file: File) {
  if (!selectedPage.value || props.readonly) return;

  clearPendingUpload();

  const previewUrl = URL.createObjectURL(file);
  pendingUpload.value = {
    file,
    previewUrl,
    mediaType: file.type.startsWith("video/") ? "video" : "image",
    status: "uploading",
    progress: null,
  };
  uploadBusy.value = true;

  try {
    const media = await new Promise<AmirielMedia>((resolve, reject) => {
      const request: AmirielMediaRequest = {
        file,
        pageId: selectedPage.value!.id,
        onProgress: (info) => {
          if (!pendingUpload.value || pendingUpload.value.status !== "uploading") return;
          pendingUpload.value = {
            ...pendingUpload.value,
            progress: info.progress,
          };
        },
        resolve,
        reject: (message?: string) => reject(new Error(message || resolvedLabels.value.uploadFailed)),
      };
      emit("media-request", request);
      if (!request.handled) reject(new Error(resolvedLabels.value.mediaUploadMissing));
    });
    draft.value.media.push(media);
    addMediaToPage(media.id);
    commit();
    clearPendingUpload();
  } catch (error: any) {
    if (pendingUpload.value) {
      pendingUpload.value = {
        ...pendingUpload.value,
        status: "failed",
        progress: null,
        error: error?.message || resolvedLabels.value.uploadFailed,
      };
    }
  } finally {
    uploadBusy.value = false;
  }
}

async function onMediaSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !selectedPage.value || props.readonly || uploadLimitReached.value || uploadBusy.value) return;
  await runMediaUpload(file);
}

function dismissFailedUpload() {
  clearPendingUpload();
}

function retryFailedUpload() {
  const pending = pendingUpload.value;
  if (!pending || pending.status !== "failed" || uploadBusy.value) return;
  void runMediaUpload(pending.file);
}

function openMediaLightbox(media: AmirielMedia) {
  lightboxMedia.value = media;
  lightboxOpen.value = true;
}

function closeMediaLightbox() {
  lightboxOpen.value = false;
  lightboxMedia.value = null;
}

function updateMediaIntrinsicSize(mediaId: string, width?: number, height?: number) {
  if (!width || !height) return;
  const media = mediaById(mediaId);
  if (media) {
    media.width = width;
    media.height = height;
  }
  const aspectRatio = safeAspectRatio(width, height);
  for (const page of draft.value.pages) {
    for (const placement of page.mediaPlacements ?? []) {
      if (placement.mediaId !== mediaId) continue;
      placement.aspectRatio = aspectRatio;
    }
  }
  commit();
}

function onPlacementImageLoaded(event: Event, mediaId: string) {
  const image = event.currentTarget as HTMLImageElement;
  updateMediaIntrinsicSize(mediaId, image.naturalWidth, image.naturalHeight);
}

function onPlacementVideoLoaded(event: Event, mediaId: string) {
  const video = event.currentTarget as HTMLVideoElement;
  updateMediaIntrinsicSize(mediaId, video.videoWidth, video.videoHeight);
  if (Number.isFinite(video.duration) && video.duration > 0) {
    const media = mediaById(mediaId);
    if (media) media.duration = video.duration;
  }
  commit();
}

function onMediaDuration(mediaId: string, duration: number) {
  const media = mediaById(mediaId);
  if (!media || !Number.isFinite(duration) || duration <= 0) return;
  media.duration = duration;
  commit();
}

function beginDrag(event: PointerEvent, kind: DragKind, item: AmirielMediaPlacement | AmirielTextBlock, mode: DragMode) {
  if (props.readonly || !selectedPage.value || !previewPaperRef.value || event.button !== 0) return;
  event.preventDefault();
  const rect = previewPaperRef.value.getBoundingClientRect();
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture?.(event.pointerId);
  if (kind === "placement") selectPlacement(selectedPage.value, item as AmirielMediaPlacement);
  else selectTextBlock(selectedPage.value, item as AmirielTextBlock);
  dragState = {
    kind,
    mode,
    id: item.id,
    pointerId: event.pointerId,
    target,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: item.x,
    startY: item.y,
    startWidth: item.width,
    startHeight: item.height || 22,
    paperWidth: rect.width,
    paperHeight: rect.height,
  };
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
}

function onDragMove(event: PointerEvent) {
  if (!dragState || !selectedPage.value || event.pointerId !== dragState.pointerId) return;
  const dx = ((event.clientX - dragState.startClientX) / dragState.paperWidth) * 100;
  const dy = ((event.clientY - dragState.startClientY) / dragState.paperHeight) * 100;
  const item = dragState.kind === "placement"
    ? selectedPage.value.mediaPlacements?.find((placement) => placement.id === dragState?.id)
    : selectedPage.value.textBlocks?.find((block) => block.id === dragState?.id);
  if (!item) return;

  if (dragState.mode === "move") {
    item.x = clamp(dragState.startX + dx, 0, 100 - item.width);
    item.y = clamp(dragState.startY + dy, 0, 100 - (item.height || dragState.startHeight));
  } else if (dragState.kind === "placement") {
    const placement = item as AmirielMediaPlacement;
    const aspectRatio = placement.aspectRatio || mediaAspectRatio(mediaById(placement.mediaId));
    if (dragState.mode === "resize-nw") {
      const newX = clamp(dragState.startX + dx, 0, dragState.startX + dragState.startWidth - 8);
      const newWidth = clamp(dragState.startWidth + (dragState.startX - newX), 8, 100 - newX);
      const newHeight = heightPercentForWidth(newWidth, aspectRatio, dragState.paperWidth, dragState.paperHeight);
      placement.x = newX;
      placement.y = clamp(dragState.startY + dragState.startHeight - newHeight, 0, 100 - newHeight);
      placement.width = newWidth;
      placement.height = newHeight;
    } else {
      const width = clamp(dragState.startWidth + dx, 8, 100 - placement.x);
      const height = heightPercentForWidth(width, aspectRatio, dragState.paperWidth, dragState.paperHeight);
      placement.width = width;
      placement.height = clamp(height, 8, 100 - placement.y);
    }
  } else {
    item.width = clamp(dragState.startWidth + dx, 12, 100 - item.x);
    item.height = clamp(dragState.startHeight + dy, 8, 100 - item.y);
  }
}

function endDrag() {
  if (!dragState) return;
  const wasTextDrag = dragState.kind === "text";
  dragState.target.releasePointerCapture?.(dragState.pointerId);
  dragState = null;
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", endDrag);
  commit();
  if (wasTextDrag) {
    activeTextBlockId.value = "";
    closeMenus();
  }
}

function setTextBlockTextareaRef(blockId: string, el: unknown) {
  if (el instanceof HTMLTextAreaElement) textareaRefs.set(blockId, el);
  else textareaRefs.delete(blockId);
}

function isTextareaOverflowing(element: HTMLTextAreaElement) {
  return element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1;
}

function refreshOverflowStates() {
  const next = new Set<string>();
  for (const [blockId, element] of textareaRefs.entries()) {
    if (isTextareaOverflowing(element)) next.add(blockId);
  }
  overflowingTextBlockIds.value = next;
  setupOverflowObserver();
}

function isTextBlockOverflowing(blockId: string) {
  return overflowingTextBlockIds.value.has(blockId);
}

function setupOverflowObserver() {
  overflowObserver?.disconnect();
  overflowObserver = null;
  if (!previewPaperRef.value || typeof ResizeObserver === "undefined") return;
  overflowObserver = new ResizeObserver(refreshOverflowStates);
  overflowObserver.observe(previewPaperRef.value);
  for (const element of textareaRefs.values()) overflowObserver.observe(element);
}

function closeMenus() {
  fontMenuId.value = "";
  sizeMenuId.value = "";
  colorMenuId.value = "";
}

function onLayoutClick(event: MouseEvent) {
  closeMenus();
  if (!(event.target as Element).closest?.(".amiriel-body-editor__text-block")) {
    activeTextBlockId.value = "";
  }
}

onMounted(refreshOverflowStates);
onUnmounted(() => {
  overflowObserver?.disconnect();
  endDrag();
  clearPendingUpload();
});
</script>

<template>
  <section class="amiriel-body-editor" :class="[`amiriel-theme-${draft.theme || 'midnight'}`]">
    <header class="amiriel-body-editor__bar">
      <div class="amiriel-body-editor__pages">
        <button v-for="page in draft.pages" :key="page.id" type="button" class="amiriel-body-editor__page-button"
          :class="{ 'is-active': selectedPageId === page.id }" @click="selectedPageId = page.id">
          {{ page.order + 1 }}
        </button>
        <button v-if="!readonly" type="button" class="amiriel-body-editor__icon-button" :disabled="pageLimitReached"
          :title="resolvedLabels.addPage" :aria-label="resolvedLabels.addPage" @click="addPage">
          <PlusIcon />
        </button>
      </div>
      <div class="amiriel-body-editor__theme" role="radiogroup" :aria-label="resolvedLabels.themeLabel">
        <button v-for="theme in AMIRIEL_THEME_OPTIONS" :key="theme" type="button" role="radio"
          class="amiriel-body-editor__theme-button" :class="{ 'is-active': draft.theme === theme }"
          :aria-checked="draft.theme === theme" :disabled="readonly" @click="selectTheme(theme)">
          <span class="amiriel-body-editor__swatch" :class="`is-${theme}`" />
          <span>{{ resolvedLabels.themes[theme] }}</span>
        </button>
      </div>
    </header>

    <div class="amiriel-body-editor__layout" @click="onLayoutClick">
      <div class="amiriel-body-editor__workspace">
        <article ref="previewPaperRef" class="amiriel-body-editor__paper" @pointerdown.self="addTextBlockAt($event)">
          <button v-if="!readonly && selectedPage" type="button" class="amiriel-body-editor__delete-page"
            :disabled="draft.pages.length <= 1" :aria-label="resolvedLabels.removePage"
            :title="resolvedLabels.removePage" @click.stop="removePage(selectedPage.id)">
            <TrashIcon />
          </button>
          <div class="amiriel-body-editor__paper-head">
            <p>{{ label(resolvedLabels.pagesCount, { count: draft.pages.length, max: resolvedLimits.maxPages }) }}</p>
          </div>
          <p v-if="!pageTextBlocks(selectedPage).length && !readonly" class="amiriel-body-editor__hint">
            {{ resolvedLabels.tapPaperHint }}
          </p>
          <p v-else-if="!pageTextBlocks(selectedPage).length" class="amiriel-body-editor__fallback-text"
            :style="fontStyle(selectedPage?.font)">
            {{ resolvedLabels.pagePlaceholder }}
          </p>

          <div v-if="pageTextBlocks(selectedPage).length" class="amiriel-body-editor__text-layer">
            <div v-for="block in pageTextBlocks(selectedPage)" :key="block.id" class="amiriel-body-editor__text-block"
              :class="{ 'is-active': activeTextBlockId === block.id, 'is-overflowing': isTextBlockOverflowing(block.id) }"
              :style="textBlockStyle(block)"
              :title="isTextBlockOverflowing(block.id) ? resolvedLabels.textBlockOverflowHint : undefined"
              @pointerdown.stop="selectedPage && selectTextBlock(selectedPage, block)"
              @focusout="onTextBlockFocusOut($event, block.id)">
              <textarea v-model="block.text" :ref="(el) => setTextBlockTextareaRef(block.id, el)"
                class="amiriel-body-editor__textarea" :style="textBlockContentStyle(block, selectedPage?.font)"
                :placeholder="resolvedLabels.pagePlaceholder" :disabled="readonly"
                @input="selectedPage && onTextBlockInput(selectedPage)" @pointerdown.stop
                @focus="selectedPage && selectTextBlock(selectedPage, block)" />
              <div v-if="!readonly && activeTextBlockId === block.id" class="amiriel-body-editor__text-tools"
                @mousedown.prevent>
                <button type="button" :aria-label="resolvedLabels.moveTextBlock" :title="resolvedLabels.moveTextBlock"
                  @pointerdown.stop="beginDrag($event, 'text', block, 'move')">
                  <ArrowsPointingOutIcon />
                </button>
                <div class="amiriel-body-editor__menu-wrap">
                  <button type="button" :aria-label="resolvedLabels.textBlockFont" :title="resolvedLabels.textBlockFont"
                    :style="fontStyle(textBlockFont(block, selectedPage?.font))" @pointerdown.stop
                    @click.stop="toggleTextBlockFontMenu(block.id)">
                    Aa
                  </button>
                  <div v-if="fontMenuId === block.id" class="amiriel-body-editor__menu">
                    <button v-for="font in AMIRIEL_FONT_OPTIONS" :key="font" type="button" :style="fontStyle(font)"
                      @pointerdown.stop @click.stop="selectTextBlockFont(block, font)">
                      <span>{{ resolvedLabels.fonts[font] }}</span>
                      <CheckIcon v-if="textBlockFont(block, selectedPage?.font) === font" />
                    </button>
                  </div>
                </div>
                <div class="amiriel-body-editor__menu-wrap">
                  <button type="button" :aria-label="resolvedLabels.textBlockFontSize"
                    :title="resolvedLabels.textBlockFontSize" @pointerdown.stop
                    @click.stop="toggleTextBlockSizeMenu(block.id)">
                    {{ textBlockFontSize(block) }}
                  </button>
                  <div v-if="sizeMenuId === block.id" class="amiriel-body-editor__menu is-compact">
                    <button v-for="size in textBlockFontSizes" :key="size" type="button" @pointerdown.stop
                      @click.stop="selectTextBlockFontSize(block, size)">
                      <span>{{ size }}</span>
                      <CheckIcon v-if="textBlockFontSize(block) === size" />
                    </button>
                  </div>
                </div>
                <button type="button" :class="{ 'is-on': block.bold }" :aria-label="resolvedLabels.textBlockBold"
                  :title="resolvedLabels.textBlockBold" @pointerdown.stop
                  @click.stop="toggleTextBlockBold(block)">B</button>
                <button type="button" class="is-italic" :class="{ 'is-on': block.italic }"
                  :aria-label="resolvedLabels.textBlockItalic" :title="resolvedLabels.textBlockItalic" @pointerdown.stop
                  @click.stop="toggleTextBlockItalic(block)">I</button>
                <button type="button" class="is-underline" :class="{ 'is-on': block.underline }"
                  :aria-label="resolvedLabels.textBlockUnderline" :title="resolvedLabels.textBlockUnderline"
                  @pointerdown.stop @click.stop="toggleTextBlockUnderline(block)">U</button>
                <div class="amiriel-body-editor__menu-wrap">
                  <button type="button" :aria-label="resolvedLabels.textBlockColor"
                    :title="resolvedLabels.textBlockColor" @pointerdown.stop
                    @click.stop="toggleTextBlockColorMenu(block.id)">
                    <span class="amiriel-body-editor__color-dot"
                      :style="{ backgroundColor: textBlockColorHex(block) || 'transparent' }" />
                  </button>
                  <div v-if="colorMenuId === block.id" class="amiriel-body-editor__color-menu">
                    <button v-for="color in AMIRIEL_TEXT_COLOR_OPTIONS" :key="color" type="button"
                      :class="{ 'is-active': block.color === color }" @pointerdown.stop
                      @click.stop="selectTextBlockColor(block, color)">
                      <span :style="{ backgroundColor: AMIRIEL_TEXT_COLORS[color] }" />
                    </button>
                  </div>
                </div>
                <a
                  v-if="showGithubLink"
                  :href="githubUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="amiriel-body-editor__github-link"
                  :aria-label="resolvedLabels.viewOnGithub"
                  :title="resolvedLabels.viewOnGithub"
                  @pointerdown.stop
                >
                  <GithubMarkIcon />
                </a>
                <button type="button" class="is-danger" :aria-label="resolvedLabels.deleteTextBlock"
                  :title="resolvedLabels.deleteTextBlock" @pointerdown.stop
                  @click.stop="confirmRemoveTextBlock(block.id)">
                  <TrashIcon />
                </button>
              </div>
              <span v-if="!readonly && activeTextBlockId === block.id" class="amiriel-body-editor__resize"
                :aria-label="resolvedLabels.resizeTextBlock" role="button" tabindex="0"
                @pointerdown.stop="beginDrag($event, 'text', block, 'resize')" />
            </div>
          </div>

          <div v-if="pagePlacements(selectedPage).length" class="amiriel-body-editor__media-layer">
            <template v-for="placement in pagePlacements(selectedPage)" :key="placement.id">
              <div v-if="mediaById(placement.mediaId)" class="amiriel-body-editor__placement"
                :class="{ 'is-active': activePlacementId === placement.id }" :style="placementStyle(placement)"
                @pointerdown.stop="beginDrag($event, 'placement', placement, 'move')">
                <img v-if="mediaById(placement.mediaId)?.type === 'image'" :src="mediaById(placement.mediaId)?.url"
                  :alt="mediaById(placement.mediaId)?.objectKey || 'media'" draggable="false" @dragstart.prevent
                  @load="onPlacementImageLoaded($event, placement.mediaId)"
                  @dblclick.stop="openMediaLightbox(mediaById(placement.mediaId)!)" />
                <AmirielCoreMediaVideo v-else :media="mediaById(placement.mediaId)!" show-duration-badge muted
                  preload="metadata" @loadedmetadata="onPlacementVideoLoaded($event, placement.mediaId)"
                  @duration="onMediaDuration(placement.mediaId, $event)"
                  @dblclick.stop="openMediaLightbox(mediaById(placement.mediaId)!)" />
                <span v-if="mediaById(placement.mediaId)?.type === 'video'" class="amiriel-body-editor__video-mark"
                  aria-hidden="true">
                  <FilmIcon />
                </span>
                <div v-if="!readonly && activePlacementId === placement.id"
                  class="amiriel-body-editor__placement-tools">
                  <button type="button"
                    :aria-label="mediaById(placement.mediaId)?.type === 'video' ? resolvedLabels.playMedia : resolvedLabels.viewFullscreen"
                    @pointerdown.stop @click.stop="openMediaLightbox(mediaById(placement.mediaId)!)">
                    <PlayIcon v-if="mediaById(placement.mediaId)?.type === 'video'" />
                    <ArrowsPointingOutIcon v-else />
                  </button>
                  <button type="button" class="is-danger" :aria-label="resolvedLabels.detachMedia" @pointerdown.stop
                    @click.stop="selectedPage && removePlacementFromPage(selectedPage, placement.id)">
                    <TrashIcon />
                  </button>
                </div>
                <span v-if="!readonly && activePlacementId === placement.id" class="amiriel-body-editor__resize is-nw"
                  :aria-label="resolvedLabels.resizeMedia" role="button" tabindex="0"
                  @pointerdown.stop="beginDrag($event, 'placement', placement, 'resize-nw')" />
                <span v-if="!readonly && activePlacementId === placement.id" class="amiriel-body-editor__resize"
                  :aria-label="resolvedLabels.resizeMedia" role="button" tabindex="0"
                  @pointerdown.stop="beginDrag($event, 'placement', placement, 'resize')" />
              </div>
            </template>
          </div>
          <div v-if="!pagePlacements(selectedPage).length && !readonly" class="amiriel-body-editor__media-hint">
            {{ resolvedLabels.pageMediaHint }}
          </div>
        </article>
      </div>

      <aside class="amiriel-body-editor__side">
        <section class="amiriel-body-editor__panel">
          <div class="amiriel-body-editor__panel-head">
            <h3>{{ resolvedLabels.textBlocksTitle }}</h3>
            <button v-if="!readonly" type="button" class="amiriel-body-editor__icon-button"
              :disabled="!selectedPage || textBlockLimitReached(selectedPage)" :title="resolvedLabels.addTextBlock"
              :aria-label="resolvedLabels.addTextBlock" @click="addTextBlockAt()">
              <PlusIcon />
            </button>
          </div>
          <div class="amiriel-body-editor__stats">
            <span>{{ label(resolvedLabels.textBlockLimit, {
              count: pageTextBlocks(selectedPage).length, max:
                resolvedLimits.maxTextBlocksPerPage }) }}</span>
            <span>{{ label(resolvedLabels.charCount, { count: combinedPageText(selectedPage).trim().length }) }}</span>
          </div>
        </section>

        <section class="amiriel-body-editor__panel">
          <div class="amiriel-body-editor__panel-head">
            <h3>{{ resolvedLabels.allMediaTitle }}</h3>
            <label v-if="!readonly" class="amiriel-body-editor__icon-button is-label"
              :class="{ 'is-disabled': uploadBusy || uploadLimitReached }"
              :title="uploadBusy ? resolvedLabels.uploading : resolvedLabels.uploadMedia"
              :aria-label="uploadBusy ? resolvedLabels.uploading : resolvedLabels.uploadMedia">
              <PlusIcon />
              <input type="file" :accept="accept" :disabled="uploadBusy || uploadLimitReached"
                @change="onMediaSelected" />
            </label>
          </div>
          <div class="amiriel-body-editor__stats">
            <span>{{ label(resolvedLabels.imageQuota, { count: mediaCounts.images, max: resolvedLimits.maxImages })
              }}</span>
            <span>{{ label(resolvedLabels.videoQuota, { count: mediaCounts.videos, max: resolvedLimits.maxVideos })
              }}</span>
          </div>
          <div v-if="draft.media.length || pendingUpload" class="amiriel-body-editor__media-grid">
            <div
              v-if="pendingUpload"
              class="amiriel-body-editor__media-tile"
              :class="pendingUpload.status === 'failed' ? 'is-failed' : 'is-pending'"
            >
              <div class="amiriel-body-editor__media-preview">
                <img v-if="pendingUpload.mediaType === 'image'" :src="pendingUpload.previewUrl" alt="" />
                <video v-else :src="pendingUpload.previewUrl" muted playsinline preload="metadata" />
                <div
                  v-if="pendingUpload.status === 'uploading'"
                  class="amiriel-body-editor__upload-overlay"
                  aria-live="polite"
                >
                  <span class="amiriel-body-editor__upload-label">
                    {{ resolvedLabels.uploading }}
                    <template v-if="pendingUpload.progress !== null"> {{ pendingUpload.progress }}%</template>
                  </span>
                  <div class="amiriel-body-editor__upload-progress" role="progressbar" :aria-valuenow="pendingUpload.progress ?? undefined" aria-valuemin="0" aria-valuemax="100">
                    <div
                      class="amiriel-body-editor__upload-progress-bar"
                      :class="{ 'is-indeterminate': pendingUpload.progress === null }"
                      :style="pendingUpload.progress === null ? undefined : { width: `${pendingUpload.progress}%` }"
                    />
                  </div>
                </div>
                <div
                  v-else
                  class="amiriel-body-editor__upload-overlay is-failed"
                  role="alert"
                  :aria-label="resolvedLabels.uploadFailed"
                >
                  <p class="amiriel-body-editor__upload-failed-title">{{ resolvedLabels.uploadFailed }}</p>
                  <div class="amiriel-body-editor__upload-failed-actions">
                    <button type="button" @click.stop="retryFailedUpload">
                      <ArrowPathIcon />
                      {{ resolvedLabels.retryUpload }}
                    </button>
                    <button type="button" class="is-muted" @click.stop="dismissFailedUpload">
                      <XMarkIcon />
                      {{ resolvedLabels.dismissFailedUpload }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div v-for="item in draft.media" :key="item.id" class="amiriel-body-editor__media-tile"
              :class="{ 'is-on-page': pageHasMedia(selectedPage, item.id) }">
              <button type="button" class="amiriel-body-editor__media-preview"
                :aria-label="item.type === 'image' ? resolvedLabels.image : resolvedLabels.video"
                @click="openMediaLightbox(item)">
                <img v-if="item.type === 'image'" :src="mediaThumbnail(item)" :alt="item.objectKey || 'media'" />
                <AmirielCoreMediaVideoThumbnail v-else :media="item" />
              </button>
              <button v-if="!readonly" type="button" class="amiriel-body-editor__tile-action is-top"
                :aria-label="pageHasMedia(selectedPage, item.id) ? resolvedLabels.detachMedia : resolvedLabels.addMediaToPage"
                :title="pageHasMedia(selectedPage, item.id) ? resolvedLabels.detachMedia : resolvedLabels.addMediaToPage"
                @click.stop="toggleMediaOnSelectedPage(item.id)">
                <CheckIcon v-if="pageHasMedia(selectedPage, item.id)" />
                <PlusIcon v-else />
              </button>
              <button v-if="!readonly" type="button" class="amiriel-body-editor__tile-action is-bottom is-danger"
                :aria-label="resolvedLabels.removeMedia" :title="resolvedLabels.removeMedia"
                @click.stop="removeMedia(item.id)">
                <TrashIcon />
              </button>
            </div>
          </div>
          <p v-else class="amiriel-body-editor__empty">{{ resolvedLabels.mediaEmpty }}</p>
        </section>
      </aside>
    </div>

    <AmirielCoreMediaLightbox :open="lightboxOpen" :media="lightboxMedia" :close-label="resolvedLabels.close"
      :image-label="resolvedLabels.image" :video-label="resolvedLabels.video" @close="closeMediaLightbox" />
  </section>
</template>

<style>
.amiriel-body-editor {
  --amiriel-editor-panel: rgba(0, 0, 0, 0.2);
  --amiriel-editor-border: rgba(255, 255, 255, 0.1);
  --amiriel-editor-text: #f4f4f5;
  --amiriel-editor-muted: #a8a8a8;
  --amiriel-editor-faint: #949494;
  --amiriel-editor-accent: #d6aa67;
  --amiriel-paper-border: rgba(214, 170, 103, 0.24);
  --amiriel-paper-bg: radial-gradient(circle at 12% 0%, rgba(214, 170, 103, 0.1), transparent 38%), linear-gradient(180deg, #171718 0%, #09090a 100%);
  --amiriel-paper-text: #eadfce;
  --amiriel-paper-divider: rgba(214, 170, 103, 0.2);
  --amiriel-paper-accent: rgba(214, 170, 103, 0.8);
  color: var(--amiriel-editor-text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.amiriel-body-editor.amiriel-theme-paper {
  --amiriel-paper-border: rgba(180, 140, 80, 0.34);
  --amiriel-paper-bg: radial-gradient(circle at 12% 0%, rgba(214, 170, 103, 0.14), transparent 38%), linear-gradient(180deg, #f7f2e8 0%, #ebe3d4 100%);
  --amiriel-paper-text: #3a3228;
  --amiriel-paper-divider: rgba(180, 140, 80, 0.24);
  --amiriel-paper-accent: rgba(122, 88, 42, 0.88);
}

.amiriel-body-editor.amiriel-theme-memorial {
  --amiriel-paper-border: rgba(159, 178, 122, 0.28);
  --amiriel-paper-bg: radial-gradient(circle at 12% 0%, rgba(159, 178, 122, 0.1), transparent 38%), linear-gradient(180deg, #1e2822 0%, #121916 100%);
  --amiriel-paper-text: #dde5d4;
  --amiriel-paper-divider: rgba(159, 178, 122, 0.2);
  --amiriel-paper-accent: rgba(159, 178, 122, 0.88);
}

.amiriel-body-editor button {
  font: inherit;
}

.amiriel-body-editor__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1.25rem 1.25rem 0;
}

.amiriel-body-editor__pages,
.amiriel-body-editor__theme {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.amiriel-body-editor__page-button,
.amiriel-body-editor__icon-button,
.amiriel-body-editor__theme-button {
  min-height: 2.25rem;
  border: 1px solid var(--amiriel-editor-border);
  border-radius: 0.55rem;
  background: rgba(0, 0, 0, 0.22);
  color: var(--amiriel-editor-muted);
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.amiriel-body-editor__page-button {
  min-width: 2.25rem;
  padding: 0 0.75rem;
}

.amiriel-body-editor__icon-button {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.amiriel-body-editor__icon-button svg,
.amiriel-body-editor__text-tools svg,
.amiriel-body-editor__placement-tools svg,
.amiriel-body-editor__tile-action svg {
  width: 1rem;
  height: 1rem;
}

.amiriel-body-editor__theme-button {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0 0.75rem;
  font-size: 0.875rem;
}

.amiriel-body-editor__page-button:hover,
.amiriel-body-editor__icon-button:hover,
.amiriel-body-editor__theme-button:hover,
.amiriel-body-editor__page-button.is-active,
.amiriel-body-editor__theme-button.is-active {
  border-color: rgba(214, 170, 103, 0.6);
  background: rgba(214, 170, 103, 0.1);
  color: var(--amiriel-editor-accent);
}

.amiriel-body-editor__page-button:disabled,
.amiriel-body-editor__icon-button:disabled,
.amiriel-body-editor__theme-button:disabled,
.amiriel-body-editor__icon-button.is-disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.amiriel-body-editor__swatch {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
}

.amiriel-body-editor__swatch.is-midnight {
  background: linear-gradient(135deg, #373737, #050505);
}

.amiriel-body-editor__swatch.is-paper {
  background: linear-gradient(135deg, #ece8df, #d6aa67);
}

.amiriel-body-editor__swatch.is-memorial {
  background: linear-gradient(135deg, #9fb27a, #252525);
}

.amiriel-body-editor__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 0;
}

.amiriel-body-editor__workspace {
  padding: 1.25rem;
}

.amiriel-body-editor__side {
  display: grid;
  align-content: start;
  gap: 1rem;
  border-left: 1px solid var(--amiriel-editor-border);
  padding: 1.25rem;
}

.amiriel-body-editor__paper {
  position: relative;
  min-height: 520px;
  overflow: hidden;
  border: 1px solid var(--amiriel-paper-border);
  border-radius: 0.6rem;
  background: var(--amiriel-paper-bg);
  color: var(--amiriel-paper-text);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08), 0 30px 90px rgba(0, 0, 0, 0.45);
}

.amiriel-body-editor__paper-head {
  margin: 1.25rem 1.25rem 0;
  border-bottom: 1px solid var(--amiriel-paper-divider);
  padding-bottom: 0.75rem;
  color: var(--amiriel-paper-accent);
  font-size: 0.75rem;
}

.amiriel-body-editor__paper-head p,
.amiriel-body-editor__hint,
.amiriel-body-editor__fallback-text,
.amiriel-body-editor__panel h3,
.amiriel-body-editor__empty,
.amiriel-body-editor__error {
  margin: 0;
}

.amiriel-body-editor__delete-page {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 30;
  display: inline-flex;
  width: 2rem;
  height: 2rem;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0.45rem;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  cursor: pointer;
}

.amiriel-body-editor__delete-page svg {
  width: 1rem;
  height: 1rem;
}

.amiriel-body-editor__delete-page:hover {
  background: rgba(239, 68, 68, 0.85);
}

.amiriel-body-editor__hint {
  pointer-events: none;
  margin: 2rem 1.25rem 0;
  color: var(--amiriel-editor-faint);
  font-size: 0.875rem;
  line-height: 1.6;
}

.amiriel-body-editor__fallback-text {
  margin: 2rem 1.25rem 0;
  color: inherit;
  font-size: 1rem;
  line-height: 2;
  white-space: pre-wrap;
}

.amiriel-body-editor__text-layer,
.amiriel-body-editor__media-layer {
  position: absolute;
  inset: 0;
}

.amiriel-body-editor__media-layer {
  pointer-events: none;
}

.amiriel-body-editor__text-block {
  position: absolute;
  border: 1px solid transparent;
  border-radius: 0.45rem;
  background: transparent;
  padding: 0.25rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.amiriel-body-editor__text-block:hover,
.amiriel-body-editor__text-block.is-active {
  border-color: rgba(214, 170, 103, 0.7);
  box-shadow: 0 0 0 2px rgba(214, 170, 103, 0.16);
}

.amiriel-body-editor__text-block.is-overflowing {
  border-color: rgba(248, 113, 113, 0.75);
}

.amiriel-body-editor__textarea {
  display: block;
  width: 100%;
  height: 100%;
  resize: none;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: inherit;
  letter-spacing: 0;
  line-height: 2;
  outline: none;
}

.amiriel-body-editor__text-tools,
.amiriel-body-editor__placement-tools {
  position: absolute;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 0.125rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0.45rem;
  background: rgba(0, 0, 0, 0.78);
  padding: 0.25rem;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
}

.amiriel-body-editor__text-tools {
  left: 0;
  top: -2.4rem;
}

.amiriel-body-editor__placement-tools {
  right: 0.25rem;
  top: 0.25rem;
}

.amiriel-body-editor__text-tools button,
.amiriel-body-editor__text-tools a.amiriel-body-editor__github-link,
.amiriel-body-editor__placement-tools button,
.amiriel-body-editor__tile-action {
  display: inline-flex;
  min-width: 1.75rem;
  height: 1.75rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 0.35rem;
  background: transparent;
  color: #fff;
  cursor: pointer;
}

.amiriel-body-editor__text-tools button:hover,
.amiriel-body-editor__text-tools a.amiriel-body-editor__github-link:hover,
.amiriel-body-editor__placement-tools button:hover {
  background: rgba(255, 255, 255, 0.15);
}

.amiriel-body-editor__text-tools .is-on {
  background: rgba(214, 170, 103, 0.3);
  color: var(--amiriel-editor-accent);
}

.amiriel-body-editor__text-tools .is-italic {
  font-style: italic;
}

.amiriel-body-editor__text-tools .is-underline {
  text-decoration: underline;
}

.amiriel-body-editor__text-tools .is-danger:hover,
.amiriel-body-editor__placement-tools .is-danger:hover,
.amiriel-body-editor__tile-action.is-danger:hover {
  background: rgba(239, 68, 68, 0.85);
}

.amiriel-body-editor__menu-wrap {
  position: relative;
}

.amiriel-body-editor__menu,
.amiriel-body-editor__color-menu {
  position: absolute;
  top: calc(100% + 0.25rem);
  left: 0;
  z-index: 70;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0.45rem;
  background: #0b0b0c;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
}

.amiriel-body-editor__menu {
  min-width: 9rem;
}

.amiriel-body-editor__menu.is-compact {
  min-width: 4rem;
}

.amiriel-body-editor__menu button {
  display: flex;
  width: 100%;
  min-width: 0;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0 0.625rem;
  font-size: 0.75rem;
}

.amiriel-body-editor__menu svg {
  width: 0.875rem;
  height: 0.875rem;
}

.amiriel-body-editor__color-menu {
  left: 50%;
  display: grid;
  grid-template-columns: repeat(4, 1.5rem);
  gap: 0.25rem;
  padding: 0.25rem;
  transform: translateX(-50%);
}

.amiriel-body-editor__color-menu button {
  width: 1.5rem;
  min-width: 1.5rem;
  height: 1.5rem;
}

.amiriel-body-editor__color-menu span,
.amiriel-body-editor__color-dot {
  display: block;
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35);
}

.amiriel-body-editor__resize {
  position: absolute;
  right: 0.25rem;
  bottom: 0.25rem;
  z-index: 45;
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.55);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
  cursor: nwse-resize;
}

.amiriel-body-editor__resize.is-nw {
  top: 0.25rem;
  right: auto;
  bottom: auto;
  left: 0.25rem;
}

.amiriel-body-editor__placement {
  position: absolute;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0.55rem;
  background: rgba(0, 0, 0, 0.2);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
  pointer-events: auto;
  touch-action: none;
  user-select: none;
}

.amiriel-body-editor__placement:hover,
.amiriel-body-editor__placement.is-active {
  border-color: var(--amiriel-editor-accent);
  box-shadow: 0 0 0 2px rgba(214, 170, 103, 0.25), 0 12px 28px rgba(0, 0, 0, 0.28);
}

.amiriel-body-editor__placement img,
.amiriel-body-editor__placement .amiriel-media-video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.amiriel-body-editor__video-mark {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  pointer-events: none;
}

.amiriel-body-editor__video-mark svg {
  width: 2rem;
  height: 2rem;
  color: rgba(255, 255, 255, 0.8);
}

.amiriel-body-editor__media-hint {
  position: absolute;
  right: 1.25rem;
  bottom: 1.25rem;
  left: 1.25rem;
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 0.55rem;
  background: rgba(0, 0, 0, 0.1);
  padding: 0.75rem;
  color: var(--amiriel-editor-muted);
  font-size: 0.75rem;
  pointer-events: none;
  text-align: center;
}

.amiriel-body-editor__panel {
  border: 1px solid var(--amiriel-editor-border);
  border-radius: 0.6rem;
  background: var(--amiriel-editor-panel);
  padding: 1rem;
}

.amiriel-body-editor__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.amiriel-body-editor__panel h3 {
  overflow: hidden;
  color: #fff;
  font-size: 1rem;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.amiriel-body-editor__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.amiriel-body-editor__stats span {
  min-width: 0;
  border: 1px solid var(--amiriel-editor-border);
  border-radius: 0.5rem;
  background: rgba(0, 0, 0, 0.2);
  padding: 0.55rem 0.65rem;
  color: var(--amiriel-editor-muted);
  font-size: 0.75rem;
}

.amiriel-body-editor__icon-button.is-label {
  position: relative;
  cursor: pointer;
}

.amiriel-body-editor__icon-button input {
  display: none;
}

.amiriel-body-editor__error {
  margin-top: 0.75rem;
  color: #fca5a5;
  font-size: 0.875rem;
}

.amiriel-body-editor__media-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
  margin-top: 1rem;
}

.amiriel-body-editor__media-tile {
  position: relative;
  height: 5rem;
  overflow: hidden;
  border: 1px solid var(--amiriel-editor-border);
  border-radius: 0.55rem;
  background: rgba(0, 0, 0, 0.3);
}

.amiriel-body-editor__media-tile.is-on-page {
  border-color: rgba(214, 170, 103, 0.65);
}

.amiriel-body-editor__media-tile.is-pending {
  border-color: rgba(214, 170, 103, 0.45);
}

.amiriel-body-editor__media-tile.is-failed {
  grid-column: 1 / -1;
  height: 6.5rem;
  border-color: rgba(248, 113, 113, 0.75);
  animation: amiriel-upload-failed-shake 0.38s ease;
}

.amiriel-body-editor__upload-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.35rem;
  background: rgba(0, 0, 0, 0.58);
  color: #f4f4f5;
  text-align: center;
}

.amiriel-body-editor__upload-overlay.is-failed {
  gap: 0.35rem;
  padding: 0.4rem;
  background: rgba(69, 10, 10, 0.82);
}

.amiriel-body-editor__upload-failed-title {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  color: #fecaca;
}

.amiriel-body-editor__upload-failed-detail {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 0.62rem;
  line-height: 1.25;
  color: #fca5a5;
}

.amiriel-body-editor__upload-failed-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.35rem;
  margin-top: 0.15rem;
}

.amiriel-body-editor__upload-failed-actions button {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  min-height: 1.55rem;
  padding: 0 0.45rem;
  border: 1px solid rgba(254, 202, 202, 0.35);
  border-radius: 0.4rem;
  background: rgba(127, 29, 29, 0.55);
  color: #fff;
  font-size: 0.62rem;
  cursor: pointer;
}

.amiriel-body-editor__upload-failed-actions button svg {
  width: 0.75rem;
  height: 0.75rem;
}

.amiriel-body-editor__upload-failed-actions button.is-muted {
  border-color: rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.25);
  color: #e5e5e5;
}

.amiriel-body-editor__upload-failed-actions button:hover {
  filter: brightness(1.08);
}

@keyframes amiriel-upload-failed-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-2px); }
  40% { transform: translateX(2px); }
  60% { transform: translateX(-2px); }
  80% { transform: translateX(2px); }
}

.amiriel-body-editor__upload-label {
  font-size: 0.68rem;
  line-height: 1.2;
  font-weight: 600;
}

.amiriel-body-editor__upload-progress {
  width: calc(100% - 0.5rem);
  height: 0.22rem;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
}

.amiriel-body-editor__upload-progress-bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #d6aa67, #f0d2a0);
  transition: width 0.15s ease;
}

.amiriel-body-editor__upload-progress-bar.is-indeterminate {
  width: 38% !important;
  animation: amiriel-upload-indeterminate 1.1s ease-in-out infinite;
}

@keyframes amiriel-upload-indeterminate {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(320%); }
}

.amiriel-body-editor__media-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.amiriel-body-editor__media-preview {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  cursor: zoom-in;
  padding: 0;
}

.amiriel-body-editor__media-preview img,
.amiriel-body-editor__media-preview .amiriel-media-video-thumb {
  width: 100%;
  height: 100%;
}

.amiriel-body-editor__media-preview img {
  object-fit: cover;
}

.amiriel-body-editor__tile-action {
  position: absolute;
  right: 0.25rem;
  z-index: 3;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.75);
}

.amiriel-body-editor__tile-action.is-top {
  top: 0.25rem;
}

.amiriel-body-editor__tile-action.is-bottom {
  bottom: 0.25rem;
}

.amiriel-body-editor__empty {
  margin-top: 1rem;
  border: 1px dashed var(--amiriel-editor-border);
  border-radius: 0.55rem;
  padding: 0.75rem;
  color: var(--amiriel-editor-faint);
  font-size: 0.75rem;
  line-height: 1.6;
}

@media (max-width: 1100px) {
  .amiriel-body-editor__layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .amiriel-body-editor__side {
    border-top: 1px solid var(--amiriel-editor-border);
    border-left: 0;
  }
}

@media (max-width: 640px) {

  .amiriel-body-editor__bar,
  .amiriel-body-editor__workspace,
  .amiriel-body-editor__side {
    padding: 1rem;
  }

  .amiriel-body-editor__theme-button span:last-child {
    display: none;
  }

  .amiriel-body-editor__paper {
    min-height: 460px;
  }
}
</style>
