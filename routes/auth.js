import { Router } from "express";
import { field, formErrorStatus, getRoleRoute } from "../src/lib/page-data.js";
import { authService } from "../src/services/auth-service.js";

const router = Router();

function renderLogin(req, res, extra = {}, status = 200) {
  res.status(status).render("login", {
    title: "Ingresar",
    user: authService.getSession(req)?.user ?? null,
    ...extra,
  });
}

router.get("/login", (req, res) => renderLogin(req, res));

router.post("/login", async (req, res) => {
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
