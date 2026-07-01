import "./style.css";

export { default as AmirielBodyEditor } from "./components/AmirielBodyEditor.vue";
export { default as AmirielBodyRenderer } from "./components/AmirielBodyRenderer.vue";
export { default as AmirielMediaLightbox } from "./components/AmirielMediaLightbox.vue";
export { default as AmirielMediaVideo } from "./components/AmirielMediaVideo.vue";
export { default as AmirielMediaVideoThumbnail } from "./components/AmirielMediaVideoThumbnail.vue";

export type {
  AmirielDocument,
  AmirielEditorLimits,
  AmirielFont,
  AmirielLabels,
  AmirielMedia,
  AmirielMediaPlacement,
  AmirielMediaRequest,
  AmirielMediaUploadProgress,
  AmirielPage,
  AmirielTextBlock,
  AmirielTextColor,
  AmirielTheme,
  AmirielBuiltinTheme,
} from "./types";

export type { AmirielPaperThemeVars, AmirielThemeDefinition } from "./themes";

export {
  AMIRIEL_DEFAULT_LABELS,
  formatAmirielLabel,
  resolveAmirielLabels,
} from "./labels";

export {
  AMIRIEL_BUILTIN_THEME_DEFINITIONS,
  AMIRIEL_BUILTIN_THEME_IDS,
  amirielThemeCssVars,
  findAmirielThemeDefinition,
  mergeAmirielThemeDefinitions,
  themeDefaultTextColorFor,
} from "./themes";

export {
  AMIRIEL_FONT_OPTIONS,
  AMIRIEL_FONT_STACKS,
  AMIRIEL_TEXT_COLORS,
  AMIRIEL_TEXT_COLOR_OPTIONS,
  AMIRIEL_THEME_DEFAULT_TEXT_COLOR,
  AMIRIEL_THEME_OPTIONS,
  combinedPageText,
  formatVideoDuration,
  normalizeDocument,
  themeDefaultTextBlockColor,
} from "./utils";
