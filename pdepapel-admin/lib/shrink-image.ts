/**
 * Reduce una foto antes de subirla como comprobante.
 *
 * Una captura del banco pesa poco, pero una foto tomada con la cámara del
 * celular pasa fácil de 5 MB y el servidor acepta hasta 4. Se re-encoda en
 * el navegador a un lado máximo de 1600 px, que sobra para leer un número de
 * transacción. Si el navegador no puede (sin canvas, formato que no decodifica)
 * se devuelve el archivo tal cual y el servidor decide.
 */
export async function shrinkImageForUpload(
  file: File,
  { maxEdge = 1600, quality = 0.85, minBytes = 1_000_000 } = {},
): Promise<File> {
  if (
    typeof createImageBitmap !== "function" ||
    typeof document === "undefined"
  ) {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= maxEdge && file.size <= minBytes) {
      bitmap.close();
      return file;
    }
    const scale = Math.min(1, maxEdge / longest);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[a-z0-9]+$/i, "") || "comprobante";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
