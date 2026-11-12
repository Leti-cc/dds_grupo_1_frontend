// Importación CSV: valida el archivo antes de subirlo (tipo y tamaño) y avisa que la importación está en curso.

const formulario = document.querySelector("#importar-form");

if (formulario) {
  const entrada = formulario.querySelector("#archivo-csv");
  const error = formulario.querySelector("#archivo-error");
  const elegido = formulario.querySelector("#archivo-elegido");
  const importando = formulario.querySelector("#importando");
  const maxBytes = Number(formulario.dataset.maxBytes);
  const maxTexto = formulario.dataset.maxTexto;

  const formatoTamanio = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  };

  const mensajeDeArchivo = (archivo) => {
    if (!archivo) return "Elegí un archivo CSV para importar.";
    if (!/\.csv$/i.test(archivo.name)) return "El archivo tiene que ser un .csv.";
    if (archivo.size === 0) return "El archivo está vacío.";
    if (archivo.size > maxBytes) return `El archivo supera el máximo de ${maxTexto}.`;
    return "";
  };

  const mostrarError = (mensaje) => {
    error.textContent = mensaje;
    error.hidden = !mensaje;
    entrada.setAttribute("aria-invalid", String(Boolean(mensaje)));
    entrada.closest(".field")?.classList.toggle("tiene-error", Boolean(mensaje));
  };

  entrada.addEventListener("change", () => {
    const archivo = entrada.files?.[0];
    const mensaje = archivo ? mensajeDeArchivo(archivo) : "";
    mostrarError(mensaje);
    elegido.hidden = !archivo || Boolean(mensaje);
    if (archivo && !mensaje) {
      elegido.textContent = `Archivo elegido: ${archivo.name} (${formatoTamanio(archivo.size)})`;
    }
  });

  // Corre antes que el de app.js (que pone el botón en "Importando…") y lo frena si el archivo no sirve.
  formulario.addEventListener("submit", (evento) => {
    const mensaje = mensajeDeArchivo(entrada.files?.[0]);
    if (mensaje) {
      evento.preventDefault();
      mostrarError(mensaje);
      entrada.focus();
      return;
    }
    importando.hidden = false;
  });

  // Al volver con "atrás" no puede quedar el aviso de importación en curso.
  window.addEventListener("pageshow", () => {
    importando.hidden = true;
  });
}
