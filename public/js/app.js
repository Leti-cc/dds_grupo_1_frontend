// JS del navegador: solo interacción. Los datos y las operaciones de negocio
// los resuelve el servidor del front (Express) y llegan como HTML ya renderizado.

const TOAST_DURATION_MS = 5000;
const BUSY_TEXT_BY_FORM = {
  "login-form": "Conectando...",
  "import-donors-form": "Importando...",
};

/* ---------- Toast (mensaje flash que viene renderizado del servidor) ---------- */

function initToast() {
  const toast = document.querySelector("#toast");
  if (!toast || toast.hidden || !toast.textContent.trim()) {
    return;
  }
  // Se vuelve a escribir el texto para que los lectores de pantalla anuncien el aria-live.
  const message = toast.textContent;
  toast.textContent = "";
  window.requestAnimationFrame(() => {
    toast.textContent = message;
  });
  window.setTimeout(() => {
    toast.hidden = true;
  }, TOAST_DURATION_MS);
}

/* ---------- Barra de progreso de navegación ---------- */

const progressBar = document.querySelector(".page-progress");

function showProgress() {
  if (progressBar) {
    progressBar.hidden = false;
  }
}

function hideProgress() {
  if (progressBar) {
    progressBar.hidden = true;
  }
}

function isInternalNavigation(event, link) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    link.hasAttribute("download") ||
    (link.target && link.target !== "_self")
  ) {
    return false;
  }
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) {
    return false;
  }
  // Un link que solo cambia el hash no recarga la página.
  const samePage =
    url.pathname === window.location.pathname && url.search === window.location.search;
  return !(samePage && url.hash);
}

/* ---------- Estado de carga de los botones de submit ---------- */

function setBusy(form) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) {
    return;
  }
  button.dataset.originalText = button.textContent;
  button.textContent = BUSY_TEXT_BY_FORM[form.id] ?? "Guardando...";
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
}

function resetBusyButtons() {
  document.querySelectorAll('button[aria-busy="true"]').forEach((button) => {
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
    button.disabled = false;
    button.removeAttribute("aria-busy");
  });
}

/* ---------- Toggles y campos condicionales ---------- */

function toggleHidden(selector) {
  const element = document.querySelector(selector);
  if (element) {
    element.hidden = !element.hidden;
  }
}

function handleAction(actionButton) {
  switch (actionButton.dataset.action) {
    case "toggle-navigation": {
      const nav = document.querySelector("#primary-navigation");
      const expanded = actionButton.getAttribute("aria-expanded") === "true";
      actionButton.setAttribute("aria-expanded", String(!expanded));
      nav.classList.toggle("is-open", !expanded);
      break;
    }
    case "toggle-password": {
      const password = document.querySelector("#login-password");
      const visible = password.type === "password";
      password.type = visible ? "text" : "password";
      actionButton.textContent = visible ? "Ocultar" : "Ver";
      actionButton.setAttribute(
        "aria-label",
        visible ? "Ocultar contraseña" : "Mostrar contraseña",
      );
      break;
    }
    case "toggle-need-form":
      toggleHidden("#need-form");
      break;
    case "toggle-donation-form":
      toggleHidden("#donation-form");
      break;
  }
}

function updateConditionalFields() {
  const typeSelector = document.querySelector('#donor-form select[name="tipo"]');
  if (typeSelector) {
    const isLegal = typeSelector.value === "JURIDICA";
    document.querySelectorAll(".human-field").forEach((field) => {
      field.hidden = isLegal;
      const input = field.querySelector("input");
      if (input) {
        input.required = !isLegal;
      }
    });
    document.querySelectorAll(".legal-field").forEach((field) => {
      field.hidden = !isLegal;
      field.querySelector("input").required = isLegal;
    });
  }

  const needType = document.querySelector('#need-form select[name="tipo"]');
  if (needType) {
    const isRecurring = needType.value === "RECURRENTE";
    document.querySelector(".recurring-fields").hidden = !isRecurring;
    document.querySelector(".extraordinary-field").hidden = isRecurring;
    document.querySelector('#need-form [name="motivo"]').required = !isRecurring;
  }
}

/* ---------- Listeners ---------- */

document.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    handleAction(actionButton);
    return;
  }

  const link = event.target.closest("a[href]");
  if (link && isInternalNavigation(event, link)) {
    showProgress();
  }
});

// El evento submit solo se dispara si pasó la validación HTML5.
document.addEventListener("submit", (event) => {
  if (event.defaultPrevented) {
    return;
  }
  const form = event.target;
  if (form.method === "post" && form.id) {
    setBusy(form);
  }
  showProgress();
});

document.addEventListener("change", (event) => {
  if (
    event.target.matches('#donor-form select[name="tipo"]') ||
    event.target.matches('#need-form select[name="tipo"]')
  ) {
    updateConditionalFields();
  }
});

// pageshow cubre la carga normal y la vuelta atrás desde el bfcache.
window.addEventListener("pageshow", () => {
  hideProgress();
  resetBusyButtons();
});

updateConditionalFields();
initToast();
