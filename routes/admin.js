import { Readable } from "node:stream";
import { Router } from "express";
import { ROLE_ALIASES, userHasRole } from "../middleware/auth.js";
import { field, formErrorStatus, loadSection, readArray } from "../src/lib/page-data.js";
import { authService } from "../src/services/auth-service.js";
import { donatrackService } from "../src/services/donatrack-service.js";

const router = Router();
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const PERIODO_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;

function isAdminSession(session) {
  return Boolean(session) && userHasRole(session.user, ROLE_ALIASES.ADMIN);
}

async function loadAdminPage(req) {
  const session = authService.getSession(req);
  if (!isAdminSession(session)) {
    return {
      requiresAuth: true,
      canManage: false,
      authMessage: session
        ? "Tu cuenta no tiene permisos de administración."
        : "Iniciá sesión con un perfil de administración para consultar el panel.",
      donations: [],
      donors: [],
      trucks: [],
      notifications: [],
      subcategories: [],
      ranking: null,
      rankingPeriods: [],
      rankingPeriod: "ultimo",
      metrics: { donations: "—", donors: "—", trucks: "—", pending: "—" },
    };
  }

  const requestedPeriod = field(req.query, "periodo");
  const rankingPeriod = PERIODO_VALIDO.test(requestedPeriod) ? requestedPeriod : "ultimo";
  const [donations, donors, trucks, pendingDeliveries, subcategories, notifications, rankingPeriods, ranking] = await Promise.all([
    loadSection(
      () => donatrackService.getDonations(req),
      (value) => readArray(value, "donaciones"),
    ),
    loadSection(
      () => donatrackService.getDonors(req),
      (value) => readArray(value, "donantes"),
    ),
    loadSection(
      () => donatrackService.getTrucks(req),
      (value) => readArray(value, "camiones"),
    ),
    loadSection(
      () => donatrackService.getDeliveries(req, { estado: "PENDIENTE" }),
      (value) => readArray(value, "entregas pendientes"),
    ),
    loadSection(
      () => donatrackService.getSubcategories(req),
      (value) => readArray(value, "subcategorías"),
    ),
    loadSection(
      () => donatrackService.getNotifications(req),
      (value) => readArray(value, "notificaciones"),
    ),
    loadSection(
      () => donatrackService.getRankingPeriods(req),
      (value) => readArray(value, "períodos de ranking"),
    ),
    loadSection(() => donatrackService.getDonorRanking(req, rankingPeriod)),
  ]);
  const donorList = donors.data ?? [];
  return {
    donations: donations.data ?? [],
    canManage: true,
    donors: donorList.map((donor) => ({
      ...donor,
      donorLabel:
        donor.tipo === "JURIDICA"
          ? `${donor.razonSocial} · #${donor.id}`
          : `${donor.nombre ?? ""} ${donor.apellido ?? ""} · #${donor.id}`,
    })),
    trucks: trucks.data ?? [],
    notifications: notifications.data ?? [],
    subcategories: subcategories.data ?? [],
    ranking: ranking.data ?? null,
    rankingPeriod,
    rankingPeriods: rankingPeriods.data ?? [],
    metrics: {
      donations: donations.error ? "—" : donations.data.length,
      donors: donors.error ? "—" : donors.data.length,
      trucks: trucks.error ? "—" : trucks.data.filter((truck) => truck.activo).length,
      pending: pendingDeliveries.error ? "—" : pendingDeliveries.data.length,
    },
    errors: {
      donations: donations.error,
      donors: donors.error,
      trucks: trucks.error,
      deliveries: pendingDeliveries.error,
      subcategories: subcategories.error,
      notifications: notifications.error,
      rankingPeriods: rankingPeriods.error,
      ranking: ranking.error,
    },
  };
}

function validationMessage(errors) {
  return errors.length ? `Revisá los datos: ${errors.join(", ")}.` : null;
}

function buildDonation(body) {
  const nombre = field(body, "nombre");
  const descripcion = field(body, "descripcion");
  const item = {
    nombre,
    descripcion: nombre,
    subcategoriaId: Number(field(body, "subcategoriaId")),
    cantidad: Number(field(body, "cantidad")),
    unidad: field(body, "unidad"),
    cantidadBien: 1,
  };
  if (field(body, "fechaVencimiento")) {
    item.fechaVencimiento = field(body, "fechaVencimiento");
  }
  const donation = {
    donanteId: Number(field(body, "donanteId")),
    descripcion,
    items: [item],
  };

  const errors = [];
  if (!field(body, "donanteId")) errors.push("elegí un donante");
  if (!descripcion) errors.push("completá la descripción");
  if (descripcion.length > 250) errors.push("la descripción admite hasta 250 caracteres");
  if (!field(body, "subcategoriaId")) errors.push("elegí una subcategoría");
  if (!nombre) errors.push("completá el nombre del bien");
  if (nombre.length > 100) errors.push("el nombre del bien admite hasta 100 caracteres");
  if (!Number.isInteger(item.cantidad) || item.cantidad < 1) errors.push("la cantidad debe ser un número mayor o igual a 1");
  return { donation, error: validationMessage(errors) };
}

function buildDonor(body) {
  const type = field(body, "tipo") === "JURIDICA" ? "JURIDICA" : "HUMANA";
  const email = field(body, "email");
  const contrasenaTemporal = field(body, "contrasenaTemporal");
  const confirmarContrasena = field(body, "confirmarContrasena");
  const errors = [];
  if (!email) errors.push("completá el correo de contacto");
  else if (!/^[^\s@]+@[^\s@]+$/.test(email)) errors.push("el correo no es válido");
  if (contrasenaTemporal.length < 8) errors.push("la contraseña temporal debe tener al menos 8 caracteres");
  if (contrasenaTemporal !== confirmarContrasena) errors.push("las contraseñas temporales no coinciden");

  if (type === "HUMANA") {
    const required = { nombre: "el nombre", apellido: "el apellido", dni: "el DNI", edad: "la edad", direccion: "la dirección" };
    for (const [name, label] of Object.entries(required)) {
      if (!field(body, name)) errors.push(`completá ${label}`);
    }
    const edad = Number(field(body, "edad"));
    if (field(body, "edad") && (!Number.isFinite(edad) || edad < 0)) errors.push("la edad no puede ser negativa");
    return {
      donor: {
        tipo: "HUMANA",
        tipoUsuario: "PERSONA",
        nombre: field(body, "nombre"),
        apellido: field(body, "apellido"),
        dni: field(body, "dni"),
        edad,
        genero: field(body, "genero") || null,
        direccion: field(body, "direccion"),
        contactoPredeterminado: { medio: "MAIL", valor: email },
        contrasenaTemporal,
      },
      error: validationMessage(errors),
    };
  }

  const required = { razonSocial: "la razón social", cuit: "el CUIT", rubro: "el rubro" };
  for (const [name, label] of Object.entries(required)) {
    if (!field(body, name)) errors.push(`completá ${label}`);
  }
  return {
    donor: {
      tipo: "JURIDICA",
      tipoUsuario: "ORGANIZACION",
      tipoPersonaJuridica: "EMPRESA",
      razonSocial: field(body, "razonSocial"),
      cuit: field(body, "cuit"),
      rubro: field(body, "rubro"),
      contactoPredeterminado: { medio: "MAIL", valor: email },
      contrasenaTemporal,
    },
    error: validationMessage(errors),
  };
}

/** Parsea multipart/form-data con la API web nativa de Node (sin dependencias extra). */
function readMultipart(req) {
  const request = new Request("http://localhost/upload", {
    method: "POST",
    headers: { "content-type": req.headers["content-type"] ?? "" },
    body: Readable.toWeb(req),
    duplex: "half",
  });
  return request.formData();
}

function renderAdminWithError(req, res, form, status, message, values = req.body) {
  return loadAdminPage(req).then((data) =>
    res.status(status).render("admin", {
      title: "Administración",
      ...data,
      formErrors: { [form]: message },
      values: { [form]: values ?? {} },
    }),
  );
}

router.get("/administracion", async (req, res) => {
  res.render("admin", { title: "Administración", ...(await loadAdminPage(req)) });
});

router.post("/administracion/donaciones", async (req, res) => {
  if (!isAdminSession(authService.getSession(req))) {
    return renderAdminWithError(req, res, "donation", 403, "Esta acción requiere una sesión con perfil de administración.");
  }
  const { donation, error } = buildDonation(req.body);
  if (error) {
    return renderAdminWithError(req, res, "donation", 400, error);
  }
  try {
    await donatrackService.createDonation(req, donation);
  } catch (apiError) {
    return renderAdminWithError(req, res, "donation", formErrorStatus(apiError), apiError.message);
  }
  req.flash({ type: "success", toast: "Donación registrada." });
  return res.redirect("/administracion");
});

router.post("/administracion/donantes", async (req, res) => {
  if (!isAdminSession(authService.getSession(req))) {
    return renderAdminWithError(req, res, "donor", 403, "Esta acción requiere una sesión con perfil de administración.");
  }
  const { donor, error } = buildDonor(req.body);
  if (error) {
    return renderAdminWithError(req, res, "donor", 400, error);
  }
  try {
    await donatrackService.createDonor(req, donor);
  } catch (apiError) {
    return renderAdminWithError(req, res, "donor", formErrorStatus(apiError), apiError.message);
  }
  req.flash({ type: "success", toast: "Donante registrado." });
  return res.redirect("/administracion");
});

router.post("/administracion/donantes/importacion", async (req, res) => {
  if (!isAdminSession(authService.getSession(req))) {
    return renderAdminWithError(req, res, "import", 403, "Esta acción requiere una sesión con perfil de administración.", {});
  }
  if (Number(req.headers["content-length"] ?? 0) > MAX_IMPORT_BYTES) {
    return renderAdminWithError(req, res, "import", 413, "El archivo supera el máximo de 5 MB.", {});
  }

  let file;
  try {
    file = (await readMultipart(req)).get("file");
  } catch (parseError) {
    console.error("[admin] No se pudo leer el archivo de importación:", parseError.message);
  }
  if (!file || typeof file === "string" || file.size === 0) {
    return renderAdminWithError(req, res, "import", 400, "Elegí un archivo CSV para importar.", {});
  }

  let response;
  try {
    response = await donatrackService.importDonors(req, file);
  } catch (apiError) {
    return renderAdminWithError(req, res, "import", formErrorStatus(apiError), apiError.message, {});
  }

  const hasErrors = Boolean(response?.errores?.length);
  req.flash({
    type: hasErrors ? "error" : "success",
    toast: "La importación terminó.",
    form: "import",
    message: `Importación finalizada: ${response?.totalProcesados} procesados, ${response?.creados} creados y ${response?.actualizados} actualizados.${hasErrors ? ` Errores: ${response.errores.length}.` : ""}`,
  });
  return res.redirect("/administracion");
});

export default router;
