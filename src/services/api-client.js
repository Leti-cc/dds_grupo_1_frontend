import { API_TIMEOUT_MS, API_URLS } from "../config.js";

export class ApiError extends Error {
  constructor(message, { status = 0, data = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export function parseResponseBody(text, contentType = "") {
  if (!text) {
    return null;
  }

  if (contentType.startsWith("text/")) {
    return text;
  }

  // JSON declarado o content-type ausente: se intenta JSON y, si no parsea, texto.
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getErrorMessage(data, statusText) {
  if (typeof data === "string" && data.trim()) {
    return data;
  }

  if (data && typeof data === "object") {
    return data.message ?? data.detail ?? data.error ?? statusText;
  }

  return statusText || "No se pudo completar la solicitud.";
}

/**
 * Llama a una API REST desde el servidor del front.
 * El token sale de la sesión del servidor (req.session.accessToken) y nunca llega al navegador.
 */
export async function apiRequest(
  req,
  service,
  path,
  { method = "GET", body, form, headers = {}, timeoutMs = API_TIMEOUT_MS } = {},
) {
  const baseUrl = API_URLS[service];
  if (!baseUrl) {
    throw new ApiError(`No hay una URL configurada para el servicio ${service}.`);
  }

  const normalizedPath = `/${String(path).replace(/^\/+/, "")}`;
  const url = `${baseUrl.replace(/\/+$/, "")}${normalizedPath}`;
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json, text/plain");

  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }
  if (form !== undefined) {
    requestHeaders.delete("Content-Type");
  }

  const token = req?.session?.accessToken;
  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(form !== undefined ? { body: form } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
    console.error(`[api] ${method} ${url} falló: ${error.cause?.code ?? error.name} ${error.message}`);
    throw new ApiError(
      timedOut
        ? `El servicio de ${service} no respondió a tiempo. Reintentá en unos segundos.`
        : `No se pudo conectar con ${service}. Verificá que el servicio esté iniciado y su URL configurada.`,
      { data: error },
    );
  }

  const data = parseResponseBody(
    await response.text(),
    response.headers.get("content-type") ?? "",
  );
  if (!response.ok) {
    console.error(
      `[api] ${method} ${url} respondió ${response.status}:`,
      typeof data === "string" ? data : JSON.stringify(data),
    );
    throw new ApiError(getErrorMessage(data, response.statusText), {
      status: response.status,
      data,
    });
  }

  return data;
}
