import Handlebars from "handlebars";
import adminTemplate from "../templates/admin.hbs?raw";
import donorTemplate from "../templates/donor.hbs?raw";
import entityTemplate from "../templates/entity.hbs?raw";
import layoutTemplate from "../templates/layout.hbs?raw";
import loginTemplate from "../templates/login.hbs?raw";
import publicTemplate from "../templates/public.hbs?raw";
import trackingTemplate from "../templates/tracking.hbs?raw";
import incentivosTemplate from "../templates/incentivos.hbs?raw";
import { authService } from "./services/auth-service.js";
import { donatrackService } from "./services/donatrack-service.js";

const root = document.querySelector("#app");
const toast = document.querySelector("#toast");
const templates = {
  admin: Handlebars.compile(adminTemplate),
  donor: Handlebars.compile(donorTemplate),
  entity: Handlebars.compile(entityTemplate),
  layout: Handlebars.compile(layoutTemplate),
  login: Handlebars.compile(loginTemplate),
  public: Handlebars.compile(publicTemplate),
  tracking: Handlebars.compile(trackingTemplate),
  incentivos: Handlebars.compile(incentivosTemplate),
};
Handlebars.registerPartial("incentivos", incentivosTemplate);
const routes = [
  { path: "/inicio", template: "public", label: "Inicio" },
  { path: "/seguimiento", template: "tracking", label: "Seguimiento" },
  { path: "/donante", template: "donor", label: "Donante" },
  { path: "/entidad", template: "entity", label: "Entidad" },
  { path: "/administracion", template: "admin", label: "Administración" },
];
let renderSequence = 0;
const templateByRoute = {
  ...Object.fromEntries(routes.map(({ path, template }) => [path, template])),
  "/login": "login",
  "/auth/callback": "login",
};
let toastTimeout;

Handlebars.registerHelper("statusLabel", (status) => {
  const labels = {
    EN_DEPOSITO: "En depósito",
    ASIGNACION_REALIZADA: "Asignada",
    LISTA_PARA_ENTREGAR: "Lista para entregar",
    PENDIENTE: "Pendiente",
    EN_TRASLADO: "En camino",
    ENTREGADA: "Entregada",
    NO_RECIBIDA: "No recibida",
    ENTREGA_FALLIDA: "Entrega fallida",
  };
  return labels[status] ?? String(status ?? "Sin estado").replaceAll("_", " ");
});
Handlebars.registerHelper("eq", (left, right) => left === right);

function readArray(value, endpointName) {
  if (!Array.isArray(value)) {
    throw new Error(`La respuesta de ${endpointName} no tiene el formato de lista esperado.`);
  }
  return value;
}

async function loadSection(request, normalize = (value) => value) {
  try {
    return { data: normalize(await request()) };
  } catch (error) {
    return { error: error.message || "No se pudo cargar la información." };
  }
}

function normalizeDelivery(delivery) {
  const latestEvent = delivery.historial?.at(-1);
  return {
    ...delivery,
    displayName: `Donación ${delivery.donacionId ?? delivery.id}`,
    displayDescription: delivery.direccionDestino ?? "Destino no informado",
    updatedAt: latestEvent?.fecha ?? "Sin actualización",
  };
}

function userHasRole(user, roles) {
  const role = user?.role ?? user?.rol;
  return roles.includes(role);
}

function resolveLocation() {
  const locationHash = window.location.hash.slice(1) || "/inicio";
  const queryIndex = locationHash.indexOf("?");
  const path = queryIndex < 0 ? locationHash : locationHash.slice(0, queryIndex);
  const query = queryIndex < 0 ? "" : locationHash.slice(queryIndex + 1);
  return {
    path: path || "/inicio",
    params: new URLSearchParams(query),
  };
}

async function loadPublicPage() {
  const [donations, entities, deliveries] = await Promise.all([
    loadSection(() => donatrackService.getDonations(), (value) => readArray(value, "donaciones")),
    loadSection(() => donatrackService.getEntities(), (value) => readArray(value, "entidades")),
    loadSection(
      () => donatrackService.getDeliveries({ estado: "ENTREGADA" }),
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

async function loadTrackingPage(params) {
  const id = params.get("id")?.trim() ?? "";
  if (!id) {
    return { queryId: "" };
  }
  const result = await loadSection(() => donatrackService.getDelivery(id));
  return {
    queryId: id,
    delivery: result.data ? normalizeDelivery(result.data) : null,
    error: result.error,
  };
}

async function loadDonorPage() {
  const session = authService.getSession();
  const user = session?.user;
  const username = user?.username ?? user?.nombreUsuario;
  if (!user || !userHasRole(user, ["DONANTE", "ROLE_DONANTE"])) {
    return {
      userName: "",
      authMessage: user
        ? "Tu cuenta no tiene el perfil de donante."
        : "Iniciá sesión como donante para consultar el perfil.",
      profile: {
        donations: "—",
        donationHistory: [],
        points: "—",
        level: "Ingresá para consultar",
      },
    };
  }
  if (!username) {
    return {
      userName: "",
      authMessage: "El perfil autenticado no incluye nombreUsuario para consultar incentivos.",
      profile: {
        donations: "—",
        donationHistory: [],
        points: "—",
        level: "Sin datos de perfil",
      },
    };
  }

  const [profile, missions, badges, ranking] = await Promise.all([
    loadSection(() => donatrackService.getDonorProfile(username)),
    loadSection(
      () => donatrackService.getDonorMissions(username),
      (value) => readArray(value, "misiones"),
    ),
    loadSection(
      () => donatrackService.getDonorBadges(username),
      (value) => readArray(value, "insignias"),
    ),
    loadSection(() => donatrackService.getDonorRanking(), (value) => {
      if (!value || !Array.isArray(value.losDestacados)) {
        throw new Error("La respuesta del ranking no tiene el formato esperado.");
      }
      return value;
    }),
  ]);
  const rankedDonors = ranking.data?.losDestacados;

  const evo = profile.data?.evolucionDonacionesPorPeriodo ?? [];
  const maxEvo = Math.max(1, ...evo);
  const cambio = profile.data?.comparacionMensual;

  return {
    userName: username,
    profile: {
      donations: profile.data?.donaciones?.length ?? "—",
      donationHistory: profile.data?.donaciones ?? [],
      points: profile.data?.impactoAcumulado ?? "—",
      level: profile.data?.categoriaActual ?? "Sin categoría",
      organizations: profile.data?.totalOrganizacionesAyudadas ?? "—",
      position: profile.data?.posicionRanking || "—",
      monthChange: cambio == null ? "—" : `${cambio > 0 ? "+" : ""}${Math.round(cambio)}%`,
      evolution: evo.map((v) => ({ value: v, height: Math.round((v / maxEvo) * 100) })),
    },
    missions:
      missions.data?.map((mission) => ({
        ...mission,
        completada:
          mission.distanciaRestante === 0 ||
          mission.progresoActual >= mission.objetivo,
          porcentaje: Math.min(100, Math.round((mission.progresoActual / mission.objetivo) * 100)),
      })) ?? [],
    badges: badges.data ?? [],
    ranking: Array.isArray(rankedDonors) ? rankedDonors : [],
    errors: {
      profile: profile.error,
      missions: missions.error,
      badges: badges.error,
      ranking: ranking.error,
    },
  };
}

async function loadEntityPage(params) {
  const session = authService.getSession();
  if (
    !session ||
    !userHasRole(session.user, [
      "ENTIDAD",
      "ENTIDAD_BENEFICIARIA",
      "ROLE_ENTIDAD_BENEFICIARIA",
    ])
  ) {
    return {
      entityId: "",
      requiresAuth: true,
      authMessage: session
        ? "Tu cuenta no tiene el perfil de entidad beneficiaria."
        : "Iniciá sesión como entidad para consultar sus necesidades.",
    };
  }
  const id = params.get("id") || session?.user?.entidadId || "";
  if (!id) {
    return { entityId: "" };
  }
  const entityId = Number(id);
  if (!Number.isSafeInteger(entityId) || entityId < 1) {
    return { entityId: "", errors: { needs: "El ID de entidad debe ser un número entero positivo." } };
  }

  const [needs, entities, subcategories] = await Promise.all([
    loadSection(
      () => donatrackService.getNeeds({ entidadId: entityId }),
      (value) => readArray(value, "necesidades"),
    ),
    loadSection(
      () => donatrackService.getEntities(),
      (value) => readArray(value, "entidades"),
    ),
    loadSection(
      () => donatrackService.getSubcategories(),
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

async function loadAdminPage() {
  const session = authService.getSession();
  const adminRoles = [
    "ADMIN",
    "ADMINISTRADOR",
    "ROLE_ADMIN",
    "ROLE_ADMINISTRADOR",
    "LOGISTICA_ADMIN",
    "ROLE_LOGISTICA_ADMIN",
  ];
  if (!session || !userHasRole(session.user, adminRoles)) {
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
      metrics: { donations: "—", donors: "—", trucks: "—", pending: "—" },
    };
  }

  const [donations, donors, trucks, pendingDeliveries, subcategories, notifications] = await Promise.all([
    loadSection(
      () => donatrackService.getDonations(),
      (value) => readArray(value, "donaciones"),
    ),
    loadSection(
      () => donatrackService.getDonors(),
      (value) => readArray(value, "donantes"),
    ),
    loadSection(
      () => donatrackService.getTrucks(),
      (value) => readArray(value, "camiones"),
    ),
    loadSection(
      () => donatrackService.getDeliveries({ estado: "PENDIENTE" }),
      (value) => readArray(value, "entregas pendientes"),
    ),
    loadSection(
      () => donatrackService.getSubcategories(),
      (value) => readArray(value, "subcategorías"),
    ),
    loadSection(
      () => donatrackService.getNotifications(),
      (value) => readArray(value, "notificaciones"),
    ),
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
    },
  };
}

async function loadOAuthCallbackPage(params) {
  try {
    const user = await authService.completeSocialLogin({
      code: params.get("code"),
      state: params.get("state"),
    });
    window.location.hash = `#${getRoleRoute(user.role ?? user.rol)}`;
    return { user };
  } catch (error) {
    return { authError: error.message };
  }
}

const pageLoaders = {
  "/inicio": loadPublicPage,
  "/seguimiento": loadTrackingPage,
  "/donante": loadDonorPage,
  "/entidad": loadEntityPage,
  "/administracion": loadAdminPage,
  "/login": async () => ({ user: authService.getSession()?.user ?? null }),
  "/auth/callback": loadOAuthCallbackPage,
};

function userLabel(user) {
  return user?.nombre ?? user?.username ?? user?.email ?? "Sesión iniciada";
}

function renderLayout(content, route, session) {
  const navigationLinks = routes.map((item) => ({
    ...item,
    href: `#${item.path}`,
    active: item.path === route,
  }));
  root.innerHTML = templates.layout({
    content,
    links: navigationLinks,
    user: session?.user,
    userLabel: userLabel(session?.user),
  });
}

async function renderRoute() {
  const { path, params } = resolveLocation();
  const route = pageLoaders[path] ? path : "/inicio";
  const sequence = ++renderSequence;
  const session = authService.getSession();
  renderLayout(
    new Handlebars.SafeString(
      '<section class="loading-state" role="status"><span class="spinner" aria-hidden="true"></span><strong>Cargando la información</strong><span>Consultando los servicios de DonaTrack…</span></section>',
    ),
    route,
    session,
  );
  const currentData = await pageLoaders[route](params);
  if (sequence !== renderSequence) {
    return;
  }
  const content = templates[templateByRoute[route]](currentData);
  renderLayout(new Handlebars.SafeString(content), route, authService.getSession());
  root.dataset.entityId = currentData.entityId ?? "";
  updateConditionalFields();
  root.querySelector("#main-content")?.focus({ preventScroll: true });
}

function showToast(message, state = "info") {
  window.clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.dataset.state = state;
  toast.hidden = false;
  toastTimeout = window.setTimeout(() => {
    toast.hidden = true;
  }, 5000);
}

function setFormError(formId, message) {
  const error = root.querySelector(`#${formId}`);
  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
}

function setBusy(form, busy, text) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) {
    return;
  }
  button.disabled = busy;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = text;
  } else if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
    delete button.dataset.originalText;
  }
}

function handleClick(event) {
  const providerButton = event.target.closest("[data-provider]");
  if (providerButton) {
    try {
      authService.startSocialLogin(providerButton.dataset.provider);
    } catch (error) {
      showToast(error.message, "error");
    }
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) {
    return;
  }

  switch (actionButton.dataset.action) {
    case "logout":
      authService.logout();
      showToast("Se cerró la sesión.", "success");
      window.location.hash = "#/inicio";
      break;
    case "toggle-navigation": {
      const nav = root.querySelector("#primary-navigation");
      const expanded = actionButton.getAttribute("aria-expanded") === "true";
      actionButton.setAttribute("aria-expanded", String(!expanded));
      nav.classList.toggle("is-open", !expanded);
      break;
    }
    case "toggle-password": {
      const password = root.querySelector("#login-password");
      const visible = password.type === "password";
      password.type = visible ? "text" : "password";
      actionButton.textContent = visible ? "Ocultar" : "Ver";
      actionButton.setAttribute(
        "aria-label",
        visible ? "Ocultar contraseña" : "Mostrar contraseña",
      );
      break;
    }
    case "toggle-need-form": {
      const form = root.querySelector("#need-form");
      form.hidden = !form.hidden;
      break;
    }
    case "toggle-donation-form": {
      const form = root.querySelector("#donation-form");
      form.hidden = !form.hidden;
      break;
    }
  }
}

async function handleSubmit(event) {
  const form = event.target;
  const formId = form.id;
  if (!formId) {
    return;
  }
  event.preventDefault();

  if (formId === "tracking-form") {
    const id = new FormData(form).get("deliveryId").toString().trim();
    window.location.hash = `#/seguimiento?id=${encodeURIComponent(id)}`;
    return;
  }

  if (formId === "entity-filter-form") {
    const id = new FormData(form).get("entityId").toString().trim();
    window.location.hash = id ? `#/entidad?id=${encodeURIComponent(id)}` : "#/entidad";
    return;
  }

  if (formId === "login-form") {
    const values = new FormData(form);
    setFormError("login-error", "");
    root.querySelector("#login-error").hidden = true;
    setBusy(form, true, "Conectando...");
    try {
      const user = await authService.login({
        identifier: values.get("identifier"),
        password: values.get("password"),
        remember: values.has("remember"),
      });
      showToast("Inicio de sesión exitoso.", "success");
      window.location.hash = `#${getRoleRoute(user.role ?? user.rol)}`;
    } catch (error) {
      setFormError("login-error", error.message);
    } finally {
      setBusy(form, false);
    }
    return;
  }

  if (formId === "need-form") {
    const values = new FormData(form);
    const entityId = Number(root.dataset.entityId);
    const type = values.get("tipo");
    const need = {
      entidadId: entityId,
      subcategoriaId: Number(values.get("subcategoriaId")),
      descripcion: values.get("descripcion").trim(),
      cantidad: Number(values.get("cantidad")),
      tipo: type,
    };
    if (type === "RECURRENTE") {
      need.tipoPeriodo = values.get("tipoPeriodo");
      need.frecuencia = Number(values.get("frecuencia"));
    } else {
      need.motivo = values.get("motivo").trim();
    }
    await submitForm(form, "need-error", () => donatrackService.createNeed(need), "Necesidad registrada.");
    return;
  }

  if (formId === "donation-form") {
    const values = new FormData(form);
    const item = {
      nombre: values.get("nombre").trim(),
      descripcion: values.get("nombre").trim(),
      subcategoriaId: Number(values.get("subcategoriaId")),
      cantidad: Number(values.get("cantidad")),
      unidad: values.get("unidad"),
      cantidadBien: 1,
    };
    if (values.get("fechaVencimiento")) {
      item.fechaVencimiento = values.get("fechaVencimiento");
    }
    const donation = {
      donanteId: Number(values.get("donanteId")),
      descripcion: values.get("descripcion").trim(),
      items: [item],
    };
    await submitForm(form, "donation-error", () => donatrackService.createDonation(donation), "Donación registrada.");
    return;
  }

  if (formId === "donor-form") {
    await submitDonor(form);
    return;
  }

  if (formId === "import-donors-form") {
    const file = new FormData(form).get("file");
    const result = root.querySelector("#import-result");
    result.hidden = true;
    setBusy(form, true, "Importando...");
    try {
      const response = await donatrackService.importDonors(file);
      result.textContent = `Importación finalizada: ${response.totalProcesados} procesados, ${response.creados} creados y ${response.actualizados} actualizados.${response.errores?.length ? ` Errores: ${response.errores.length}.` : ""}`;
      result.dataset.state = response.errores?.length ? "error" : "success";
      result.hidden = false;
      showToast("La importación terminó.", response.errores?.length ? "error" : "success");
      form.reset();
    } catch (error) {
      result.textContent = error.message;
      result.dataset.state = "error";
      result.hidden = false;
    } finally {
      setBusy(form, false);
    }
  }
}

async function submitForm(form, errorId, request, successMessage) {
  const errorElement = root.querySelector(`#${errorId}`);
  errorElement.hidden = true;
  setBusy(form, true, "Guardando...");
  try {
    await request();
    showToast(successMessage, "success");
    await renderRoute();
  } catch (error) {
    setFormError(errorId, error.message);
  } finally {
    setBusy(form, false);
  }
}

async function submitDonor(form) {
  const values = new FormData(form);
  const type = values.get("tipo");
  const donor =
    type === "HUMANA"
      ? {
          tipo: "HUMANA",
          tipoUsuario: "PERSONA",
          nombre: values.get("nombre").trim(),
          apellido: values.get("apellido").trim(),
          dni: values.get("dni").trim(),
          edad: Number(values.get("edad")),
          genero: values.get("genero") || null,
          direccion: values.get("direccion").trim(),
          contactoPredeterminado: { medio: "MAIL", valor: values.get("email").trim() },
        }
      : {
          tipo: "JURIDICA",
          tipoUsuario: "ORGANIZACION",
          tipoPersonaJuridica: "EMPRESA",
          razonSocial: values.get("razonSocial").trim(),
          cuit: values.get("cuit").trim(),
          rubro: values.get("rubro").trim(),
          contactoPredeterminado: { medio: "MAIL", valor: values.get("email").trim() },
        };
  await submitForm(form, "donor-error", () => donatrackService.createDonor(donor), "Donante registrado.");
}

function getRoleRoute(role) {
  const routesByRole = {
    DONANTE: "/donante",
    ROLE_DONANTE: "/donante",
    ENTIDAD: "/entidad",
    ENTIDAD_BENEFICIARIA: "/entidad",
    ROLE_ENTIDAD_BENEFICIARIA: "/entidad",
    ADMIN: "/administracion",
    ADMINISTRADOR: "/administracion",
    ROLE_ADMIN: "/administracion",
    ROLE_ADMINISTRADOR: "/administracion",
    LOGISTICA_ADMIN: "/administracion",
    ROLE_LOGISTICA_ADMIN: "/administracion",
  };
  return routesByRole[role] ?? "/inicio";
}

function updateConditionalFields() {
  const typeSelector = root.querySelector('#donor-form select[name="tipo"]');
  if (typeSelector) {
    const isLegal = typeSelector.value === "JURIDICA";
    root.querySelectorAll(".human-field").forEach((field) => {
      field.hidden = isLegal;
      const input = field.querySelector("input");
      if (input) {
        input.required = !isLegal;
      }
    });
    root.querySelectorAll(".legal-field").forEach((field) => {
      field.hidden = !isLegal;
      field.querySelector("input").required = isLegal;
    });
  }

  const needType = root.querySelector('#need-form select[name="tipo"]');
  if (needType) {
    const isRecurring = needType.value === "RECURRENTE";
    root.querySelector(".recurring-fields").hidden = !isRecurring;
    root.querySelector(".extraordinary-field").hidden = isRecurring;
    root.querySelector('#need-form [name="motivo"]').required = !isRecurring;
  }
}

root.addEventListener("click", handleClick);
root.addEventListener("submit", (event) => {
  void handleSubmit(event);
});
root.addEventListener("change", (event) => {
  if (
    event.target.matches('#donor-form select[name="tipo"]') ||
    event.target.matches('#need-form select[name="tipo"]')
  ) {
    updateConditionalFields();
  }
});
window.addEventListener("hashchange", () => {
  void renderRoute();
});
void renderRoute();
