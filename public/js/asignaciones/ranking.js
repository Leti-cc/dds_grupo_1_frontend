// Modal del ranking. Abrir el modal real lo hace modales.js (data-dialog-abierto); este archivo:
// 1. Muestra un skeleton apenas se toca "Ver ranking" o "Marcar vencida", mientras carga la página.
// 2. Al cerrar el modal real, saca ?donacion de la URL sin recargar y devuelve el foco a la fila.

const cargando = document.getElementById("ranking-cargando");
const progreso = document.querySelector(".page-progress");

// El velo que dejó el servidor para que no se vea la lista "pelada" antes de abrir el modal.
document.querySelector(".scrim-inicial")?.remove();

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-abre-modal]");
  if (!link || !cargando || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  cargando.dataset.variante = link.dataset.abreModal;
  cargando.showModal();
});

// Esc mientras carga: se cancela la navegación y se queda en la lista.
cargando?.addEventListener("cancel", () => {
  window.stop();
  if (progreso) {
    progreso.hidden = true;
  }
});

// Al volver con "atrás" desde el bfcache, la página vuelve con el skeleton abierto.
window.addEventListener("pageshow", (event) => {
  if (event.persisted && cargando?.open) {
    cargando.close();
  }
});

document.querySelectorAll("dialog[data-url-cerrar]").forEach((dialog) => {
  dialog.addEventListener("close", () => {
    // Si se cerró el de vencida pero el ranking sigue abierto debajo, todavía no se cierra la donación.
    if (document.querySelector("dialog[data-url-cerrar][open]")) {
      return;
    }
    window.history.replaceState(null, "", dialog.dataset.urlCerrar);
    document.querySelector("[data-foco-al-cerrar]")?.focus();
  });
});
