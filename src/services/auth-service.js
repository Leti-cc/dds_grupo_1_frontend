import {
  AUTH_CALLBACK_PATH,
  AUTH_LOGIN_PATH,
  OAUTH_URLS,
  REMEMBER_SESSION_MS,
} from "../config.js";
import { apiRequest } from "./api-client.js";

export class AuthContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthContractError";
  }
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

async function saveSession(req, response, remember) {
  if (
    !response ||
    typeof response.accessToken !== "string" ||
    !response.accessToken ||
    !response.user ||
    typeof response.user !== "object" ||
    (typeof response.user.role !== "string" &&
      typeof response.user.rol !== "string")
  ) {
    throw new AuthContractError(
      "La respuesta de autenticación no tiene el formato esperado. Se necesitan accessToken y user.role.",
    );
  }

  // Nueva sesión al autenticarse para evitar fijación de sesión.
  await regenerateSession(req);
  req.session.accessToken = response.accessToken;
  req.session.user = response.user;
  if (remember) {
    req.session.cookie.maxAge = REMEMBER_SESSION_MS;
  }
  return response.user;
}

export const authService = {
  async login(req, { identifier, password, remember = false }) {
    const response = await apiRequest(req, "auth", AUTH_LOGIN_PATH, {
      method: "POST",
      body: { identifier: identifier.trim(), password },
    });

    return saveSession(req, response, remember);
  },

  async completeSocialLogin(req, { code, state, remember = false }) {
    if (!code || !state) {
      throw new AuthContractError("El retorno de SSO necesita un código y un estado.");
    }

    const response = await apiRequest(req, "auth", AUTH_CALLBACK_PATH, {
      method: "POST",
      body: { code, state },
    });
    return saveSession(req, response, remember);
  },

  getSocialLoginUrl(provider) {
    const authorizationUrl = Object.hasOwn(OAUTH_URLS, provider) ? OAUTH_URLS[provider] : "";
    if (!authorizationUrl) {
      throw new AuthContractError(
        `El inicio de sesión con ${provider} todavía no está configurado en el backend.`,
      );
    }
    return authorizationUrl;
  },

  getSession(req) {
    const { user, accessToken } = req.session ?? {};
    if (!user || !accessToken) {
      return null;
    }
    return { user, token: accessToken };
  },

  async logout(req) {
    await regenerateSession(req);
  },
};
