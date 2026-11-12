import { Readable } from "node:stream";

/**
 * Lee un multipart/form-data con la API web nativa de Node (sin dependencias extra) y devuelve un FormData.
 * El archivo queda entero en memoria: por eso cada ruta limita el tamaño antes de llamar a esta función.
 */
export function leerMultipart(req) {
  const request = new Request("http://localhost/upload", {
    method: "POST",
    headers: { "content-type": req.headers["content-type"] ?? "" },
    body: Readable.toWeb(req),
    duplex: "half",
  });
  return request.formData();
}
