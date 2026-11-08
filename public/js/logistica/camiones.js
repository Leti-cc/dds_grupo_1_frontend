// Ayuda inicial que se puede cerrar (queda recordado) y patente en mayúsculas mientras se escribe.

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

document.addEventListener("input", (event) => {
  if (event.target.matches("[data-mayusculas]")) {
    event.target.value = event.target.value.toUpperCase();
  }
});
