// Skeleton de la tabla mientras llega la página siguiente: paginado, filtros y "Quitar filtro".
// La sección que se pone en estado de carga es la que tiene data-carga.

function marcarCargando(elemento) {
  const seccion = elemento.closest("[data-carga]");
  if (seccion) {
    seccion.classList.add("cargando");
    seccion.setAttribute("aria-busy", "true");
  }
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-carga] .paginacion a, [data-carga] a[data-quitar-filtro]");
  if (link && event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
    marcarCargando(link);
  }
});

// submit solo se dispara si el formulario pasó la validación HTML5.
document.addEventListener("submit", (event) => {
  if (!event.defaultPrevented && event.target.matches("[data-carga] form.filtros")) {
    marcarCargando(event.target);
  }
});

// Al volver con "atrás" desde el bfcache, la tabla no tiene que quedar en estado de carga.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    document.querySelectorAll("[data-carga].cargando").forEach((seccion) => {
      seccion.classList.remove("cargando");
      seccion.removeAttribute("aria-busy");
    });
  }
});
