// JS del navegador para todo el flujo 3: solo interacción. Los datos llegan renderizados por el servidor.
//  - Ayuda inicial descartable ([data-hint]), que queda recordada.
//  - Foco en el resumen de errores cuando el formulario vuelve con errores (WCAG).
//  - Estado de carga de la búsqueda de donantes (el backend recorre todos los donantes en memoria).

const CLAVE_HINT = "donatrack.hint.";

function hintCerrado(id) {
  try {
    return window.localStorage.getItem(CLAVE_HINT + id) === "cerrado";
  } catch {
    return false;
  }
}

function recordarHintCerrado(id) {
  try {
    window.localStorage.setItem(CLAVE_HINT + id, "cerrado");
  } catch {
    // Sin almacenamiento disponible, la ayuda vuelve a aparecer en la próxima visita.
  }
}

document.querySelectorAll("[data-hint]").forEach((hint) => {
  hint.hidden = hintCerrado(hint.dataset.hint);
  hint.querySelector("[data-hint-close]")?.addEventListener("click", () => {
    hint.hidden = true;
    recordarHintCerrado(hint.dataset.hint);
  });
});

const resumenErrores = document.querySelector("#resumen-errores");
if (resumenErrores) {
  resumenErrores.focus();
}

// Skeleton de los resultados mientras llega la búsqueda (más de 300 ms se nota).
document.addEventListener("submit", (evento) => {
  const formulario = evento.target.closest?.("form[data-busqueda]");
  if (!formulario || evento.defaultPrevented) {
    return;
  }
  const resultados = document.querySelector("[data-resultados]");
  const destino = resultados ?? document.createElement("section");
  if (!resultados) {
    destino.className = "surface-card section-block";
    formulario.closest(".section-block")?.after(destino);
  }
  destino.setAttribute("aria-busy", "true");
  destino.innerHTML =
    '<p class="visually-hidden">Buscando donantes…</p><div aria-hidden="true">' +
    '<div class="skeleton sk-fila"></div><div class="skeleton sk-fila"></div><div class="skeleton sk-fila"></div></div>';
});

// Al volver con "atrás" (bfcache) no puede quedar el skeleton.
window.addEventListener("pageshow", (evento) => {
  if (evento.persisted && document.querySelector("[data-resultados][aria-busy]")) {
    window.location.reload();
  }
});
