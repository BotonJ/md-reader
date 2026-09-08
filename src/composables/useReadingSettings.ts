import { ref, computed } from "vue";
import { i18n } from "../i18n";

export interface ReadingSettings {
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
  fontFamily: string;
  editorFontSize: number;
  editorFontFamily: string;
  tocPosition: "left" | "right";
  readerBgLight: string | null;
  readerBgDark: string | null;
}

const FONT_KEYS = ["system", "sans", "serif", "mono"] as const;

const FONT_STACKS: Record<string, string> = {
  system:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
  sans: '"Inter", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
  serif:
    '"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", "STSong", Georgia, serif',
  mono: 'ui-monospace, SFMono-Regular, "JetBrains Mono", "Cascadia Code", "Source Code Pro", Consolas, monospace',
};

const STORAGE = "md-reader-reading";

function loadSettings(): ReadingSettings {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return defaults();
}

function defaults(): ReadingSettings {
  return {
    fontSize: 16,
    lineHeight: 1.75,
    maxWidth: 900,
    fontFamily: "system",
    editorFontSize: 14,
    editorFontFamily: "mono",
    tocPosition: "right",
    readerBgLight: null,
    readerBgDark: null,
  };
}

const settings = ref<ReadingSettings>(loadSettings());

function save() {
  localStorage.setItem(STORAGE, JSON.stringify(settings.value));
  apply();
}

function getFontStack(value: string): string {
  if (FONT_STACKS[value]) return FONT_STACKS[value];
  if (value) return `"${value}", ${FONT_STACKS.system}`;
  return FONT_STACKS.system;
}

function getEditorFontStack(value: string): string {
  if (value === "mono" || !value) return FONT_STACKS.mono;
  return `"${value}", ${FONT_STACKS.mono}`;
}

function apply() {
  const r = document.documentElement;
  r.style.setProperty("--reader-font-size", settings.value.fontSize + "px");
  r.style.setProperty(
    "--reader-line-height",
    String(settings.value.lineHeight)
  );
  r.style.setProperty("--reader-max-width", settings.value.maxWidth + "px");
  r.style.setProperty(
    "--reader-font-family",
    getFontStack(settings.value.fontFamily)
  );
  r.style.setProperty(
    "--editor-font-size",
    settings.value.editorFontSize + "px"
  );
  r.style.setProperty(
    "--editor-font-family",
    getEditorFontStack(settings.value.editorFontFamily)
  );
  setReaderBgVar("--reader-bg-light", settings.value.readerBgLight);
  setReaderBgVar("--reader-bg-dark", settings.value.readerBgDark);
}

function setReaderBgVar(name: string, value: string | null) {
  const r = document.documentElement;
  if (value && /^#[0-9a-fA-F]{6}$/.test(value)) {
    r.style.setProperty(name, value);
  } else {
    r.style.removeProperty(name);
  }
}

function setFontSize(v: number) {
  settings.value.fontSize = Math.max(10, Math.min(28, v));
  save();
}

function setLineHeight(v: number) {
  settings.value.lineHeight = Math.max(1.2, Math.min(2.4, v));
  save();
}

function setMaxWidth(v: number) {
  settings.value.maxWidth = Math.max(600, Math.min(1400, v));
  save();
}

function setFontFamily(v: string) {
  settings.value.fontFamily = v;
  save();
}

function setEditorFontSize(v: number) {
  settings.value.editorFontSize = Math.max(12, Math.min(24, v));
  save();
}

function setEditorFontFamily(v: string) {
  settings.value.editorFontFamily = v;
  save();
}

function setTocPosition(v: "left" | "right") {
  settings.value.tocPosition = v;
  save();
}

function setReaderBgLight(v: string | null) {
  settings.value.readerBgLight = normalizeColor(v);
  save();
}

function setReaderBgDark(v: string | null) {
  settings.value.readerBgDark = normalizeColor(v);
  save();
}

function normalizeColor(v: string | null): string | null {
  if (!v) return null;
  const m = /^#([0-9a-fA-F]{6})$/.exec(v.trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

function resetReaderBg() {
  settings.value.readerBgLight = null;
  settings.value.readerBgDark = null;
  save();
}

function reset() {
  settings.value = defaults();
  save();
}

const fontOptions = computed(() =>
  FONT_KEYS.map((key) => ({
    label: i18n.global.t(`settings.${key}`),
    value: key,
  }))
);

export function useReadingSettings() {
  return {
    settings,
    fontOptions,
    apply,
    setFontSize,
    setLineHeight,
    setMaxWidth,
    setFontFamily,
    setEditorFontSize,
    setEditorFontFamily,
    setTocPosition,
    setReaderBgLight,
    setReaderBgDark,
    resetReaderBg,
    reset,
  };
}
