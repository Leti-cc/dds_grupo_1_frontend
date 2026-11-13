import { Router } from "express";
import { loadSection, normalizeDelivery } from "../src/lib/page-data.js";
import { donatrackService } from "../src/services/donatrack-service.js";

const router = Router();

const visitorData = {
  stats: { donations: 128, entities: 18, people: 6340, food: 24800, clothes: 1250 },
  deliveries: [
    { id: "demo-1", name: "Comedor Esperanza", description: "Alimentos no perecederos", date: "2026-05-12T15:00:00", displayDate: "12/05/2026", quantity: 24, donor: "Ana Pérez", photo: "/images/visitante/donacion2.jpeg", type: "food", lat: -34.5895, lng: -58.3997 },
    { id: "demo-2", name: "Hogar Los Peques", description: "Ropa de abrigo", date: "2026-05-10T11:30:00", displayDate: "10/05/2026", quantity: 32, donor: "Red de donantes", photo: "/images/visitante/donacion4.jpeg", type: "clothes", lat: -34.6083, lng: -58.4216 },
    { id: "demo-3", name: "Escuela Rural N°10", description: "Mobiliario escolar", date: "2026-05-08T10:15:00", displayDate: "08/05/2026", quantity: 12, donor: "Empresa colaboradora", photo: "/images/visitante/entrega-caja.png", type: "entity", lat: -34.6192, lng: -58.4414 },
    { id: "demo-4", name: "Centro Comunitario Belgrano", description: "Alimentos no perecederos", date: "2026-05-07T14:20:00", displayDate: "07/05/2026", quantity: 18, donor: "Red de donantes", photo: "/images/visitante/donacion3.jpeg", type: "food", lat: -34.5627, lng: -58.4551 },
    { id: "demo-5", name: "Hogar Saavedra", description: "Ropa de abrigo", date: "2026-05-07T10:00:00", displayDate: "07/05/2026", quantity: 26, donor: "Ana Pérez", photo: "/images/visitante/donacion9.jpeg", type: "clothes", lat: -34.5536, lng: -58.4927 },
    { id: "demo-6", name: "Comedor Villa Urquiza", description: "Alimentos no perecederos", date: "2026-05-06T12:45:00", displayDate: "06/05/2026", quantity: 40, donor: "Empresa colaboradora", photo: "/images/visitante/donacion5.jpeg", type: "food", lat: -34.5735, lng: -58.4881 },
    { id: "demo-7", name: "Espacio Comunitario Flores", description: "Mobiliario escolar", date: "2026-05-06T09:30:00", displayDate: "06/05/2026", quantity: 14, donor: "Red de donantes", photo: "/images/visitante/entrega-caja.png", type: "entity", lat: -34.6317, lng: -58.4633 },
    { id: "demo-8", name: "Comedor Barracas", description: "Alimentos no perecederos", date: "2026-05-05T13:15:00", displayDate: "05/05/2026", quantity: 35, donor: "Ana Pérez", photo: "/images/visitante/donacion8.jpeg", type: "food", lat: -34.6443, lng: -58.3824 },
    { id: "demo-9", name: "Hogar La Boca", description: "Ropa de abrigo", date: "2026-05-04T16:00:00", displayDate: "04/05/2026", quantity: 21, donor: "Empresa colaboradora", photo: "/images/visitante/ropa.png", type: "clothes", lat: -34.6359, lng: -58.3636 },
    { id: "demo-10", name: "Centro Solidario San Telmo", description: "Alimentos no perecederos", date: "2026-05-04T11:10:00", displayDate: "04/05/2026", quantity: 28, donor: "Red de donantes", photo: "/images/visitante/alimentos.png", type: "food", lat: -34.6191, lng: -58.3731 },
    { id: "demo-11", name: "Comedor Mataderos", description: "Alimentos no perecederos", date: "2026-05-03T14:40:00", displayDate: "03/05/2026", quantity: 31, donor: "Ana Pérez", photo: "/images/visitante/alimentos.png", type: "food", lat: -34.6587, lng: -58.5032 },
    { id: "demo-12", name: "Hogar Villa Lugano", description: "Ropa de abrigo", date: "2026-05-02T10:25:00", displayDate: "02/05/2026", quantity: 17, donor: "Red de donantes", photo: "/images/visitante/ropa.png", type: "clothes", lat: -34.6735, lng: -58.4775 },
  ],
};

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
  res.render("public", { title: "Inicio", leaflet: true, publicPage: true });
});

router.get("/inicio/datos", async (req, res) => {
  res.json(visitorData);
});

router.get("/galeria", async (req, res) => {
  const destinationsByPhoto = ["demo-7", "demo-1", "demo-4", "demo-2", "demo-6", "demo-8", "demo-3", "demo-10", "demo-5"];
  const photos = destinationsByPhoto.map((id, index) => {
    const delivery = visitorData.deliveries.find((item) => item.id === id);
    return {
      id: delivery.id,
      destination: delivery.name,
      description: delivery.description,
      date: delivery.displayDate,
      photo: `/images/visitante/donacion${index + 1}.jpeg`,
    };
  });
  res.render("gallery", { title: "Fotos de entregas", publicPage: true, photos });
});

router.get("/entregas/:id", (req, res) => {
  const delivery = visitorData.deliveries.find((item) => item.id === req.params.id);
  if (!delivery) return res.redirect("/");
  res.render("visitor-delivery", { title: delivery.name, publicPage: true, delivery });
});

router.get("/legal", (req, res) => res.render("legal", { title: "Información legal", publicPage: true }));

// Compatibilidad con la ruta de la SPA anterior.
router.get("/inicio", (req, res) => res.redirect(301, "/"));

router.get("/seguimiento", async (req, res) => {
  res.render("tracking", { title: "Seguimiento", ...(await loadTrackingPage(req)) });
});

export default router;
