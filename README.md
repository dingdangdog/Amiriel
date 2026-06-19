<p align="center">
  <img src="./logo.webp" alt="Amiriel logo" width="96" height="96" />
</p>

<h1 align="center">Amiriel</h1>

<p align="center">
  Portable Vue 3 body editor and renderer for letter-style documents.
</p>

<p align="center">
  <a href="https://amiriel.com"><img src="https://img.shields.io/badge/website-amiriel.com-6b7280?style=flat-square" alt="Official website" /></a>
  <a href="https://amiriel.com/playground"><img src="https://img.shields.io/badge/demo-playground-6b7280?style=flat-square" alt="Live playground" /></a>
  <a href="https://www.npmjs.com/package/amiriel"><img src="https://img.shields.io/npm/v/amiriel/beta?style=flat-square" alt="npm version (beta)" /></a>
  <a href="https://www.npmjs.com/package/amiriel"><img src="https://img.shields.io/npm/dm/amiriel?style=flat-square" alt="npm downloads" /></a>
  <a href="https://www.npmjs.com/package/amiriel"><img src="https://img.shields.io/npm/l/amiriel?style=flat-square" alt="license" /></a>
  <a href="https://github.com/dingdangdog/Amiriel"><img src="https://img.shields.io/github/stars/dingdangdog/Amiriel?style=flat-square" alt="GitHub stars" /></a>
  <img src="https://img.shields.io/badge/vue-3.5+-4FC08D?style=flat-square&logo=vue.js&logoColor=white" alt="Vue 3.5+" />
  <img src="https://img.shields.io/badge/typescript-ready-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
</p>

## Features

- Page-by-page letter editor with themes, fonts, and text blocks
- Drag-and-drop media placement on each page
- Matching read-only renderer for preview and delivery flows
- Host-controlled media upload via `media-request` events
- No storage, authentication, database, or application workflow bundled

The full hosted product (accounts, delivery, vaults) lives at **[amiriel.com](https://amiriel.com)**.

Try the editor in your browser (no install): **[amiriel.com/playground](https://amiriel.com/playground)**.

## Install

Stable releases use the default npm tag. Pre-releases are published under the `beta` tag (earlier snapshots used `alpha`).

**npm**

```bash
npm install amiriel@beta
```

**pnpm**

```bash
pnpm add amiriel@beta
```

**yarn**

```bash
yarn add amiriel@beta
```

**bun**

```bash
bun add amiriel@beta
```

When `0.0.1` or later is released to `latest`, you can install without the tag:

```bash
npm install amiriel
pnpm add amiriel
yarn add amiriel
bun add amiriel
```

## Usage

```vue
<script setup lang="ts">
import { ref } from "vue";
import {
  AmirielBodyEditor,
  AmirielBodyRenderer,
  type AmirielDocument,
  type AmirielMediaRequest,
} from "amiriel";
import "amiriel/style.css";

const document = ref<AmirielDocument>({
  theme: "midnight",
  media: [],
  pages: [{
    id: "page-1",
    order: 0,
    text: "",
    font: "handwritten",
    mediaIds: [],
    mediaPlacements: [],
    textBlocks: [],
  }],
});

async function onMediaRequest(request: AmirielMediaRequest) {
  request.handled = true;
  try {
    const media = await uploadMediaSomewhere(request.file);
    request.resolve(media);
  } catch (error) {
    request.reject(error instanceof Error ? error.message : "Upload failed");
  }
}
</script>

<template>
  <AmirielBodyEditor
    v-model="document"
    locale="en"
    :show-github-link="true"
    @media-request="onMediaRequest"
  />
  <AmirielBodyRenderer :document="document" locale="en" />
</template>
```

The package does not include storage, authentication, database code, or application workflow. Host apps own media upload and pass the resulting media object back through `request.resolve(media)`.

### Props (editor)

| Prop | Default | Description |
| --- | --- | --- |
| `showGithubLink` | `true` | Show GitHub link on the text-block toolbar |
| `githubUrl` | `https://github.com/dingdangdog/Amiriel` | Target URL for the GitHub button |

Set `:show-github-link="false"` in production apps that should not display the open-source attribution.

## Exports

| Export | Description |
| --- | --- |
| `AmirielBodyEditor` | Editable page-by-page letter body |
| `AmirielBodyRenderer` | Read-only renderer |
| `AmirielMediaLightbox` | Image/video lightbox |
| `AmirielMediaVideo` | Inline video player |
| `AmirielMediaVideoThumbnail` | Video thumbnail with duration |
| `AmirielDocument` and related types | Shared document model |
| `normalizeDocument`, `combinedPageText`, … | Document helpers |

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=dingdangdog/Amiriel&type=Date)](https://star-history.com/#dingdangdog/Amiriel&Date)

## License

[MIT](./LICENSE)
