type ClipboardLike = { files?: FileList | File[] | null; getData?: (format: string) => string } | null | undefined;

/** The first picture in a paste or drop, if any. */
export const firstImage = (files: FileList | File[] | null | undefined) => [...(files ?? [])].find((file) => file.type.startsWith("image/")) ?? null;

/**
 * The picture a paste should demo from, or null to let the text paste through.
 * Excel, Word and Numbers put a rendered picture next to copied text; text wins.
 */
export function pastedPicture(clipboard: ClipboardLike): File | null {
  if (clipboard?.getData?.("text/plain").trim()) return null;
  return firstImage(clipboard?.files);
}
