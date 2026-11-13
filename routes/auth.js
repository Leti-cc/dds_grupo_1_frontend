import { randomBytes, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { KEYCLOAK_REDIRECT_URI, SOCIAL_LOGIN_PROVIDERS, SOCIAL_PROVIDER_NAMES } from "../src/config.js";
import { field, formErrorStatus, getRoleRoute } from "../src/lib/page-data.js";
import { authService, incentivosUsernameFor } from "../src/services/auth-service.js";
import { donatrackService } from "../src/services/donatrack-service.js";

const SOCIAL_PROVIDERS = SOCIAL_LOGIN_PROVIDERS.map((alias) => ({ alias, name: SOCIAL_PROVIDER_NAMES[alias] }));

const router = Router();

function formToken(req, key) {
  req.session.formTokens ??= {};
  req.session.formTokens[key] ??= randomBytes(32).toString("hex");
  return req.session.formTokens[key];
}

function hasValidFormToken(req, key) {
  const expected = req.session?.formTokens?.[key];
  const received = req.body?._csrf;
  if (typeof expected !== "string" || typeof received !== "string" || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function renderLogin(req, res, extra = {}, status = 200) {
  res.status(status).render("login", {
    title: "Ingresar",
    authPage: true,
    csrfToken: formToken(req, "login"),
    socialProviders: SOCIAL_PROVIDERS,
    ...extra,
  });
}

const KEYCLOAK_UNAVAILABLE = "El servicio de autenticación no está disponible. Intentá de nuevo en unos minutos.";

router.get("/login", (req, res) => renderLogin(req, res));

// ?provider=google|github inicia el social login; sin proveedor se muestra el formulario de Keycloak.
router.get("/auth/start", async (req, res) => {
  try {
    return res.redirect(await authService.startLogin(req, { provider: req.query.provider }));
  } catch (error) {
    console.error("[auth] No se pudo iniciar el login OIDC:", error.message);
    return renderLogin(req, res, { authError: KEYCLOAK_UNAVAILABLE }, 503);
  }
});

function renderRegistration(req, res, extra = {}, status = 200) {
  res.status(status).render("register", { title: "Registrar entidad", authPage: true, csrfToken: formToken(req, "register"), ...extra });
}

router.get("/registro", (req, res) => renderRegistration(req, res));

router.post("/registro", async (req, res) => {
  if (!hasValidFormToken(req, "register")) return renderRegistration(req, res, { error: "La sesión del formulario venció. Recargá la página e intentá de nuevo." }, 403);
  const values = {
    razonSocial: field(req.body, "razonSocial"),
    tipoEntidad: field(req.body, "tipoEntidad"),
    cuit: field(req.body, "cuit"),
    direccion: field(req.body, "direccion"),
    email: field(req.body, "email"),
    representanteNombre: field(req.body, "representanteNombre"),
    representanteApellido: field(req.body, "representanteApellido"),
  };
  const password = String(req.body?.password ?? "");
  const passwordConfirmation = String(req.body?.passwordConfirmation ?? "");
  const tipos = new Set(["ESCUELARURAL", "COMEDOR", "ESPACIOTUTORIA"]);
  const valid = values.razonSocial.length >= 3 && values.razonSocial.length <= 120
    && tipos.has(values.tipoEntidad) && /^[0-9-]{11,13}$/.test(values.cuit)
    && /^\d{11}$/.test(values.cuit.replace(/-/g, ""))
    && values.direccion.length >= 5 && values.direccion.length <= 200
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) && values.email.length <= 254
    && values.representanteNombre.length >= 2 && values.representanteNombre.length <= 80
    && values.representanteApellido.length >= 2 && values.representanteApellido.length <= 80
    && password.length >= 8 && password.length <= 128
    && password === passwordConfirmation;
  if (!valid) {
    const error = password !== passwordConfirmation
      ? "Las contraseñas no coinciden."
      : "Revisá los datos obligatorios del formulario.";
    return renderRegistration(req, res, { values, error }, 422);
  }

  let keycloakUserId;
  try {
    keycloakUserId = await authService.registerEntityAccount({
      email: values.email,
      password,
      firstName: values.representanteNombre,
      lastName: values.representanteApellido,
    });
    await donatrackService.createEntity(req, {
      tipoEntidad: values.tipoEntidad,
      direccion: values.direccion,
      keycloakUserId,
      organizacion: {
        razonSocial: values.razonSocial,
        cuit: values.cuit.replace(/\D/g, ""),
        representantes: [{
          nombre: values.representanteNombre,
          apellido: values.representanteApellido,
          contacto: { medio: "MAIL", valor: values.email },
        }],
      },
    });
    delete req.session.formTokens.register;
    return renderRegistration(req, res, { registered: true });
  } catch (error) {
    if (keycloakUserId) {
      try {
        await authService.deleteRegisteredAccount(keycloakUserId);
      } catch (cleanupError) {
        console.error("[auth] No se pudo compensar la cuenta de registro:", cleanupError.message);
      }
    }
    return renderRegistration(req, res, { values, error: error.mensajeUsuario || "No pudimos registrar la entidad. Intentá nuevamente." }, formErrorStatus(error));
  }
});

router.post("/login", async (req, res) => {
  if (!hasValidFormToken(req, "login")) {
    return renderLogin(req, res, { authError: "La sesión del formulario venció. Recargá la página e intentá de nuevo." }, 403);
  }
  try {
    return res.redirect(await authService.startLogin(req, { provider: field(req.body, "provider") }));
  } catch (error) {
    console.error("[auth] No se pudo iniciar el login OIDC:", error.message);
    return renderLogin(req, res, { authError: KEYCLOAK_UNAVAILABLE }, 503);
  }
});

class LinkError extends Error {}

/**
 * Asocia la cuenta de Keycloak con su registro en el Servicio de Donaciones. Las rutas de entidad y de
 * donante leen entidadId/donanteId de la sesión, así que sin este paso no ven sus datos.
 */
async function linkDomainAccount(req, user) {
  if (user.role === "ENTIDAD") {
    try {
      const entity = await donatrackService.getEntityByIdentity(req, user.id);
      req.session.user.entidadId = entity.id;
    } catch (error) {
      if (error.status === 404) {
        throw new LinkError("Tu cuenta no está asociada a ninguna entidad beneficiaria. Contactá a la administración.");
      }
      throw error;
    }
  } else if (user.role === "DONANTE") {
    try {
      const donor = await donatrackService.getDonorByIdentity(req, user.id);
      req.session.user.donanteId = donor.id;
      req.session.user.incentivosUsuario = incentivosUsernameFor(donor);
    } catch (error) {
      // Un donante nuevo por social login todavía no tiene registro: entra igual y las secciones lo avisan.
      if (error.status !== 404) throw error;
      req.flash?.({ type: "info", toast: "Tu cuenta todavía no tiene donaciones registradas en DonaTrack." });
    }
  }
}

router.get("/auth/callback", async (req, res) => {
  let user;
  try {
    user = await authService.completeLogin(req, new URL(req.originalUrl, new URL(KEYCLOAK_REDIRECT_URI).origin));
  } catch (error) {
    console.error("[auth] Callback OIDC rechazado:", error.message);
    for (const key of ["accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "user", "oidcLogin"]) {
      delete req.session?.[key];
    }
    const authError = /rol habilitado/.test(error.message)
      ? "Tu cuenta no tiene un perfil habilitado en DonaTrack. Contactá a la administración."
      : "No pudimos validar el inicio de sesión. Intentá de nuevo.";
    return renderLogin(req, res, { authError }, 401);
  }

  try {
    await linkDomainAccount(req, user);
    return res.redirect(getRoleRoute(user.role));
  } catch (error) {
    console.error("[auth] No se pudo vincular la cuenta con Donaciones:", error.message);
    const logoutUrl = await authService.logout(req);
    const authError = error instanceof LinkError
      ? error.message
      : "No pudimos cargar los datos de tu cuenta. Verificá que el Servicio de Donaciones esté iniciado.";
    // La sesión local se destruyó; se muestra el error sin redirigir para no perder el mensaje.
    return res.status(error instanceof LinkError ? 403 : 503).render("login", {
      title: "Ingresar",
      authPage: true,
      socialProviders: SOCIAL_PROVIDERS,
      authError,
      ssoLogoutUrl: logoutUrl === "/" ? undefined : logoutUrl,
    });
  }
});

router.post("/logout", async (req, res) => {
  const redirectTo = await authService.logout(req);
  res.clearCookie("donatrack.sid");
  res.redirect(redirectTo);
});

export default router;
