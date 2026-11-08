import { Router } from "express";
import { ROLE_ALIASES, userHasRole } from "../middleware/auth.js";
import { field, formErrorStatus, loadSection, readArray } from "../src/lib/page-data.js";
import { authService } from "../src/services/auth-service.js";
import { donatrackService } from "../src/services/donatrack-service.js";

const router = Router();

function isEntitySession(session) {
  return Boolean(session) && userHasRole(session.user, ROLE_ALIASES.ENTIDAD);
}

async function loadEntityPage(req, requestedId) {
  const session = authService.getSession(req);
  if (!isEntitySession(session)) {
    return {
      entityId: "",
      requiresAuth: true,
      authMessage: session
        ? "Tu cuenta no tiene el perfil de entidad beneficiaria."
        : "Iniciá sesión como entidad para consultar sus necesidades.",
    };
  }
  const id = requestedId || session?.user?.entidadId || "";
  if (!id) {
    return { entityId: "" };
  }
  const entityId = Number(id);
  if (!Number.isSafeInteger(entityId) || entityId < 1) {
    return { entityId: "", errors: { needs: "El ID de entidad debe ser un número entero positivo." } };
  }

  const [needs, entities, subcategories] = await Promise.all([
    loadSection(
      () => donatrackService.getNeeds(req, { entidadId: entityId }),
      (value) => readArray(value, "necesidades"),
    ),
    loadSection(
      () => donatrackService.getEntities(req),
      (value) => readArray(value, "entidades"),
    ),
    loadSection(
      () => donatrackService.getSubcategories(req),
      (value) => readArray(value, "subcategorías"),
    ),
  ]);
  const entity = entities.data?.find((item) => Number(item.id) === entityId);
  return {
    entityId,
    entityName: entity?.razonSocial ?? `Entidad #${entityId}`,
    entityAddress: entity?.direccion ?? "Dirección no informada",
    needs: needs.data ?? [],
    subcategories: subcategories.data ?? [],
    errors: {
      needs: needs.error,
      entities: entities.error,
      subcategories: subcategories.error,
    },
  };
}

/** Arma el body de la necesidad igual que lo hacía la SPA y valida lo mismo que el HTML5. */
function buildNeed(body) {
  const type = field(body, "tipo") === "EXTRAORDINARIA" ? "EXTRAORDINARIA" : "RECURRENTE";
  const descripcion = field(body, "descripcion");
  const need = {
    entidadId: Number(field(body, "entidadId")),
    subcategoriaId: Number(field(body, "subcategoriaId")),
    descripcion,
    cantidad: Number(field(body, "cantidad")),
    tipo: type,
  };
  const errors = [];
  if (!Number.isSafeInteger(need.entidadId) || need.entidadId < 1) errors.push("la entidad no es válida");
  if (!field(body, "subcategoriaId")) errors.push("elegí una subcategoría");
  if (!descripcion) errors.push("completá la descripción");
  if (descripcion.length > 250) errors.push("la descripción admite hasta 250 caracteres");
  if (!Number.isInteger(need.cantidad) || need.cantidad < 1) errors.push("la cantidad debe ser un número mayor o igual a 1");

  if (type === "RECURRENTE") {
    need.tipoPeriodo = field(body, "tipoPeriodo");
    need.frecuencia = Number(field(body, "frecuencia"));
    if (!Number.isInteger(need.frecuencia) || need.frecuencia < 1) errors.push("la frecuencia debe ser un número mayor o igual a 1");
  } else {
    need.motivo = field(body, "motivo");
    if (!need.motivo) errors.push("completá el motivo");
    if (need.motivo.length > 250) errors.push("el motivo admite hasta 250 caracteres");
  }
  return { need, error: errors.length ? `Revisá los datos: ${errors.join(", ")}.` : null };
}

router.get("/entidad", async (req, res) => {
  const id = String(req.query.id ?? "").trim();
  res.render("entity", { title: "Entidad", ...(await loadEntityPage(req, id)) });
});

router.post("/entidad/necesidades", async (req, res) => {
  const entityId = field(req.body, "entidadId");
  const renderWithError = async (status, message) => {
    res.status(status).render("entity", {
      title: "Entidad",
      ...(await loadEntityPage(req, entityId)),
      formErrors: { need: message },
      values: { need: req.body },
    });
  };

  if (!isEntitySession(authService.getSession(req))) {
    return renderWithError(403, "Iniciá sesión como entidad para registrar necesidades.");
  }

  const { need, error } = buildNeed(req.body);
  if (error) {
    return renderWithError(400, error);
  }

  try {
    await donatrackService.createNeed(req, need);
  } catch (apiError) {
    return renderWithError(formErrorStatus(apiError), apiError.message);
  }

  req.flash({ type: "success", toast: "Necesidad registrada." });
  return res.redirect(`/entidad?id=${encodeURIComponent(need.entidadId)}`);
});

export default router;
