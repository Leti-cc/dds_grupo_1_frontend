import "dotenv/config";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { engine } from "express-handlebars";
import session from "express-session";
import { flash } from "./middleware/flash.js";
import { requireRole } from "./middleware/auth.js";
import { layoutLocals } from "./middleware/locals.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import donorRoutes from "./routes/donor.js";
import entityRoutes from "./routes/entity.js";
import logisticaRoutes from "./routes/logistica.js";
import publicRoutes from "./routes/public.js";
import { AUTH_DEV_BYPASS, PORT } from "./src/config.js";
import { helpers } from "./src/helpers/handlebars.js";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.engine(
  ".hbs",
  engine({
    extname: ".hbs",
    defaultLayout: "main",
    layoutsDir: path.join(rootDir, "views", "layouts"),
    partialsDir: path.join(rootDir, "views", "partials"),
    helpers,
  }),
);
app.set("view engine", ".hbs");
app.set("views", path.join(rootDir, "views"));
app.disable("x-powered-by");

app.use(express.static(path.join(rootDir, "public")));
app.use("/vendor/leaflet", express.static(path.join(rootDir, "node_modules", "leaflet", "dist")));
app.use(express.urlencoded({ extended: false }));

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = randomBytes(32).toString("hex");
  console.warn(
    "[server] Falta SESSION_SECRET en .env: se usa un secreto temporal y las sesiones se pierden al reiniciar.",
  );
}

// MemoryStore (el store por defecto) alcanza para desarrollo; en producción usar un store persistente.
app.use(
  session({
    name: "donatrack.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  }),
);
app.use(flash);
app.use(layoutLocals);

app.use(publicRoutes);
app.use(authRoutes);
app.use(donorRoutes);
app.use(entityRoutes);
app.use(adminRoutes);
app.use("/admin/logistica", requireRole("ADMIN"), logisticaRoutes);

// Igual que la SPA: una ruta desconocida vuelve al inicio.
app.use((req, res) => {
  res.redirect("/");
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error(`[server] Error en ${req.method} ${req.originalUrl}:`, error);
  res.status(500).render("error", {
    title: "Error",
    heading: "Algo salió mal",
    message: "No pudimos completar la acción. Volvé a intentarlo en unos minutos.",
  });
});

app.listen(PORT, () => {
  console.log(`DonaTrack frontend escuchando en http://localhost:${PORT}`);
  if (AUTH_DEV_BYPASS) {
    console.warn("[server] AUTH_DEV_BYPASS=true: requireRole(...) no controla roles. Solo para desarrollo.");
  }
});
