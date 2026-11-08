/**
 * Mensajes flash guardados en la sesión para el patrón Post/Redirect/Get.
 *
 * req.flash({ type: "success" | "error" | "info", toast?, form?, message? })
 *   - toast: texto que el layout muestra como toast al volver.
 *   - form + message: resultado que una vista muestra inline junto a ese formulario.
 * En el siguiente request queda disponible como res.locals.flash y se borra.
 */
export function flash(req, res, next) {
  req.flash = (message) => {
    req.session.flash = message;
  };

  if (req.session?.flash) {
    res.locals.flash = req.session.flash;
    delete req.session.flash;
  }

  next();
}
