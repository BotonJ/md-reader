<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import {
  renderMarkdown,
  renderMath,
  renderMermaid,
} from "../composables/useMarkdown";
import { rewriteImagesAndLinks } from "../composables/useLinkRewriter";

const { t } = useI18n();

const props = defineProps<{
  source: string;
  currentFile: string;
  rootDir: string;
  renderTick?: number;
}>();
const emit = defineEmits<{
  (e: "rendered", el: HTMLElement): void;
  (e: "internal-link", path: string, hash: string): void;
}>();

const html = ref<string>("");
const root = ref<HTMLElement | null>(null);
const lightboxSrc = ref("");
let copyTimer: number | null = null;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function enhanceCodeBlocks(el: HTMLElement) {
  const pres = el.querySelectorAll<HTMLPreElement>("pre");
  for (const pre of pres) {
    if (pre.querySelector(".code-copy")) continue;
    // Mermaid blocks are rendered into SVGs, not copyable source.
    if (pre.querySelector("svg")) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-copy";
    btn.textContent = t("app.copyCode");
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const code = pre.querySelector("code");
      const text = code ? code.textContent ?? "" : pre.textContent ?? "";
      if (await copyText(text)) {
        btn.classList.add("copied");
        btn.textContent = "✓";
        if (copyTimer) clearTimeout(copyTimer);
        copyTimer = window.setTimeout(() => {
          btn.classList.remove("copied");
          btn.textContent = t("app.copyCode");
        }, 1500);
      }
    });
    pre.appendChild(btn);
  }
}

// Capture phase so images inside links open the lightbox instead of
// triggering the link.
function onRootClickCapture(e: MouseEvent) {
  const target = e.target;
  if (target instanceof HTMLImageElement) {
    const src = target.getAttribute("src") || "";
    if (src) {
      e.preventDefault();
      e.stopPropagation();
      lightboxSrc.value = src;
    }
  }
}

function closeLightbox() {
  lightboxSrc.value = "";
}

function onWindowKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && lightboxSrc.value) closeLightbox();
}

async function update() {
  html.value = renderMarkdown(props.source);
  await nextTick();
  if (root.value) {
    rewriteImagesAndLinks(
      root.value,
      { currentFile: props.currentFile, rootDir: props.rootDir },
      (path, hash) => emit("internal-link", path, hash)
    );
    await renderMath(root.value);
    await renderMermaid(root.value);
    enhanceCodeBlocks(root.value);
    emit("rendered", root.value);
  }
}

async function refreshThemeRender() {
  if (!root.value) return;
  await renderMermaid(root.value, true);
  emit("rendered", root.value);
}

onMounted(() => {
  void update();
  window.addEventListener("keydown", onWindowKeydown);
});
onUnmounted(() => {
  window.removeEventListener("keydown", onWindowKeydown);
  if (copyTimer) clearTimeout(copyTimer);
});
watch(
  () => [props.source, props.currentFile, props.rootDir],
  () => update()
);
watch(
  () => props.renderTick,
  () => refreshThemeRender()
);

defineExpose({ root });
</script>

<template>
  <article
    ref="root"
    class="markdown-body"
    v-html="html"
    @click.capture="onRootClickCapture"
  ></article>
  <Teleport to="body">
    <div v-if="lightboxSrc" class="lightbox" @click="closeLightbox">
      <img :src="lightboxSrc" alt="" />
      <div class="lightbox-hint">{{ t("app.clickToClose") }}</div>
    </div>
  </Teleport>
</template>

<style scoped>
.markdown-body {
  padding: 32px 48px 80px;
  max-width: var(--reader-max-width, 900px);
  margin: 0 auto;
  line-height: var(--reader-line-height, 1.75);
  font-size: var(--reader-font-size, 16px);
  font-family: var(--reader-font-family, inherit);
  color: var(--fg);
}

:root[data-theme="dark"] .markdown-body {
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
}

.markdown-body :deep(pre) {
  position: relative;
}

.markdown-body :deep(.code-copy) {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 2px 8px;
  font-size: 11px;
  line-height: 1.4;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-btn);
  color: var(--fg-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s;
}

.markdown-body :deep(pre:hover .code-copy),
.markdown-body :deep(.code-copy:focus) {
  opacity: 1;
}

.markdown-body :deep(.code-copy:hover) {
  color: var(--fg);
  background: var(--bg-btn-hover);
}

.markdown-body :deep(.code-copy.copied) {
  color: #2e9e5b;
  border-color: #2e9e5b;
}

.lightbox {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.86);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  cursor: zoom-out;
}

.lightbox img {
  max-width: 92vw;
  max-height: 88vh;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
}

.lightbox-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}
</style>
