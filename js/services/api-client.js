import { ACCESS_TOKEN_KEY, API_URLS } from "../config.js";

export class ApiError extends Error {
  constructor(message, { status = 0, data = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function getAccessToken() {
  return (
    window.sessionStorage.getItem(ACCESS_TOKEN_KEY) ??
    window.localStorage.getItem(ACCESS_TOKEN_KEY)
  );
}

function readResponseBody(text) {
  if (!text) {
    return null;
  }

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

export async function apiRequest(
  service,
  path,
  { method = "GET", body, form, headers = {}, signal } = {},
) {
  const baseUrl = API_URLS[service];
  if (!baseUrl) {
    throw new ApiError(`No hay una URL configurada para el servicio ${service}.`);
  }

  const normalizedPath = `/${String(path).replace(/^\/+/, "")}`;
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json, text/plain");

  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }
  if (form !== undefined) {
    requestHeaders.delete("Content-Type");
  }

  const token = getAccessToken();
  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  let response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, "")}${normalizedPath}`, {
      method,
      headers: requestHeaders,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(form !== undefined ? { body: form } : {}),
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw error;
    }

    throw new ApiError(
      `No se pudo conectar con ${service}. Verificá que el servicio esté iniciado y su URL configurada.`,
      { data: error },
    );
  }

  const data = readResponseBody(await response.text());
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, response.statusText), {
      status: response.status,
      data,
    });
  }

  return data;
}
