import { onUnmounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export type FileChangeHandler = (paths: string[]) => void;

export function useFileWatcher() {
  const watching = ref<string[]>([]);
  const watched = new Set<string>();
  let unlisten: UnlistenFn | null = null;
  let handler: FileChangeHandler | null = null;

  async function add(root: string, h: FileChangeHandler) {
    if (!unlisten) {
      unlisten = await listen<string[]>("md-reader://file-changed", (event) => {
        handler?.(event.payload);
      });
    }
    handler = h;
    if (watched.has(root)) return;
    await invoke("start_watch", { root });
    watched.add(root);
    watching.value = [...watched];
  }

  async function remove(root: string) {
    if (!watched.has(root)) return;
    watched.delete(root);
    watching.value = [...watched];
    try {
      await invoke("unwatch_root", { root });
    } catch {
      /* ignore */
    }
  }

  async function stop() {
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
    handler = null;
    if (watched.size) {
      try {
        await invoke("stop_watch");
      } catch {
        /* ignore */
      }
      watched.clear();
      watching.value = [];
    }
  }

  onUnmounted(() => {
    void stop();
  });

  return { watching, add, remove, stop };
}
