import { randomBytes, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { field, formErrorStatus, getRoleRoute } from "../src/lib/page-data.js";
import { authService } from "../src/services/auth-service.js";
import { donatrackService } from "../src/services/donatrack-service.js";

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
    ...extra,
  });
}

router.get("/login", (req, res) => renderLogin(req, res));

router.get("/auth/start", async (req, res) => {
  try {
    return res.redirect(await authService.startLogin(req));
  } catch (error) {
    return renderLogin(req, res, { authError: error.message }, 503);
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
    return res.redirect(await authService.startLogin(req));
  } catch (error) {
    return renderLogin(req, res, { authError: error.message }, 503);
  }
});

router.get("/auth/callback", async (req, res) => {
  try {
    const redirectUri = new URL(process.env.KEYCLOAK_REDIRECT_URI || "http://localhost:3000/auth/callback");
    const user = await authService.completeLogin(req, new URL(req.originalUrl, redirectUri.origin));
    if (user.role === "ENTIDAD") {
      const entity = await donatrackService.getEntityByIdentity(req, user.id);
      req.session.user.entidadId = entity.id;
    }
    return res.redirect(getRoleRoute(user.role));
  } catch (error) {
    console.error("[auth] Callback OIDC rechazado:", error.message);
    if (req.session) {
      delete req.session.accessToken;
      delete req.session.user;
      delete req.session.oidcLogin;
    }
    return renderLogin(req, res, { authError: "No pudimos validar el inicio de sesión." }, 401);
  }
});

router.post("/logout", async (req, res) => {
  await authService.logout(req);
  res.redirect("/");
});

export default router;
