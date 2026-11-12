import * as oidc from "openid-client";
import {
  KEYCLOAK_CLIENT_ID,
  KEYCLOAK_ISSUER,
  KEYCLOAK_REDIRECT_URI,
  KEYCLOAK_REGISTRATION_CLIENT_ID,
  KEYCLOAK_REGISTRATION_CLIENT_SECRET,
} from "../config.js";

const ALLOWED_ROLES = ["ADMIN", "ENTIDAD", "DONANTE"];
const KEYCLOAK_TIMEOUT_MS = 5000;
let configurationPromise;

export class RegistrationError extends Error {
  constructor(message) {
    super(message);
    this.name = "RegistrationError";
  }
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()));
  });
}

function issuerUrl() {
  return new URL(KEYCLOAK_ISSUER);
}

function realmName() {
  return issuerUrl().pathname.split("/").filter(Boolean).at(-1);
}

function oidcConfiguration() {
  if (!configurationPromise) {
    const issuer = issuerUrl();
    const localHttp = issuer.protocol === "http:"
      && ["localhost", "127.0.0.1"].includes(issuer.hostname);
    configurationPromise = oidc.discovery(
      issuer,
      KEYCLOAK_CLIENT_ID,
      undefined,
      oidc.None(),
      localHttp ? { execute: [oidc.allowInsecureRequests] } : undefined,
    );
  }
  return configurationPromise;
}

async function registrationAdminToken() {
  if (!KEYCLOAK_REGISTRATION_CLIENT_SECRET) {
    throw new RegistrationError("El registro de cuentas todavía no está configurado.");
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: KEYCLOAK_REGISTRATION_CLIENT_ID,
    client_secret: KEYCLOAK_REGISTRATION_CLIENT_SECRET,
  });
  const response = await fetch(`${KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(KEYCLOAK_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new RegistrationError("No pudimos conectar el registro con Keycloak.");
  }
  const tokens = await response.json();
  if (typeof tokens.access_token !== "string") {
    throw new RegistrationError("Keycloak no devolvió una credencial administrativa válida.");
  }
  return tokens.access_token;
}

function adminUrl(path) {
  return `${issuerUrl().origin}/admin/realms/${encodeURIComponent(realmName())}${path}`;
}

async function keycloakRequest(token, path, options = {}) {
  return fetch(adminUrl(path), {
    ...options,
    signal: AbortSignal.timeout(KEYCLOAK_TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
}

async function deleteKeycloakUser(token, userId) {
  const response = await keycloakRequest(token, `/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new RegistrationError("No se pudo eliminar la cuenta incompleta de Keycloak.");
  }
}

export function userFromClaims(claims) {
  const roles = Array.isArray(claims?.roles) ? claims.roles : [];
  const role = ALLOWED_ROLES.find((candidate) => roles.includes(candidate));
  if (!role) {
    throw new Error("La cuenta no tiene un rol habilitado en DonaTrack.");
  }
  return {
    id: claims.sub,
    username: claims.preferred_username,
    email: claims.email,
    nombre: claims.name,
    role,
  };
}

export const authService = {
  async startLogin(req) {
    const config = await oidcConfiguration();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const state = oidc.randomState();
    req.session.oidcLogin = { codeVerifier, state };

    return oidc.buildAuthorizationUrl(config, {
      redirect_uri: KEYCLOAK_REDIRECT_URI,
      scope: "openid profile email",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
    }).href;
  },

  async completeLogin(req, callbackUrl) {
    const pending = req.session?.oidcLogin;
    if (!pending) {
      throw new Error("No hay un inicio de sesión pendiente.");
    }
    const config = await oidcConfiguration();
    const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: pending.codeVerifier,
      expectedState: pending.state,
    });
    const user = userFromClaims(tokens.claims());

    await regenerateSession(req);
    req.session.accessToken = tokens.access_token;
    req.session.user = user;
    return user;
  },

  async registerEntityAccount({ email, password, firstName, lastName }) {
    const token = await registrationAdminToken();
    const response = await keycloakRequest(token, "/users", {
      method: "POST",
      body: JSON.stringify({
        username: email,
        email,
        firstName,
        lastName,
        enabled: true,
        emailVerified: false,
        credentials: [{ type: "password", value: password, temporary: false }],
      }),
    });
    if (response.status === 409) {
      throw new RegistrationError("Ya existe una cuenta con ese correo electrónico.");
    }
    if (response.status !== 201) {
      throw new RegistrationError("No pudimos crear la cuenta de acceso.");
    }

    const location = response.headers.get("location");
    const userId = location?.split("/").filter(Boolean).at(-1);
    if (!userId) {
      throw new RegistrationError("Keycloak no informó el identificador de la cuenta creada.");
    }

    try {
      const roleResponse = await keycloakRequest(token, "/roles/ENTIDAD");
      if (!roleResponse.ok) throw new Error("No se encontró el rol ENTIDAD");
      const role = await roleResponse.json();
      const assignment = await keycloakRequest(
        token,
        `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
        { method: "POST", body: JSON.stringify([role]) },
      );
      if (!assignment.ok) throw new Error("No se pudo asignar el rol ENTIDAD");
      return userId;
    } catch (error) {
      await deleteKeycloakUser(token, userId);
      throw new RegistrationError("La cuenta no pudo recibir el rol de entidad.");
    }
  },

  async deleteRegisteredAccount(userId) {
    const token = await registrationAdminToken();
    await deleteKeycloakUser(token, userId);
  },

  getSession(req) {
    const { user, accessToken } = req.session ?? {};
    return user && accessToken ? { user, token: accessToken } : null;
  },

  async logout(req) {
    await destroySession(req);
  },
};
