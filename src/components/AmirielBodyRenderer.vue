<script setup lang="ts">
import { computed, ref } from "vue";
import { FilmIcon } from "@heroicons/vue/24/outline";
import type { AmirielDocument, AmirielLabels, AmirielMedia, AmirielMediaPlacement, AmirielPage, AmirielTextBlock } from "../types";
import type { AmirielThemeDefinition } from "../themes";
import { AMIRIEL_FONT_STACKS, AMIRIEL_TEXT_COLORS, combinedPageText, normalizeDocument, safeAspectRatio } from "../utils";
import { amirielThemeCssVars, findAmirielThemeDefinition } from "../themes";
import { resolveAmirielLabels } from "../labels";
import AmirielCoreMediaLightbox from "./AmirielMediaLightbox.vue";
import AmirielCoreMediaVideo from "./AmirielMediaVideo.vue";

const props = withDefaults(defineProps<{
  document: AmirielDocument;
  pageIndex?: number;
  title?: string;
  locale?: "en" | "zh";
  labels?: Partial<AmirielLabels>;
  themes?: AmirielThemeDefinition[];
  variant?: "paper" | "layer";
  interactive?: boolean;
  hidden?: boolean;
  lightbox?: boolean;
}>(), {
  pageIndex: 0,
  locale: "en",
  variant: "paper",
  interactive: true,
  hidden: false,
  lightbox: true,
});

const labels = computed(() => resolveAmirielLabels(props.locale, props.labels));
const normalized = computed(() => normalizeDocument(props.document));
const activeThemeStyle = computed(() =>
  amirielThemeCssVars(findAmirielThemeDefinition(normalized.value.theme, props.themes)),
);
const sortedPages = computed(() => [...normalized.value.pages].sort((a, b) => a.order - b.order));
const currentPage = computed(() => sortedPages.value[props.pageIndex] ?? sortedPages.value[0]);
const currentTextBlocks = computed(() => currentPage.value?.textBlocks ?? []);
const lightboxMedia = ref<AmirielMedia | null>(null);
const lightboxOpen = ref(false);

function mediaById(id: string) {
  return normalized.value.media.find((item) => item.id === id);
}

function currentPlacements(page?: AmirielPage): AmirielMediaPlacement[] {
  if (!page) return [];
  if (page.mediaPlacements?.length) return page.mediaPlacements;
  return (page.mediaIds ?? []).map((mediaId, index) => ({
    id: `${page.id}-${mediaId}-${index}`,
    mediaId,
    x: 9 + (index % 2) * 42,
    y: 52 + Math.floor(index / 2) * 22,
    width: 38,
    height: 22,
    z: index + 1,
  }));
}

function fontStyle(font = currentPage.value?.font) {
  return { fontFamily: AMIRIEL_FONT_STACKS[font || "handwritten"] };
}

function textBlockContentStyle(block: AmirielTextBlock, page?: AmirielPage) {
  return {
    ...fontStyle(block.font || page?.font),
    fontSize: `${block.fontSize || 16}px`,
    fontWeight: block.bold ? "700" : undefined,
    fontStyle: block.italic ? "italic" : undefined,
    textDecoration: block.underline ? "underline" : undefined,
    ...(block.color ? { color: AMIRIEL_TEXT_COLORS[block.color] } : {}),
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

function openMedia(item: AmirielMedia) {
  if (!props.interactive || !props.lightbox) return;
  lightboxMedia.value = item;
  lightboxOpen.value = true;
}

function closeMedia() {
  lightboxOpen.value = false;
  lightboxMedia.value = null;
}
</script>

<template>
  <div
    class="amiriel-renderer"
    :class="[
      `amiriel-renderer--${variant}`,
      { 'amiriel-renderer--hidden': hidden },
    ]"
    :style="activeThemeStyle"
  >
    <article v-if="variant === 'paper'" class="amiriel-renderer__paper">
      <div class="amiriel-renderer__head">
        <p class="amiriel-renderer__label">{{ title }}</p>
      </div>
      <div class="amiriel-renderer__content">
        <p v-if="!currentTextBlocks.length" class="amiriel-renderer__body" :style="fontStyle(currentPage?.font)">
          {{ combinedPageText(currentPage) }}
        </p>
        <span v-else class="amiriel-renderer__text-layer">
          <span
            v-for="block in currentTextBlocks"
            :key="block.id"
            class="amiriel-renderer__text-block"
            :style="[textBlockStyle(block), textBlockContentStyle(block, currentPage)]"
          >
            {{ block.text }}
          </span>
        </span>
        <span v-if="currentPlacements(currentPage).length" class="amiriel-renderer__media-layer">
          <template v-for="placement in currentPlacements(currentPage)" :key="placement.id">
            <button
              v-if="mediaById(placement.mediaId)"
              type="button"
              class="amiriel-renderer__media"
              :style="placementStyle(placement)"
              :disabled="!interactive"
              :aria-label="labels.viewMedia"
              @click.stop="openMedia(mediaById(placement.mediaId)!)"
            >
              <img
                v-if="mediaById(placement.mediaId)?.type === 'image'"
                :src="mediaById(placement.mediaId)?.url"
                :alt="mediaById(placement.mediaId)?.objectKey || 'media'"
                draggable="false"
                @dragstart.prevent
              />
              <AmirielCoreMediaVideo v-else :media="mediaById(placement.mediaId)!" show-duration-badge muted />
              <span v-if="mediaById(placement.mediaId)?.type === 'video'" class="amiriel-renderer__video-mark" aria-hidden="true">
                <FilmIcon />
              </span>
            </button>
          </template>
        </span>
      </div>
    </article>

    <template v-else>
      <p v-if="!currentTextBlocks.length" class="amiriel-renderer__body amiriel-renderer__body--layer" :style="fontStyle(currentPage?.font)">
        {{ combinedPageText(currentPage) }}
      </p>
      <span v-else class="amiriel-renderer__text-layer">
        <span
          v-for="block in currentTextBlocks"
          :key="block.id"
          class="amiriel-renderer__text-block"
          :style="[textBlockStyle(block), textBlockContentStyle(block, currentPage)]"
        >
          {{ block.text }}
        </span>
      </span>
      <span v-if="currentPlacements(currentPage).length" class="amiriel-renderer__media-layer">
        <template v-for="placement in currentPlacements(currentPage)" :key="placement.id">
          <button
            v-if="mediaById(placement.mediaId)"
            type="button"
            class="amiriel-renderer__media"
            :style="placementStyle(placement)"
            :disabled="!interactive"
            :tabindex="interactive ? 0 : -1"
            :aria-label="labels.viewMedia"
            @click.stop="openMedia(mediaById(placement.mediaId)!)"
          >
            <img
              v-if="mediaById(placement.mediaId)?.type === 'image'"
              :src="mediaById(placement.mediaId)?.url"
              :alt="mediaById(placement.mediaId)?.objectKey || 'media'"
              draggable="false"
              @dragstart.prevent
            />
            <AmirielCoreMediaVideo v-else :media="mediaById(placement.mediaId)!" show-duration-badge muted preload="metadata" />
            <span v-if="mediaById(placement.mediaId)?.type === 'video'" class="amiriel-renderer__video-mark" aria-hidden="true">
              <FilmIcon />
            </span>
          </button>
        </template>
      </span>
    </template>

    <AmirielCoreMediaLightbox
      v-if="lightbox"
      :open="lightboxOpen"
      :media="lightboxMedia"
      :close-label="labels.close"
      :image-label="labels.image"
      :video-label="labels.video"
      @close="closeMedia"
    />
  </div>
</template>

<style>
.amiriel-renderer {
  --amiriel-paper-border: rgba(214, 170, 103, 0.24);
  --amiriel-paper-bg: radial-gradient(circle at 12% 0%, rgba(214, 170, 103, 0.1), transparent 38%), linear-gradient(180deg, #171718 0%, #09090a 100%);
  --amiriel-paper-text: #eadfce;
  --amiriel-paper-head: rgba(241, 234, 220, 0.92);
  --amiriel-paper-accent: rgba(214, 170, 103, 0.8);
  --amiriel-paper-divider: rgba(214, 170, 103, 0.2);
  --amiriel-paper-shadow: 0 20px 48px rgba(0, 0, 0, 0.46), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  --amiriel-paper-media-border: rgba(255, 255, 255, 0.1);
  --amiriel-paper-media-bg: rgba(0, 0, 0, 0.28);
  color: var(--amiriel-paper-text);
}

.amiriel-renderer__paper {
  position: relative;
  min-height: 520px;
  overflow: hidden;
  border: 1px solid var(--amiriel-paper-border);
  border-radius: 0.6rem;
  background: var(--amiriel-paper-bg);
  box-shadow: var(--amiriel-paper-shadow);
  color: var(--amiriel-paper-text);
}

.amiriel-renderer__head {
  margin: 1.25rem 1.25rem 0;
  border-bottom: 1px solid var(--amiriel-paper-divider);
  padding-bottom: 0.75rem;
}

.amiriel-renderer__label {
  margin: 0;
  color: var(--amiriel-paper-accent);
  font-size: 0.75rem;
}

.amiriel-renderer__content {
  position: absolute;
  inset: 0;
}

.amiriel-renderer__body {
  margin: 5.25rem 1.25rem 1.25rem;
  max-height: calc(100% - 6.8rem);
  overflow: auto;
  color: inherit;
  font-size: 1rem;
  letter-spacing: 0;
  line-height: 2;
  white-space: pre-wrap;
}

.amiriel-renderer__body--layer {
  margin: 1.25rem 0 0;
}

.amiriel-renderer__text-layer,
.amiriel-renderer__media-layer {
  position: absolute;
  inset: 0;
  display: block;
}

.amiriel-renderer__text-layer {
  pointer-events: none;
}

.amiriel-renderer__text-block {
  position: absolute;
  display: block;
  overflow: hidden;
  padding: 0.25rem 0.5rem;
  color: inherit;
  letter-spacing: 0;
  line-height: 2;
  text-align: left;
  white-space: pre-wrap;
}

.amiriel-renderer__media-layer {
  pointer-events: none;
}

.amiriel-renderer__media {
  position: absolute;
  display: block;
  overflow: hidden;
  margin: 0;
  padding: 0;
  border: 1px solid var(--amiriel-paper-media-border);
  border-radius: 0.55rem;
  background: var(--amiriel-paper-media-bg);
  color: inherit;
  cursor: zoom-in;
  font: inherit;
  pointer-events: auto;
}

.amiriel-renderer__media:disabled {
  cursor: default;
}

.amiriel-renderer__media img,
.amiriel-renderer__media .amiriel-media-video {
  display: block;
  width: 100%;
  height: 100%;
}

.amiriel-renderer__media img {
  object-fit: contain;
}

.amiriel-renderer__video-mark {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  pointer-events: none;
}

.amiriel-renderer__video-mark svg {
  width: 1.75rem;
  height: 1.75rem;
  color: rgba(255, 255, 255, 0.85);
}

.amiriel-renderer--hidden {
  opacity: 0;
  filter: blur(4px);
  transition: opacity 900ms ease, filter 900ms ease;
}
</style>
