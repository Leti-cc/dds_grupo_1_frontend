// Paso 2 del flujo 3 (cargar la donación): solo interacción del navegador.
//  - Agregar y quitar filas de bienes (clona el <template id="bien-plantilla">).
//  - Mostrar el vencimiento o el estado de uso según la subcategoría elegida (data-perecedero / data-estado-uso).
//  - Vista previa de cómo el sistema segmenta la carga: una donación por subcategoría.
// El servidor valida todo de nuevo: este archivo es una ayuda, no la fuente de verdad.

const formulario = document.querySelector("#donacion-form");

if (formulario) {
  const lista = formulario.querySelector("#bienes");
  const plantilla = document.querySelector("#bien-plantilla");
  const botonAgregar = formulario.querySelector("[data-agregar-bien]");
  const ayudaMaximo = formulario.querySelector("#agregar-bien-ayuda");
  const vistaPrevia = document.querySelector("[data-segmentacion]");
  const textoInicial = vistaPrevia?.innerHTML ?? "";
  const maximo = Number(formulario.dataset.maxBienes) || 50;

  const filas = () => [...lista.querySelectorAll("[data-bien]")];

  const pad = (valor) => String(valor).padStart(2, "0");
  const hoy = new Date();
  const hoyIso = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;

  const plural = (cantidad, singular, pluralTexto) =>
    `${cantidad.toLocaleString("es-AR")} ${cantidad === 1 ? singular : pluralTexto}`;

  /* ---------- Numeración: ids, etiquetas y botones ---------- */

  const ATRIBUTOS_CON_ID = ["id", "for", "aria-describedby", "aria-labelledby", "aria-controls"];

  function renumerar() {
    const todas = filas();
    todas.forEach((fila, indice) => {
      const n = indice + 1;
      for (const elemento of [fila, ...fila.querySelectorAll("*")]) {
        for (const atributo of ATRIBUTOS_CON_ID) {
          const valor = elemento.getAttribute(atributo);
          if (valor?.includes("item-")) {
            elemento.setAttribute(atributo, valor.replace(/item-\d+-/g, `item-${n}-`));
          }
        }
      }
      fila.querySelector("[data-numero]").textContent = n;
      const quitar = fila.querySelector("[data-quitar-bien]");
      quitar.hidden = todas.length === 1;
      quitar.setAttribute("aria-label", `Quitar el bien ${n}`);
    });
    const lleno = todas.length >= maximo;
    botonAgregar.hidden = lleno;
    ayudaMaximo.hidden = !lleno;
  }

  /* ---------- Campos según la subcategoría ---------- */

  function actualizarCampos(fila) {
    const opcion = fila.querySelector("[data-subcategoria]").selectedOptions[0];
    const requiereEstadoUso = opcion?.dataset.estadoUso === "true";
    const perecedero = opcion?.dataset.perecedero === "true" && !requiereEstadoUso;

    const mostrar = (nombre, visible) => {
      const contenedor = fila.querySelector(`[data-campo="${nombre}"]`);
      contenedor.hidden = !visible;
      return contenedor;
    };
    mostrar("medida", !requiereEstadoUso);
    mostrar("estado-uso", requiereEstadoUso).querySelector("select").required = requiereEstadoUso;
    const vencimiento = mostrar("vencimiento", perecedero).querySelector("input");
    vencimiento.required = perecedero;
    vencimiento.min = hoyIso;
  }

  /* ---------- Vista previa de la segmentación ---------- */

  function crear(etiqueta, texto, clase) {
    const elemento = document.createElement(etiqueta);
    elemento.textContent = texto;
    if (clase) elemento.className = clase;
    return elemento;
  }

  function actualizarVistaPrevia() {
    if (!vistaPrevia) return;
    const grupos = new Map();
    let sinSubcategoria = 0;

    for (const fila of filas()) {
      const select = fila.querySelector("[data-subcategoria]");
      if (!select.value) {
        sinSubcategoria += 1;
        continue;
      }
      const opcion = select.selectedOptions[0];
      const grupo = grupos.get(select.value) ?? {
        nombre: opcion.textContent,
        categoria: opcion.parentElement?.label ?? "",
        bienes: 0,
        unidades: 0,
      };
      grupo.bienes += 1;
      grupo.unidades += Number(fila.querySelector('[name="itemCantidad"]').value) || 0;
      grupos.set(select.value, grupo);
    }

    vistaPrevia.replaceChildren();
    if (grupos.size === 0) {
      vistaPrevia.innerHTML = textoInicial;
      return;
    }

    const total = crear("p", "", "segmentacion-total");
    total.append(crear("strong", plural(grupos.size, "donación", "donaciones")), " se generan con esta carga:");
    const ol = document.createElement("ol");
    ol.className = "segmentacion-lista";
    for (const grupo of grupos.values()) {
      const item = document.createElement("li");
      item.append(
        crear("strong", grupo.nombre),
        crear("small", `${grupo.categoria} · ${plural(grupo.bienes, "bien", "bienes")} · ${plural(grupo.unidades, "unidad", "unidades")}`),
      );
      ol.append(item);
    }
    vistaPrevia.append(total, ol);
    if (sinSubcategoria > 0) {
      vistaPrevia.append(crear("p", `Falta elegir la subcategoría de ${plural(sinSubcategoria, "bien", "bienes")}.`, "field-hint"));
    }
  }

  /* ---------- Eventos ---------- */

  lista.addEventListener("change", (evento) => {
    const select = evento.target.closest("[data-subcategoria]");
    if (select) {
      actualizarCampos(select.closest("[data-bien]"));
      actualizarVistaPrevia();
    }
  });

  lista.addEventListener("input", (evento) => {
    if (evento.target.matches('[name="itemCantidad"]')) {
      actualizarVistaPrevia();
    }
  });

  lista.addEventListener("click", (evento) => {
    const boton = evento.target.closest("[data-quitar-bien]");
    if (!boton || filas().length === 1) return;
    const fila = boton.closest("[data-bien]");
    const anterior = fila.previousElementSibling ?? fila.nextElementSibling;
    fila.remove();
    renumerar();
    actualizarVistaPrevia();
    anterior?.querySelector("input, select")?.focus();
  });

  botonAgregar.addEventListener("click", () => {
    if (filas().length >= maximo) return;
    lista.append(document.importNode(plantilla.content, true));
    const nueva = filas().at(-1);
    renumerar();
    actualizarCampos(nueva);
    actualizarVistaPrevia();
    nueva.querySelector("input")?.focus();
  });

  /* ---------- Aviso al salir con datos sin guardar ---------- */

  let modificado = false;
  let enviando = false;
  formulario.addEventListener("input", () => {
    modificado = true;
  });
  formulario.addEventListener("submit", () => {
    enviando = true;
  });
  window.addEventListener("beforeunload", (evento) => {
    if (modificado && !enviando) {
      evento.preventDefault();
      evento.returnValue = "";
    }
  });
  window.addEventListener("pageshow", () => {
    enviando = false;
  });

  /* ---------- Inicio ---------- */

  filas().forEach(actualizarCampos);
  renumerar();
  actualizarVistaPrevia();
}
