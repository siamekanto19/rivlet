import { PickFolder } from '../../wailsjs/go/main/App';

function hasWails(): boolean {
  return Boolean((window as unknown as { go?: { main?: { App?: unknown } } }).go?.main?.App);
}

/** Opens the native OS directory picker. Cancellation preserves the old path. */
export async function pickFolder(currentPath = ''): Promise<string> {
  if (!hasWails()) return currentPath;
  const selected = await PickFolder(currentPath);
  return selected || currentPath;
}
