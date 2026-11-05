import { apiRequest } from "./api-client.js";

export const donatrackService = {
  getDonations: (params = {}) =>
    apiRequest("donaciones", `/api/donaciones${toQueryString(params)}`),
  getEntities: () =>
    apiRequest("donaciones", "/api/entidades-beneficiarias"),
  getNeeds: (params = {}) =>
    apiRequest("donaciones", `/api/necesidades${toQueryString(params)}`),
  getSubcategories: () => apiRequest("donaciones", "/api/subcategorias"),
  createNeed: (need) =>
    apiRequest("donaciones", "/api/necesidades", {
      method: "POST",
      body: need,
    }),
  createDonation: (donation) =>
    apiRequest("donaciones", "/api/donaciones", {
      method: "POST",
      body: donation,
    }),
  getDonors: () => apiRequest("donaciones", "/api/donantes"),
  createDonor: (donor) =>
    apiRequest("donaciones", "/api/donantes", {
      method: "POST",
      body: donor,
    }),
  importDonors: (file) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest("donaciones", "/api/donantes/importaciones", {
      method: "POST",
      form,
    });
  },
  getDeliveries: (params = {}) =>
    apiRequest("logistica", `/api/logistica/entregas${toQueryString(params)}`),
  getDelivery: (id) =>
    apiRequest("logistica", `/api/logistica/entregas/${encodeURIComponent(id)}`),
  getTrucks: () => apiRequest("logistica", "/api/logistica/camiones"),
  getNotifications: () =>
    apiRequest("notificaciones", "/api/notificaciones"),
  getDonorProfile: (username) =>
    apiRequest(
      "incentivos",
      `/api/incentivos/donantes/${encodeURIComponent(username)}/perfil-analitico`,
    ),
  getDonorMissions: (username) =>
    apiRequest(
      "incentivos",
      `/api/incentivos/donantes/${encodeURIComponent(username)}/misiones-progreso`,
    ),
  getDonorBadges: (username) =>
    apiRequest(
      "incentivos",
      `/api/incentivos/donantes/${encodeURIComponent(username)}/vitrina`,
    ),
  getDonorRanking: () =>
    apiRequest("incentivos", "/api/incentivos/rankings/ultimo/destacados"),
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
