import { Router } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
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
    user: authService.getSession(req)?.user ?? null,
    ...extra,
  });
}

router.get("/login", (req, res) => renderLogin(req, res));

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
  const tipos = new Set(["ESCUELARURAL", "COMEDOR", "ESPACIOTUTORIA"]);
  const valid = values.razonSocial.length >= 3 && values.razonSocial.length <= 120
    && tipos.has(values.tipoEntidad) && /^[0-9-]{11,13}$/.test(values.cuit)
    && /^\d{11}$/.test(values.cuit.replace(/-/g, ""))
    && values.direccion.length >= 5 && values.direccion.length <= 200
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) && values.email.length <= 254
    && values.representanteNombre.length >= 2 && values.representanteNombre.length <= 80
    && values.representanteApellido.length >= 2 && values.representanteApellido.length <= 80;
  if (!valid) {
    return renderRegistration(req, res, { values, error: "Revisá los datos obligatorios del formulario." }, 422);
  }
  try {
    await donatrackService.createEntity(req, {
      tipoEntidad: values.tipoEntidad,
      direccion: values.direccion,
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
    return renderRegistration(req, res, { values, error: error.mensajeUsuario || "No pudimos registrar la entidad. Intentá nuevamente." }, formErrorStatus(error));
  }
});

router.post("/login", async (req, res) => {
  if (!hasValidFormToken(req, "login")) return renderLogin(req, res, { formErrors: { login: "La sesión del formulario venció. Recargá la página e intentá de nuevo." } }, 403);
  const identifier = field(req.body, "identifier");
  const password = String(req.body?.password ?? "");
  // Nunca se devuelve la contraseña a la vista.
  const values = { login: { identifier, remember: req.body?.remember ? "on" : "" } };

  if (identifier.length < 3 || !password) {
    return renderLogin(req, res, {
      values,
      formErrors: { login: "Completá el usuario (mínimo 3 caracteres) y la contraseña." },
    }, 400);
  }

  let user;
  try {
    user = await authService.login(req, {
      identifier,
      password,
      remember: Boolean(req.body?.remember),
    });
  } catch (error) {
    return renderLogin(req, res, { values, formErrors: { login: error.message } }, formErrorStatus(error));
  }

  req.flash({ type: "success", toast: "Inicio de sesión exitoso." });
  return res.redirect(getRoleRoute(user.role ?? user.rol));
});

router.get("/login/:provider", (req, res) => {
  try {
    return res.redirect(authService.getSocialLoginUrl(req.params.provider));
  } catch (error) {
    req.flash({ type: "error", toast: error.message });
    return res.redirect("/login");
  }
});

router.get("/auth/callback", async (req, res) => {
  try {
    const user = await authService.completeSocialLogin(req, {
      code: typeof req.query.code === "string" ? req.query.code : "",
      state: typeof req.query.state === "string" ? req.query.state : "",
    });
    req.flash({ type: "success", toast: "Inicio de sesión exitoso." });
    return res.redirect(getRoleRoute(user.role ?? user.rol));
  } catch (error) {
    return renderLogin(req, res, { authError: error.message }, formErrorStatus(error));
  }
});

router.post("/logout", async (req, res) => {
  await authService.logout(req);
  req.flash({ type: "success", toast: "Se cerró la sesión." });
  res.redirect("/");
});

export default router;
