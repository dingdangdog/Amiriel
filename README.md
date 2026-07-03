<p align="center">
  <img src="https://amiriel.com/logo/amiriel_256x256.webp" alt="Amiriel logo" width="96" height="96" />
</p>

<h1 align="center">amiriel</h1>

<p align="center">
  Meta package that re-exports <code>@amiriel/core</code> — install with <code>npm i amiriel</code>.
</p>

[![npm version (beta)](https://img.shields.io/npm/v/amiriel/beta?style=flat-square)](https://www.npmjs.com/package/amiriel)
[![license](https://img.shields.io/npm/l/amiriel?style=flat-square)](https://www.npmjs.com/package/amiriel)

## Why this package exists

npm scoped packages must use the `@scope/name` format. The framework-agnostic core
lives in [`@amiriel/core`](https://www.npmjs.com/package/@amiriel/core) under the
`@amiriel` organization. This package keeps the short `amiriel` name as a
convenient entry point:

```bash
npm install amiriel@beta
```

Everything exported here comes from `@amiriel/core`. For explicit organization
scoping, you can install the core directly:

```bash
npm install @amiriel/core@beta
```

## Usage

```ts
import {
  normalizeDocument,
  type AmirielDocument,
} from "amiriel";

const document: AmirielDocument = normalizeDocument({
  theme: "midnight",
  media: [],
  pages: [],
});
```

## Package Architecture

| npm package | Repository | Role |
| --- | --- | --- |
| `amiriel` | [Amirieljs/Amiriel](https://github.com/Amirieljs/Amiriel) | Meta package (this repo) |
| `@amiriel/core` | [Amirieljs/Amiriel-Core](https://github.com/Amirieljs/Amiriel-Core) | Framework-agnostic core |
| `@amiriel/vue` | [Amirieljs/Amiriel-Vue](https://github.com/Amirieljs/Amiriel-Vue) | Vue 3 components |
| `@amiriel/react` | [Amirieljs/Amiriel-React](https://github.com/Amirieljs/Amiriel-React) | React components |
| `@amiriel/vanilla` | [Amirieljs/Amiriel-Vanilla](https://github.com/Amirieljs/Amiriel-Vanilla) | Vanilla JS components |

## Release Sync

When `@amiriel/core` publishes a new version, this repository receives a
`core-release` dispatch, upgrades its `@amiriel/core` dependency, bumps its own
version, and publishes to npm.

Configure these secrets:

- `NPM_TOKEN`: npm automation token used for publishing
- `AMIRIELJS_SYNC_TOKEN`: GitHub token with permission to push sync commits and tags

## License

MIT
