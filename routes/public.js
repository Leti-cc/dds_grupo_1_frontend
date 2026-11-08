import { Router } from "express";
import { loadSection, normalizeDelivery, readArray } from "../src/lib/page-data.js";
import { donatrackService } from "../src/services/donatrack-service.js";

const router = Router();

async function loadPublicPage(req) {
  const [donations, entities, deliveries] = await Promise.all([
    loadSection(() => donatrackService.getDonations(req), (value) => readArray(value, "donaciones")),
    loadSection(() => donatrackService.getEntities(req), (value) => readArray(value, "entidades")),
    loadSection(
      () => donatrackService.getDeliveries(req, { estado: "ENTREGADA" }),
      (value) => readArray(value, "entregas").map(normalizeDelivery),
    ),
  ]);
  return {
    metrics: {
      donations: donations.error ? "—" : donations.data.length,
      entities: entities.error ? "—" : entities.data.length,
      delivered: deliveries.error ? "—" : deliveries.data.length,
    },
    deliveries: deliveries.data?.slice(0, 3) ?? [],
    errors: {
      donations: donations.error,
      entities: entities.error,
      deliveries: deliveries.error,
    },
  };
}

async function loadTrackingPage(req) {
  const id = String(req.query.id ?? "").trim();
  if (!id) {
    return { queryId: "" };
  }
  const result = await loadSection(() => donatrackService.getDelivery(req, id));
  return {
    queryId: id,
    delivery: result.data ? normalizeDelivery(result.data) : null,
    error: result.error,
  };
}

router.get("/", async (req, res) => {
  res.render("public", await loadPublicPage(req));
});

// Compatibilidad con la ruta de la SPA anterior.
router.get("/inicio", (req, res) => res.redirect(301, "/"));

router.get("/seguimiento", async (req, res) => {
  res.render("tracking", { title: "Seguimiento", ...(await loadTrackingPage(req)) });
});

export default router;
