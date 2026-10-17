/** Shrinks a picture to at most 1600px JPEG in the browser so uploads stay small on phones. */
export async function pictureDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a picture (PNG, JPEG or WebP).");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Couldn't open that picture. Try a PNG or JPEG screenshot.");
  });
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}
