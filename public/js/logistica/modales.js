// Abre y cierra los <dialog> nativos que renderiza el servidor. Esc y el foco atrapado los da el navegador.

function abrir(dialog, disparador) {
  const volverA = () => {
    disparador?.focus();
    dialog.removeEventListener("close", volverA);
  };
  dialog.addEventListener("close", volverA);
  dialog.showModal();
}

document.addEventListener("click", (event) => {
  const abre = event.target.closest("[data-dialog-open]");
  if (abre) {
    abrir(document.getElementById(abre.dataset.dialogOpen), abre);
    return;
  }

  const cierra = event.target.closest("[data-dialog-close]");
  if (cierra) {
    cierra.closest("dialog").close();
  }
});

// El servidor reabre el formulario cuando volvió con errores.
document.querySelectorAll("dialog[data-dialog-abierto]").forEach((dialog) => {
  abrir(dialog, document.querySelector(`[data-dialog-open="${dialog.id}"]`));
  dialog.querySelector('[aria-invalid="true"]')?.focus();
});

// WCAG 1.4.13: el tooltip se puede descartar con Esc sin mover el foco.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.body.classList.add("tooltips-ocultos");
  }
});
["focusin", "pointerover"].forEach((tipo) => {
  document.addEventListener(tipo, (event) => {
    if (event.target.closest?.(".tooltip-wrap")) {
      document.body.classList.remove("tooltips-ocultos");
    }
  });
});
