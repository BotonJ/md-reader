import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export interface MdFile {
  path: string;
  name: string;
  rel_path: string;
  size: number;
  modified_ms: number;
}

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: TreeNode[];
  file?: MdFile;
}

const ROOTS_KEY = "md-reader-roots";
const LEGACY_ROOT_KEY = "md-reader-root";

const roots = ref<string[]>([]);
const filesByRoot = ref<Record<string, MdFile[]>>({});
const errorsByRoot = ref<Record<string, string>>({});
const loading = ref<boolean>(false);
const filterText = ref<string>("");

function buildTree(items: MdFile[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", isDir: true, children: [] };
  for (const f of items) {
    const parts = f.rel_path.split(/[\\/]/);
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (isLast) {
        cur.children!.push({
          name: part,
          path: f.path,
          isDir: false,
          file: f,
        });
      } else {
        let next = cur.children!.find((c) => c.isDir && c.name === part);
        if (!next) {
          next = {
            name: part,
            path: parts.slice(0, i + 1).join("/"),
            isDir: true,
            children: [],
          };
          cur.children!.push(next);
        }
        cur = next;
      }
    }
  }
  sortNode(root);
  return root.children!;
}

function sortNode(node: TreeNode): void {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, "zh-CN");
  });
  node.children.forEach(sortNode);
}

const treeByRoot = computed<Record<string, TreeNode[]>>(() => {
  const out: Record<string, TreeNode[]> = {};
  const filter = filterText.value.trim().toLowerCase();
  for (const root of roots.value) {
    const items = (filesByRoot.value[root] ?? []).filter(
      (f) => !filter || f.name.toLowerCase().includes(filter)
    );
    out[root] = buildTree(items);
  }
  return out;
});

function persistRoots(): void {
  localStorage.setItem(ROOTS_KEY, JSON.stringify(roots.value));
}

async function loadRoot(root: string): Promise<void> {
  if (!root) return;
  loading.value = true;
  try {
    const list = await invoke<MdFile[]>("list_md_files", { root });
    filesByRoot.value = { ...filesByRoot.value, [root]: list };
    const errs = { ...errorsByRoot.value };
    delete errs[root];
    errorsByRoot.value = errs;
  } catch (e: any) {
    errorsByRoot.value = {
      ...errorsByRoot.value,
      [root]: String(e?.message ?? e),
    };
  } finally {
    loading.value = false;
  }
}

async function refresh(): Promise<void> {
  await Promise.all(roots.value.map((r) => loadRoot(r)));
}

async function addRoot(path: string): Promise<string | null> {
  if (!path || roots.value.includes(path)) return null;
  roots.value.push(path);
  persistRoots();
  await loadRoot(path);
  return path;
}

function removeRoot(path: string): void {
  roots.value = roots.value.filter((r) => r !== path);
  const files = { ...filesByRoot.value };
  delete files[path];
  filesByRoot.value = files;
  const errs = { ...errorsByRoot.value };
  delete errs[path];
  errorsByRoot.value = errs;
  persistRoots();
}

async function pickFolder(): Promise<string | null> {
  const selected = await open({ multiple: false, directory: true });
  if (typeof selected === "string") return await addRoot(selected);
  return null;
}

async function restoreRoots(): Promise<void> {
  let saved: unknown = [];
  try {
    saved = JSON.parse(localStorage.getItem(ROOTS_KEY) ?? "[]");
  } catch {
    saved = [];
  }
  let list: string[] = Array.isArray(saved)
    ? saved.filter((s): s is string => typeof s === "string" && !!s)
    : [];
  // Migrate the legacy single-root setting.
  if (!list.length) {
    const legacy = localStorage.getItem(LEGACY_ROOT_KEY);
    if (legacy) list = [legacy];
  }
  const unique = [...new Set(list)];
  roots.value = unique;
  if (unique.length) {
    localStorage.setItem(ROOTS_KEY, JSON.stringify(unique));
    localStorage.removeItem(LEGACY_ROOT_KEY);
  }
  await Promise.all(unique.map((r) => loadRoot(r)));
}

function clearRoots(): void {
  roots.value = [];
  filesByRoot.value = {};
  errorsByRoot.value = {};
  localStorage.removeItem(ROOTS_KEY);
  localStorage.removeItem(LEGACY_ROOT_KEY);
}

export function useFileTree() {
  return {
    roots,
    filesByRoot,
    treeByRoot,
    errorsByRoot,
    loading,
    filterText,
    refresh,
    addRoot,
    removeRoot,
    pickFolder,
    restoreRoots,
    clearRoots,
  };
}
