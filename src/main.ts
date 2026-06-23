import { invoke } from "@tauri-apps/api/core";
import "./styles.css";

type Orientation = "vertical" | "horizontal";
type Tool = "select" | "vertical" | "horizontal" | "split";

type SplitLine = {
  id: string;
  orientation: Orientation;
  position: number;
  start: number;
  end: number;
};

type Region = {
  key: string;
  xIndex: number;
  yIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  cells: Array<{ xi: number; yi: number; x: number; y: number; width: number; height: number }>;
};

type Snapshot = {
  lines: SplitLine[];
  selectedRegions: string[];
};

type SavedTemplateLine = {
  orientation: Orientation;
  position: number;
  start: number;
  end: number;
};

type SavedTemplate = {
  id: string;
  name: string;
  lines: SavedTemplateLine[];
};

const templateStorageKey = "crop-and-edit.templates.v1";

const icons = {
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="1.5"/><path d="m21 16-5-5L5 19"/></svg>',
  vertical: '<svg viewBox="0 0 24 24"><path d="M12 4v16"/><path d="M7 4h10"/><path d="M7 20h10"/></svg>',
  horizontal: '<svg viewBox="0 0 24 24"><path d="M4 12h16"/><path d="M4 7v10"/><path d="M20 7v10"/></svg>',
  cursor: '<svg viewBox="0 0 24 24"><path d="m5 3 14 8-6 2-3 6Z"/></svg>',
  split: '<svg viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M4 12h6"/><path d="M14 12h6"/><circle cx="12" cy="12" r="2"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 7H4v5"/><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="M15 7h5v5"/><path d="M20 12a8 8 0 1 1-2.3-5.7L20 8.6"/></svg>',
  merge: '<svg viewBox="0 0 24 24"><path d="M4 8h6l4 8h6"/><path d="M4 16h6l4-8h6"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 4v16"/><path d="M4 12h16"/></svg>',
  clear: '<svg viewBox="0 0 24 24"><path d="M5 5l14 14"/><path d="M19 5 5 19"/></svg>',
  export: '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
  snap: '<svg viewBox="0 0 24 24"><path d="M6 4v16"/><path d="M18 4v16"/><path d="M6 8h12"/><path d="M6 16h12"/></svg>',
  template: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
};

function buttonIcon(icon: keyof typeof icons, label: string, hotkey?: string) {
  const shortcut = hotkey ? `<kbd>${hotkey}</kbd>` : "";
  return `${icons[icon]}<span>${label}</span>${shortcut}`;
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root missing");

app.innerHTML = `
  <main class="shell">
    <header class="appbar">
      <div class="brand">
        <h1>Crop and Edit</h1>
        <p class="status" id="status">Load an image to start.</p>
      </div>
      <div class="meta">
        <span id="imageMeta">No image loaded</span>
        <span id="hint">Drag lines or split segments. Split mode clicks intersections.</span>
      </div>
    </header>
    <aside class="tool-rail" aria-label="Tools">
      <section class="panel-section primary-tools" aria-label="File and line tools">
        <h2>Build</h2>
        <div class="control-group">
        <label class="file-button" title="Load image (Ctrl+O)">
          <input id="fileInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff" />
          ${buttonIcon("image", "Load image", "Ctrl O")}
        </label>
        <button id="addVertical" type="button" title="Add vertical line (V)">${buttonIcon("vertical", "Add vertical", "V")}</button>
        <button id="addHorizontal" type="button" title="Add horizontal line (H)">${buttonIcon("horizontal", "Add horizontal", "H")}</button>
        </div>
      </section>
      <section class="panel-section" aria-label="Mode">
        <h2>Mode</h2>
        <div class="control-group segmented">
        <button id="modeSelect" type="button" class="active" title="Select mode (S)">${buttonIcon("cursor", "Select", "S")}</button>
        <button id="modeSplit" type="button" title="Split mode (T)">${buttonIcon("split", "Split", "T")}</button>
        </div>
      </section>
      <section class="panel-section" aria-label="Edit commands">
        <h2>Edit</h2>
        <div class="control-group compact-actions">
        <button id="undo" type="button" title="Undo (Ctrl+Z)">${buttonIcon("undo", "Undo", "Ctrl Z")}</button>
        <button id="redo" type="button" title="Redo (Ctrl+Y)">${buttonIcon("redo", "Redo", "Ctrl Y")}</button>
        <button id="mergeLine" type="button" title="Merge selected line (M)">${buttonIcon("merge", "Merge", "M")}</button>
        <button id="deleteLine" type="button" title="Delete selected line (Delete)">${buttonIcon("trash", "Delete", "Del")}</button>
        </div>
      </section>
    </aside>
    <section class="workspace">
      <div class="stage-wrap">
        <canvas id="canvas"></canvas>
      </div>
    </section>
    <aside class="side-panel">
      <section class="panel-section">
        <h2>Snap equal</h2>
        <div class="snap-panel">
          <label>
            Vertical parts
            <select id="snapVertical">
              ${Array.from({ length: 9 }, (_, index) => `<option value="${index + 2}">${index + 2}</option>`).join("")}
            </select>
          </label>
          <button id="applySnapVertical" type="button">${buttonIcon("snap", "Apply vertical")}</button>
          <label>
            Horizontal parts
            <select id="snapHorizontal">
              ${Array.from({ length: 9 }, (_, index) => `<option value="${index + 2}">${index + 2}</option>`).join("")}
            </select>
          </label>
          <button id="applySnapHorizontal" type="button">${buttonIcon("snap", "Apply horizontal")}</button>
        </div>
      </section>
      <section class="panel-section">
        <h2>Templates</h2>
        <div class="control-group segmented three-up" aria-label="Templates">
          <button id="template2x2" type="button" title="Apply 2x2 template (2)">${buttonIcon("template", "2x2", "2")}</button>
          <button id="template3x3" type="button" title="Apply 3x3 template (3)">${buttonIcon("template", "3x3", "3")}</button>
          <button id="template4x4" type="button" title="Apply 4x4 template (4)">${buttonIcon("template", "4x4", "4")}</button>
        </div>
      </section>
      <section class="panel-section template-panel">
        <h2>Saved</h2>
        <input id="templateSearch" type="search" placeholder="Search templates" aria-label="Search saved templates" />
        <select id="savedTemplateList" size="4" aria-label="Saved templates"></select>
        <div class="control-group segmented">
          <button id="saveTemplate" type="button" title="Save current split layout (Ctrl+S)">${buttonIcon("template", "Save", "Ctrl S")}</button>
          <button id="applySavedTemplate" type="button" title="Apply selected saved template">${buttonIcon("check", "Apply")}</button>
        </div>
        <button id="deleteSavedTemplate" type="button" title="Delete selected saved template">${buttonIcon("trash", "Delete saved")}</button>
      </section>
      <section class="panel-section export-panel">
        <h2>Regions</h2>
        <div class="border-controls">
          <label class="toggle-control">
            <input id="borderEnabled" type="checkbox" />
            Add border
          </label>
          <label>
            Width (px)
            <input id="borderWidth" type="number" min="1" max="1000" value="10" disabled />
          </label>
          <label>
            Color
            <select id="borderColor" disabled>
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </label>
        </div>
        <div class="control-group">
          <button id="selectAll" type="button" title="Select all regions (Ctrl+A)">${buttonIcon("grid", "Select all", "Ctrl A")}</button>
          <button id="clearSelection" type="button">${buttonIcon("clear", "Clear regions")}</button>
          <button id="export" type="button" class="primary" title="Export selected (E)">${buttonIcon("export", "Export selected", "E")}</button>
        </div>
      </section>
      <section class="panel-section stats-panel">
        <h2>Selection</h2>
        <dl>
          <div><dt>Lines</dt><dd id="lineCount">0</dd></div>
          <div><dt>Regions</dt><dd id="regionCount">0</dd></div>
          <div><dt>Selected</dt><dd id="selectedCount">0</dd></div>
        </dl>
      </section>
    </aside>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const ctx = canvas.getContext("2d")!;
const fileInput = document.querySelector<HTMLInputElement>("#fileInput")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
const imageMetaEl = document.querySelector<HTMLSpanElement>("#imageMeta")!;
const lineCountEl = document.querySelector<HTMLElement>("#lineCount")!;
const regionCountEl = document.querySelector<HTMLElement>("#regionCount")!;
const selectedCountEl = document.querySelector<HTMLElement>("#selectedCount")!;
const snapVerticalEl = document.querySelector<HTMLSelectElement>("#snapVertical")!;
const snapHorizontalEl = document.querySelector<HTMLSelectElement>("#snapHorizontal")!;
const templateSearchEl = document.querySelector<HTMLInputElement>("#templateSearch")!;
const savedTemplateListEl = document.querySelector<HTMLSelectElement>("#savedTemplateList")!;
const borderEnabledEl = document.querySelector<HTMLInputElement>("#borderEnabled")!;
const borderWidthEl = document.querySelector<HTMLInputElement>("#borderWidth")!;
const borderColorEl = document.querySelector<HTMLSelectElement>("#borderColor")!;

let sourceImage: HTMLImageElement | null = null;
let sourceDataUrl = "";
let lines: SplitLine[] = [];
let selectedRegions = new Set<string>();
let selectedLineId: string | null = null;
let tool: Tool = "select";
let history: Snapshot[] = [];
let redoHistory: Snapshot[] = [];
let dragLineId: string | null = null;
let canvasScale = 1;
let canvasOffsetX = 0;
let canvasOffsetY = 0;
let canvasDisplayWidth = 960;
let canvasDisplayHeight = 640;

const uid = () => crypto.randomUUID();
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const samePosition = (a: number, b: number) => Math.abs(a - b) < 0.5;

function loadSavedTemplates(): SavedTemplate[] {
  try {
    const raw = localStorage.getItem(templateStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SavedTemplate => {
        return (
          typeof item?.id === "string" &&
          typeof item?.name === "string" &&
          Array.isArray(item?.lines) &&
          item.lines.every(
            (line: SavedTemplateLine) =>
              (line.orientation === "vertical" || line.orientation === "horizontal") &&
              Number.isFinite(line.position) &&
              Number.isFinite(line.start) &&
              Number.isFinite(line.end),
          )
        );
      })
      .map((item) => ({ ...item, lines: item.lines.map((line) => ({ ...line })) }));
  } catch {
    return [];
  }
}

function saveSavedTemplates(templates: SavedTemplate[]) {
  localStorage.setItem(templateStorageKey, JSON.stringify(templates));
}

function updateSavedTemplateSelect() {
  const templates = loadSavedTemplates();
  const previousValue = savedTemplateListEl.value;
  const query = templateSearchEl.value.trim().toLowerCase();
  const visibleTemplates = templates.filter((template) => template.name.toLowerCase().includes(query));
  savedTemplateListEl.innerHTML = visibleTemplates
    .map((template) => `<option value="${template.id}">${escapeHtml(template.name)}</option>`)
    .join("");
  if (visibleTemplates.some((template) => template.id === previousValue)) {
    savedTemplateListEl.value = previousValue;
  } else if (visibleTemplates.length) {
    savedTemplateListEl.value = visibleTemplates[0].id;
  }
  templateSearchEl.disabled = templates.length === 0;
  templateSearchEl.placeholder = templates.length ? "Search templates" : "No saved templates";
  savedTemplateListEl.disabled = visibleTemplates.length === 0;
  if (!visibleTemplates.length) {
    savedTemplateListEl.innerHTML = `<option value="">${templates.length ? "No matches" : "No saved templates"}</option>`;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function pushHistory() {
  history.push({
    lines: structuredClone(lines),
    selectedRegions: Array.from(selectedRegions),
  });
  history = history.slice(-80);
  redoHistory = [];
}

function restore(snapshot: Snapshot) {
  lines = structuredClone(snapshot.lines);
  selectedRegions = new Set(snapshot.selectedRegions);
  selectedLineId = null;
  render();
}

function currentSnapshot(): Snapshot {
  return {
    lines: structuredClone(lines),
    selectedRegions: Array.from(selectedRegions),
  };
}

function undo() {
  const previous = history.pop();
  if (!previous) return;
  redoHistory.push(currentSnapshot());
  redoHistory = redoHistory.slice(-80);
  restore(previous);
  setStatus("Last edit reverted.");
}

function redo() {
  const next = redoHistory.pop();
  if (!next) return;
  history.push(currentSnapshot());
  history = history.slice(-80);
  restore(next);
  setStatus("Last edit restored.");
}

function setStatus(message: string) {
  statusEl.textContent = message;
}

function getImageSize() {
  return { width: sourceImage?.naturalWidth ?? 0, height: sourceImage?.naturalHeight ?? 0 };
}

function sortedPositions(orientation: Orientation) {
  const { width, height } = getImageSize();
  const end = orientation === "vertical" ? width : height;
  const linePositions = lines
    .filter((line) => line.orientation === orientation)
    .map((line) => line.position)
    .sort((a, b) => a - b);
  const segmentEnds = lines
    .filter((line) => line.orientation !== orientation)
    .flatMap((line) => [line.start, line.end])
    .filter((value) => value > 0.5 && value < end - 0.5);
  const values = Array.from(new Set([...linePositions, ...segmentEnds].map((value) => Math.round(value)))).sort(
    (a, b) => a - b,
  );
  return [0, ...values, end];
}

function getRegions(): Region[] {
  const xs = sortedPositions("vertical");
  const ys = sortedPositions("horizontal");
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  const visited = new Set<string>();
  const regions: Region[] = [];
  const cellKey = (xi: number, yi: number) => `${xi},${yi}`;

  const hasBarrier = (orientation: Orientation, position: number, spanStart: number, spanEnd: number) => {
    return lines
      .filter((item) => item.orientation === orientation && Math.abs(item.position - position) < 0.5)
      .some((line) => line.start <= spanStart + 0.5 && line.end >= spanEnd - 0.5);
  };

  for (let yi = 0; yi < ys.length - 1; yi += 1) {
    for (let xi = 0; xi < xs.length - 1; xi += 1) {
      if (visited.has(cellKey(xi, yi))) continue;
      const stack = [{ xi, yi }];
      const cells: Region["cells"] = [];
      visited.add(cellKey(xi, yi));

      while (stack.length) {
        const cell = stack.pop()!;
        cells.push({
          xi: cell.xi,
          yi: cell.yi,
          x: Math.round(xs[cell.xi]),
          y: Math.round(ys[cell.yi]),
          width: Math.round(xs[cell.xi + 1] - xs[cell.xi]),
          height: Math.round(ys[cell.yi + 1] - ys[cell.yi]),
        });
        const neighbors = [
          {
            xi: cell.xi - 1,
            yi: cell.yi,
            blocked: cell.xi === 0 || hasBarrier("vertical", xs[cell.xi], ys[cell.yi], ys[cell.yi + 1]),
          },
          {
            xi: cell.xi + 1,
            yi: cell.yi,
            blocked: cell.xi === cols - 1 || hasBarrier("vertical", xs[cell.xi + 1], ys[cell.yi], ys[cell.yi + 1]),
          },
          {
            xi: cell.xi,
            yi: cell.yi - 1,
            blocked: cell.yi === 0 || hasBarrier("horizontal", ys[cell.yi], xs[cell.xi], xs[cell.xi + 1]),
          },
          {
            xi: cell.xi,
            yi: cell.yi + 1,
            blocked: cell.yi === rows - 1 || hasBarrier("horizontal", ys[cell.yi + 1], xs[cell.xi], xs[cell.xi + 1]),
          },
        ];
        for (const neighbor of neighbors) {
          if (neighbor.blocked || neighbor.xi < 0 || neighbor.yi < 0 || neighbor.xi >= cols || neighbor.yi >= rows) continue;
          const key = cellKey(neighbor.xi, neighbor.yi);
          if (!visited.has(key)) {
            visited.add(key);
            stack.push({ xi: neighbor.xi, yi: neighbor.yi });
          }
        }
      }

      const minX = Math.min(...cells.map((cell) => cell.x));
      const minY = Math.min(...cells.map((cell) => cell.y));
      const maxX = Math.max(...cells.map((cell) => cell.x + cell.width));
      const maxY = Math.max(...cells.map((cell) => cell.y + cell.height));
      const bottomIndex = rows - 1 - Math.max(...cells.map((cell) => cell.yi));
      const leftIndex = Math.min(...cells.map((cell) => cell.xi));
      regions.push({
        key: `x${leftIndex}y${bottomIndex}`,
        xIndex: leftIndex,
        yIndex: bottomIndex,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        cells,
      });
    }
  }
  return regions;
}

function fitCanvas() {
  if (!sourceImage) {
    canvasDisplayWidth = 960;
    canvasDisplayHeight = 640;
    canvasScale = 1;
    canvasOffsetX = 0;
    canvasOffsetY = 0;
    setCanvasSize(canvasDisplayWidth, canvasDisplayHeight);
    return;
  }
  const wrap = canvas.parentElement!;
  const maxWidth = Math.max(120, wrap.clientWidth - 24);
  const maxHeight = Math.max(120, wrap.clientHeight - 24);
  const scale = Math.min(maxWidth / sourceImage.naturalWidth, maxHeight / sourceImage.naturalHeight, 1);
  canvasDisplayWidth = Math.round(sourceImage.naturalWidth * scale);
  canvasDisplayHeight = Math.round(sourceImage.naturalHeight * scale);
  canvasScale = scale;
  canvasOffsetX = 0;
  canvasOffsetY = 0;
  setCanvasSize(canvasDisplayWidth, canvasDisplayHeight);
}

function setCanvasSize(width: number, height: number) {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function toCanvasX(x: number) {
  return canvasOffsetX + x * canvasScale;
}

function toCanvasY(y: number) {
  return canvasOffsetY + y * canvasScale;
}

function fromEvent(event: MouseEvent) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left - canvasOffsetX) / canvasScale, 0, getImageSize().width),
    y: clamp((event.clientY - rect.top - canvasOffsetY) / canvasScale, 0, getImageSize().height),
  };
}

function render() {
  fitCanvas();
  ctx.clearRect(0, 0, canvasDisplayWidth, canvasDisplayHeight);
  ctx.fillStyle = "#17191d";
  ctx.fillRect(0, 0, canvasDisplayWidth, canvasDisplayHeight);

  if (!sourceImage) {
    ctx.fillStyle = "#d9dee7";
    ctx.font = "18px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Load an image to begin", canvasDisplayWidth / 2, canvasDisplayHeight / 2);
    updateCounters();
    return;
  }

  ctx.drawImage(sourceImage, 0, 0, canvasDisplayWidth, canvasDisplayHeight);
  drawRegions();
  drawLines();
  drawIntersections();
  updateCounters();
}

function drawRegions() {
  const regions = getRegions();
  ctx.save();
  for (const region of regions) {
    const selected = selectedRegions.has(region.key);
    ctx.fillStyle = selected ? "rgba(52, 211, 153, 0.23)" : "rgba(15, 23, 42, 0.22)";
    ctx.strokeStyle = selected ? "#34d399" : "rgba(226, 232, 240, 0.45)";
    ctx.lineWidth = selected ? 2 : 1;
    for (const cell of region.cells) {
      ctx.fillRect(toCanvasX(cell.x), toCanvasY(cell.y), cell.width * canvasScale, cell.height * canvasScale);
      ctx.strokeRect(toCanvasX(cell.x), toCanvasY(cell.y), cell.width * canvasScale, cell.height * canvasScale);
    }
    ctx.fillStyle = selected ? "#dcfce7" : "#e2e8f0";
    ctx.font = "12px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(region.key, toCanvasX(region.x) + 8, toCanvasY(region.y) + 18);
  }
  ctx.restore();
}

function drawLines() {
  ctx.save();
  ctx.lineCap = "round";
  for (const line of lines) {
    const selected = selectedLineId === line.id;
    ctx.strokeStyle = selected ? "#fbbf24" : "#f8fafc";
    ctx.lineWidth = selected ? 3 : 2;
    ctx.beginPath();
    if (line.orientation === "vertical") {
      ctx.moveTo(toCanvasX(line.position), toCanvasY(line.start));
      ctx.lineTo(toCanvasX(line.position), toCanvasY(line.end));
    } else {
      ctx.moveTo(toCanvasX(line.start), toCanvasY(line.position));
      ctx.lineTo(toCanvasX(line.end), toCanvasY(line.position));
    }
    ctx.stroke();
    drawHandle(line);
  }
  ctx.restore();
}

function drawHandle(line: SplitLine) {
  const center = (line.start + line.end) / 2;
  const x = line.orientation === "vertical" ? toCanvasX(line.position) : toCanvasX(center);
  const y = line.orientation === "vertical" ? toCanvasY(center) : toCanvasY(line.position);
  ctx.beginPath();
  ctx.fillStyle = "#101317";
  ctx.strokeStyle = selectedLineId === line.id ? "#fbbf24" : "#f8fafc";
  ctx.lineWidth = 2;
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawIntersections() {
  if (tool !== "split") return;
  ctx.save();
  for (const vertical of lines.filter((line) => line.orientation === "vertical")) {
    for (const horizontal of lines.filter((line) => line.orientation === "horizontal")) {
      if (!segmentsIntersect(vertical, horizontal)) continue;
      ctx.beginPath();
      ctx.fillStyle = "#60a5fa";
      ctx.strokeStyle = "#eff6ff";
      ctx.lineWidth = 2;
      ctx.arc(toCanvasX(vertical.position), toCanvasY(horizontal.position), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function segmentsIntersect(vertical: SplitLine, horizontal: SplitLine) {
  return (
    vertical.orientation === "vertical" &&
    horizontal.orientation === "horizontal" &&
    horizontal.position >= vertical.start - 0.5 &&
    horizontal.position <= vertical.end + 0.5 &&
    vertical.position >= horizontal.start - 0.5 &&
    vertical.position <= horizontal.end + 0.5
  );
}

function updateCounters() {
  const regions = getRegions();
  lineCountEl.textContent = String(lines.length);
  regionCountEl.textContent = String(regions.length);
  selectedCountEl.textContent = String(selectedRegions.size);
  imageMetaEl.textContent = sourceImage
    ? `${sourceImage.naturalWidth} x ${sourceImage.naturalHeight}px`
    : "No image loaded";
}

function addLine(orientation: Orientation) {
  if (!sourceImage) return setStatus("Load an image before adding crop lines.");
  pushHistory();
  const same = lines.filter((line) => line.orientation === orientation).length;
  const positionEnd = orientation === "vertical" ? sourceImage.naturalWidth : sourceImage.naturalHeight;
  const segmentEnd = orientation === "vertical" ? sourceImage.naturalHeight : sourceImage.naturalWidth;
  lines.push({
    id: uid(),
    orientation,
    position: Math.round((positionEnd * (same + 1)) / (same + 2)),
    start: 0,
    end: segmentEnd,
  });
  selectedRegions.clear();
  selectedLineId = lines.at(-1)!.id;
  setStatus(`${orientation === "vertical" ? "Vertical" : "Horizontal"} line added.`);
  render();
}

function equalLines(orientation: Orientation, parts: number): SplitLine[] {
  const { width, height } = getImageSize();
  const positionEnd = orientation === "vertical" ? width : height;
  const segmentEnd = orientation === "vertical" ? height : width;
  return Array.from({ length: parts - 1 }, (_, index) => ({
    id: uid(),
    orientation,
    position: Math.round((positionEnd * (index + 1)) / parts),
    start: 0,
    end: segmentEnd,
  }));
}

function applyEqualSnap(orientation: Orientation, parts: number) {
  if (!sourceImage) return setStatus("Load an image before applying equal gaps.");
  pushHistory();
  lines = [...lines.filter((line) => line.orientation !== orientation), ...equalLines(orientation, parts)];
  selectedRegions.clear();
  selectedLineId = null;
  setStatus(`${orientation === "vertical" ? "Vertical" : "Horizontal"} lines snapped to ${parts} equal parts.`);
  render();
}

function applyTemplate(columnParts: number, rowParts: number, label: string) {
  if (!sourceImage) return setStatus("Load an image before applying a template.");
  pushHistory();
  lines = [...equalLines("vertical", columnParts), ...equalLines("horizontal", rowParts)];
  selectedRegions.clear();
  selectedLineId = null;
  setStatus(`${label} template applied.`);
  render();
}

function normalizeLine(line: SplitLine): SavedTemplateLine {
  const { width, height } = getImageSize();
  const positionEnd = line.orientation === "vertical" ? width : height;
  const segmentEnd = line.orientation === "vertical" ? height : width;
  return {
    orientation: line.orientation,
    position: clamp(line.position / positionEnd, 0, 1),
    start: clamp(line.start / segmentEnd, 0, 1),
    end: clamp(line.end / segmentEnd, 0, 1),
  };
}

function denormalizeLine(line: SavedTemplateLine): SplitLine {
  const { width, height } = getImageSize();
  const positionEnd = line.orientation === "vertical" ? width : height;
  const segmentEnd = line.orientation === "vertical" ? height : width;
  const position = Math.round(clamp(line.position, 0, 1) * positionEnd);
  const start = Math.round(clamp(line.start, 0, 1) * segmentEnd);
  const end = Math.round(clamp(line.end, 0, 1) * segmentEnd);
  return {
    id: uid(),
    orientation: line.orientation,
    position: clamp(position, 1, Math.max(1, positionEnd - 1)),
    start: clamp(Math.min(start, end), 0, segmentEnd),
    end: clamp(Math.max(start, end), 0, segmentEnd),
  };
}

function saveCurrentTemplate() {
  if (!sourceImage) return setStatus("Load an image before saving a template.");
  if (!lines.length) return setStatus("Add crop lines before saving a template.");
  const name = prompt("Template name");
  const trimmedName = name?.trim();
  if (!trimmedName) return;
  const templates = loadSavedTemplates();
  const existingIndex = templates.findIndex((template) => template.name.toLowerCase() === trimmedName.toLowerCase());
  const saved: SavedTemplate = {
    id: existingIndex >= 0 ? templates[existingIndex].id : uid(),
    name: trimmedName,
    lines: lines.map(normalizeLine),
  };
  if (existingIndex >= 0) templates[existingIndex] = saved;
  else templates.push(saved);
  saveSavedTemplates(templates);
  templateSearchEl.value = "";
  updateSavedTemplateSelect();
  savedTemplateListEl.value = saved.id;
  setStatus(`${trimmedName} template saved.`);
}

function applySavedTemplate() {
  if (!sourceImage) return setStatus("Load an image before applying a saved template.");
  const template = loadSavedTemplates().find((item) => item.id === savedTemplateListEl.value);
  if (!template) return setStatus("Choose a saved template first.");
  pushHistory();
  lines = template.lines.map(denormalizeLine).filter((line) => line.end - line.start > 0);
  selectedRegions.clear();
  selectedLineId = null;
  setStatus(`${template.name} template applied.`);
  render();
}

function deleteSavedTemplate() {
  const templates = loadSavedTemplates();
  const template = templates.find((item) => item.id === savedTemplateListEl.value);
  if (!template) return setStatus("Choose a saved template first.");
  saveSavedTemplates(templates.filter((item) => item.id !== template.id));
  updateSavedTemplateSelect();
  setStatus(`${template.name} template deleted.`);
}

function setTool(nextTool: Tool) {
  tool = nextTool;
  document.querySelector("#modeSelect")!.classList.toggle("active", tool === "select");
  document.querySelector("#modeSplit")!.classList.toggle("active", tool === "split");
  render();
}

function toggleSplitMode() {
  setTool(tool === "split" ? "select" : "split");
}

function deleteSelectedLine() {
  if (!selectedLineId) return setStatus("Select a line first.");
  pushHistory();
  lines = lines.filter((line) => line.id !== selectedLineId);
  selectedLineId = null;
  setStatus("Selected line deleted.");
  render();
}

function mergeSelectedLine() {
  const line = lines.find((item) => item.id === selectedLineId);
  if (!line) return setStatus("Select a split line first.");
  pushHistory();
  if (!mergeLineWithNeighbors(line)) {
    history.pop();
    setStatus("Selected line has no touching segment to merge.");
    return;
  }
  setStatus("Selected line merged with touching segment.");
  render();
}

function selectAllRegions() {
  if (!sourceImage) return;
  pushHistory();
  selectedRegions = new Set(getRegions().map((region) => region.key));
  setStatus("All crop regions selected.");
  render();
}

function clearRegionSelection() {
  pushHistory();
  selectedRegions.clear();
  setStatus("Region selection cleared.");
  render();
}

async function exportSelectedRegions() {
  if (!sourceImage || !sourceDataUrl) return setStatus("Load an image before exporting.");
  const regions = getRegions().filter((region) => selectedRegions.has(region.key));
  if (!regions.length) return setStatus("Select at least one crop region before exporting.");
  const borderWidth = borderEnabledEl.checked ? clamp(Number.parseInt(borderWidthEl.value, 10) || 0, 1, 1000) : 0;
  try {
    const response = await invoke<{ folder: string; files: string[] }>("export_regions", {
      request: {
        imageDataUrl: sourceDataUrl,
        borderWidth,
        borderColor: borderColorEl.value,
        regions: regions.map((region) => ({
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height,
          coordX: region.xIndex,
          coordY: region.yIndex,
        })),
      },
    });
    setStatus(`Exported ${response.files.length} PNG file${response.files.length === 1 ? "" : "s"} to ${response.folder}.`);
  } catch (error) {
    setStatus(String(error));
  }
}

function nearestLine(point: { x: number; y: number }) {
  let best: { line: SplitLine; distance: number } | null = null;
  for (const line of lines) {
    const along = line.orientation === "vertical" ? point.y : point.x;
    if (along < line.start - 10 / canvasScale || along > line.end + 10 / canvasScale) continue;
    const distance = line.orientation === "vertical" ? Math.abs(point.x - line.position) : Math.abs(point.y - line.position);
    if (distance * canvasScale <= 12 && (!best || distance < best.distance)) {
      best = { line, distance };
    }
  }
  return best?.line ?? null;
}

function nearestIntersection(point: { x: number; y: number }) {
  const verticals = lines.filter((line) => line.orientation === "vertical");
  const horizontals = lines.filter((line) => line.orientation === "horizontal");
  let best: { vertical: SplitLine; horizontal: SplitLine; distance: number } | null = null;
  for (const vertical of verticals) {
    for (const horizontal of horizontals) {
      const distance = Math.hypot(point.x - vertical.position, point.y - horizontal.position);
      if (segmentsIntersect(vertical, horizontal) && distance * canvasScale <= 14 && (!best || distance < best.distance)) {
        best = { vertical, horizontal, distance };
      }
    }
  }
  return best;
}

function splitLineAt(target: SplitLine, crossPosition: number) {
  if (crossPosition <= target.start + 1 || crossPosition >= target.end - 1) return false;
  const splitAt = Math.round(crossPosition);
  const first: SplitLine = { ...target, id: uid(), end: splitAt };
  const second: SplitLine = { ...target, id: uid(), start: splitAt };
  lines = lines.filter((line) => line.id !== target.id);
  lines.push(first, second);
  selectedLineId = second.id;
  return true;
}

function moveLine(line: SplitLine, nextPosition: number) {
  const previousPosition = line.position;
  line.position = nextPosition;
  for (const other of lines) {
    if (other.id === line.id || other.orientation === line.orientation) continue;
    if (other.position < line.start - 0.5 || other.position > line.end + 0.5) continue;
    if (samePosition(other.start, previousPosition)) {
      other.start = Math.min(nextPosition, other.end - 1);
    }
    if (samePosition(other.end, previousPosition)) {
      other.end = Math.max(nextPosition, other.start + 1);
    }
  }
}

function mergeLineWithNeighbors(target: SplitLine) {
  const touching = lines.filter(
    (line) =>
      line.id !== target.id &&
      line.orientation === target.orientation &&
      Math.abs(line.position - target.position) < 0.5 &&
      (Math.abs(line.end - target.start) < 0.5 || Math.abs(target.end - line.start) < 0.5),
  );
  if (!touching.length) return false;
  const mergedIds = new Set([target.id, ...touching.map((line) => line.id)]);
  const merged: SplitLine = {
    ...target,
    id: uid(),
    start: Math.min(target.start, ...touching.map((line) => line.start)),
    end: Math.max(target.end, ...touching.map((line) => line.end)),
  };
  lines = lines.filter((line) => !mergedIds.has(line.id));
  lines.push(merged);
  selectedLineId = merged.id;
  return true;
}

function regionAt(point: { x: number; y: number }) {
  return getRegions().find(
    (region) =>
      point.x >= region.x &&
      point.x <= region.x + region.width &&
      point.y >= region.y &&
      point.y <= region.y + region.height,
  );
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const dataUrl = String(reader.result);
    const image = new Image();
    image.addEventListener("load", () => {
      sourceImage = image;
      sourceDataUrl = dataUrl;
      lines = [];
      selectedRegions.clear();
      selectedLineId = null;
      history = [];
      redoHistory = [];
      setStatus(`Loaded ${file.name}.`);
      render();
    });
    image.src = dataUrl;
  });
  reader.readAsDataURL(file);
});

canvas.addEventListener("mousedown", (event) => {
  if (!sourceImage) return;
  const point = fromEvent(event);
  if (tool === "split") {
    const hit = nearestIntersection(point);
    if (!hit) return;
    pushHistory();
    const target = selectedLineId ? lines.find((line) => line.id === selectedLineId) : null;
    const lineToSplit = target && (target.id === hit.vertical.id || target.id === hit.horizontal.id) ? target : hit.horizontal;
    const crossPosition = lineToSplit.orientation === "vertical" ? hit.horizontal.position : hit.vertical.position;
    if (!splitLineAt(lineToSplit, crossPosition)) {
      history.pop();
      setStatus("Choose an intersection inside the selected line segment.");
      return;
    }
    setStatus("Line split into independent segments. Drag or delete the selected segment.");
    render();
    return;
  }

  const line = nearestLine(point);
  if (line) {
    pushHistory();
    selectedLineId = line.id;
    dragLineId = line.id;
    render();
    return;
  }

  const region = regionAt(point);
  if (region) {
    pushHistory();
    if (selectedRegions.has(region.key)) selectedRegions.delete(region.key);
    else selectedRegions.add(region.key);
    selectedLineId = null;
    setStatus(`${region.key} ${selectedRegions.has(region.key) ? "selected" : "cleared"}.`);
    render();
  }
});

window.addEventListener("mousemove", (event) => {
  if (!dragLineId || !sourceImage) return;
  const line = lines.find((item) => item.id === dragLineId);
  if (!line) return;
  const point = fromEvent(event);
  const end = line.orientation === "vertical" ? sourceImage.naturalWidth : sourceImage.naturalHeight;
  const nextPosition = Math.round(clamp(line.orientation === "vertical" ? point.x : point.y, 1, end - 1));
  moveLine(line, nextPosition);
  render();
});

window.addEventListener("mouseup", () => {
  dragLineId = null;
});

document.querySelector("#addVertical")!.addEventListener("click", () => addLine("vertical"));
document.querySelector("#addHorizontal")!.addEventListener("click", () => addLine("horizontal"));
document.querySelector("#applySnapVertical")!.addEventListener("click", () => {
  applyEqualSnap("vertical", Number(snapVerticalEl.value));
});
document.querySelector("#applySnapHorizontal")!.addEventListener("click", () => {
  applyEqualSnap("horizontal", Number(snapHorizontalEl.value));
});
document.querySelector("#template2x2")!.addEventListener("click", () => applyTemplate(2, 2, "2x2"));
document.querySelector("#template3x3")!.addEventListener("click", () => applyTemplate(3, 3, "3x3"));
document.querySelector("#template4x4")!.addEventListener("click", () => applyTemplate(4, 4, "4x4"));
document.querySelector("#saveTemplate")!.addEventListener("click", saveCurrentTemplate);
document.querySelector("#applySavedTemplate")!.addEventListener("click", applySavedTemplate);
document.querySelector("#deleteSavedTemplate")!.addEventListener("click", deleteSavedTemplate);
templateSearchEl.addEventListener("input", updateSavedTemplateSelect);
savedTemplateListEl.addEventListener("dblclick", applySavedTemplate);
document.querySelector("#undo")!.addEventListener("click", undo);
document.querySelector("#redo")!.addEventListener("click", redo);
document.querySelector("#deleteLine")!.addEventListener("click", deleteSelectedLine);
document.querySelector("#mergeLine")!.addEventListener("click", mergeSelectedLine);
document.querySelector("#selectAll")!.addEventListener("click", selectAllRegions);
document.querySelector("#clearSelection")!.addEventListener("click", clearRegionSelection);
document.querySelector("#modeSelect")!.addEventListener("click", () => setTool("select"));
document.querySelector("#modeSplit")!.addEventListener("click", () => setTool("split"));
document.querySelector("#export")!.addEventListener("click", exportSelectedRegions);
borderEnabledEl.addEventListener("change", () => {
  borderWidthEl.disabled = borderColorEl.disabled = !borderEnabledEl.checked;
});

window.addEventListener("resize", render);
new ResizeObserver(render).observe(document.querySelector<HTMLElement>(".stage-wrap")!);
window.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === "s") {
    event.preventDefault();
    saveCurrentTemplate();
    return;
  }
  if (target?.matches("input, select, textarea")) return;
  if ((event.ctrlKey || event.metaKey) && key === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === "y") {
    event.preventDefault();
    redo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === "a") {
    event.preventDefault();
    selectAllRegions();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === "o") {
    event.preventDefault();
    fileInput.click();
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && key === "v") {
    event.preventDefault();
    addLine("vertical");
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && key === "h") {
    event.preventDefault();
    addLine("horizontal");
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && key === "s") {
    event.preventDefault();
    setTool("select");
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && key === "t") {
    event.preventDefault();
    toggleSplitMode();
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && key === "m") {
    event.preventDefault();
    mergeSelectedLine();
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && key === "delete") {
    event.preventDefault();
    deleteSelectedLine();
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && key === "2") {
    event.preventDefault();
    applyTemplate(2, 2, "2x2");
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && key === "3") {
    event.preventDefault();
    applyTemplate(3, 3, "3x3");
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && key === "4") {
    event.preventDefault();
    applyTemplate(4, 4, "4x4");
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && key === "e") {
    event.preventDefault();
    void exportSelectedRegions();
  }
});
updateSavedTemplateSelect();
render();
