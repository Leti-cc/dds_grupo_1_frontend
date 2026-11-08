import { apiRequest } from "./api-client.js";

export const donatrackService = {
  getDonations: (req, params = {}) =>
    apiRequest(req, "donaciones", `/api/donaciones${toQueryString(params)}`),
  getEntities: (req) =>
    apiRequest(req, "donaciones", "/api/entidades-beneficiarias"),
  getNeeds: (req, params = {}) =>
    apiRequest(req, "donaciones", `/api/necesidades${toQueryString(params)}`),
  getSubcategories: (req) => apiRequest(req, "donaciones", "/api/subcategorias"),
  createNeed: (req, need) =>
    apiRequest(req, "donaciones", "/api/necesidades", {
      method: "POST",
      body: need,
    }),
  createDonation: (req, donation) =>
    apiRequest(req, "donaciones", "/api/donaciones", {
      method: "POST",
      body: donation,
    }),
  getDonors: (req) => apiRequest(req, "donaciones", "/api/donantes"),
  createDonor: (req, donor) =>
    apiRequest(req, "donaciones", "/api/donantes", {
      method: "POST",
      body: donor,
    }),
  importDonors: (req, file) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return apiRequest(req, "donaciones", "/api/donantes/importaciones", {
      method: "POST",
      form,
    });
  },
  getDeliveries: (req, params = {}) =>
    apiRequest(req, "logistica", `/api/logistica/entregas${toQueryString(params)}`),
  getDelivery: (req, id) =>
    apiRequest(req, "logistica", `/api/logistica/entregas/${encodeURIComponent(id)}`),
  getTrucks: (req) => apiRequest(req, "logistica", "/api/logistica/camiones"),
  getNotifications: (req) =>
    apiRequest(req, "notificaciones", "/api/notificaciones"),
  getDonorProfile: (req, username) =>
    apiRequest(
      req,
      "incentivos",
      `/api/incentivos/donantes/${encodeURIComponent(username)}/perfil-analitico`,
    ),
  getDonorMissions: (req, username) =>
    apiRequest(
      req,
      "incentivos",
      `/api/incentivos/donantes/${encodeURIComponent(username)}/misiones-progreso`,
    ),
  getDonorBadges: (req, username) =>
    apiRequest(
      req,
      "incentivos",
      `/api/incentivos/donantes/${encodeURIComponent(username)}/vitrina`,
    ),
  getDonorRanking: (req) =>
    apiRequest(req, "incentivos", "/api/incentivos/rankings/ultimo/destacados"),
};

function toQueryString(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}
