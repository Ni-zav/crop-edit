# Crop and Edit

Crop and Edit is a Tauri desktop app for loading an image, drawing crop-separation lines, splitting those lines into independently movable segments, selecting crop regions, and exporting selected regions as PNG files.

The app is built with a TypeScript canvas frontend and a Rust/Tauri backend. The frontend owns all editing state and region calculation. The Rust backend receives selected crop rectangles and writes exported image files to the user's Pictures folder.

## Features

- Load common image formats: PNG, JPG/JPEG, WebP, GIF, BMP, TIFF, plus backend decode support for ICO, TGA, and QOI.
- Add vertical and horizontal crop lines.
- Drag full lines or split line segments.
- Split a line at an intersection so the resulting segments can move independently.
- Merge touching split segments back together.
- Delete selected lines or line segments.
- Snap an axis into 2 through 10 equal parts.
- Apply quick templates: 2x2, 3x3, and 4x4.
- Save custom split-line templates, search saved templates, and apply them to newly loaded images.
- Select all regions or manually toggle region selection.
- Export selected regions to `Pictures/Crop and Edit/`.
- Responsive layout with tool rail, settings panel, compact breakpoints, and canvas resizing.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+O` | Open/load image |
| `V` | Add vertical line |
| `H` | Add horizontal line |
| `S` | Select mode |
| `T` | Toggle split/select mode |
| `M` | Merge selected split line |
| `Delete` | Delete selected line |
| `Ctrl+A` | Select all regions |
| `E` | Export selected regions |
| `2` | Apply 2x2 template |
| `3` | Apply 3x3 template |
| `4` | Apply 4x4 template |
| `Ctrl+S` | Save current split layout as a template |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+Shift+Z` | Redo |

## Export Behavior

Exports are always written as PNG files, regardless of the source image format.

The export folder is:

```text
%USERPROFILE%\Pictures\Crop and Edit\
```

Exported filenames use this format:

```text
YYYYMMDD-HHmmss-xnyn.png
```

Example:

```text
20260610-165140-x0y0.png
```

Coordinates use a Cartesian-style region index where `x0y0` is the bottom-left crop region.

## Repository Structure

```text
.
├── index.html                 # Vite entry HTML
├── package.json               # Node scripts and frontend dependencies
├── tsconfig.json              # TypeScript configuration
├── src/
│   ├── main.ts                # Canvas editor, UI, hotkeys, region logic
│   └── styles.css             # Responsive layout and control styling
├── src-tauri/
│   ├── Cargo.toml             # Rust dependencies and image codec features
│   ├── tauri.conf.json        # Tauri app/window/bundle configuration
│   └── src/
│       ├── lib.rs             # Tauri command for crop export
│       └── main.rs            # Tauri app entry point
├── archive/
│   └── instruction.txt        # Original project instruction archive
├── 1.png, 2.png, 3.png        # Local visual reference images
└── dist/                      # Generated frontend build output
```

## Important Source Files

### `src/main.ts`

This is the main application file. It contains:

- UI markup generation.
- SVG button icons.
- Keyboard shortcut handling.
- Image loading and canvas drawing.
- Line/segment data model.
- Undo and redo stacks.
- Equal-gap snapping and templates.
- Saved custom templates using normalized line positions in local browser storage.
- Region detection and selection.
- Calls to the Tauri export command.

The main line model is:

```ts
type SplitLine = {
  id: string;
  orientation: "vertical" | "horizontal";
  position: number;
  start: number;
  end: number;
};
```

`position` is the fixed axis coordinate. `start` and `end` define the segment span on the crossing axis. A full vertical line has `position = x`, `start = 0`, and `end = imageHeight`. A split vertical segment keeps the same `position` but has a smaller `start/end` range.

### `src/styles.css`

Defines the responsive app shell:

- Desktop: app bar, left tool rail, center workspace, right settings panel.
- Medium widths: tools and settings move above the workspace.
- Narrow widths: controls compact into top/bottom-style bars and the workspace stays visible.

The canvas is resized through JavaScript using the available `.stage-wrap` size, and CSS constrains it to the viewport.

### `src-tauri/src/lib.rs`

Defines the `export_regions` Tauri command. It:

- Decodes the image data URL sent from the frontend.
- Validates crop rectangles.
- Crops each selected region.
- Writes PNG output files to `Pictures/Crop and Edit/`.

### `src-tauri/Cargo.toml`

Enables image decoding features for:

- BMP
- GIF
- ICO
- JPEG
- PNG
- QOI
- TGA
- TIFF
- WebP

## Development

Install dependencies:

```powershell
npm install
```

Run the frontend dev server:

```powershell
npm run dev
```

Run the Tauri app in development mode:

```powershell
npm run tauri:dev
```

Build only the frontend:

```powershell
npm run build
```

Build the Windows app and installers:

```powershell
npm run tauri:build
```

Build outputs are written under:

```text
src-tauri/target/release/
```

The direct executable is:

```text
src-tauri/target/release/crop-and-edit.exe
```

Installers are generated under:

```text
src-tauri/target/release/bundle/
```

## Notes for This Environment

On this Windows/sandboxed Codex environment, `vite build` may fail inside the sandbox with `spawn EPERM`. The build itself is valid; rerunning through the approved unsandboxed path has been required for successful local verification.

## Current Limitations

- Exports are PNG only.
- Animated formats are treated as still images by the browser/backend decode path.
- Saved templates persist locally in the app browser storage, but there is no project save/load file format yet.
- Region selection keys are not assigned per individual region.

