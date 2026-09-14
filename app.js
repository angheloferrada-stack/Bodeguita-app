// ==========================================================================
// Bodega Folclor — lógica de la app
// Requiere que js/firebase-config.js ya haya corrido firebase.initializeApp()
// y dejado disponible la variable global `db` (Firestore).
// ==========================================================================

let cajas = [];
let movimientos = [];
let pilas = [];

// ---------------------------------------------------------------- Registrar SW
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// ---------------------------------------------------------------- Utilidades
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

function normaliza(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function fechaLegible(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function cajaCoincide(c, term) {
  return term && [c.numero, c.nombre, c.categoria, c.ubicacion, c.contenido].map(normaliza).some((v) => v.includes(term));
}

const PALETA_PILAS = ["#E8A93C", "#D63384", "#2E9E83", "#4C6EF5", "#E0563F", "#63993D", "#8B5CF6", "#0EA5E9", "#C2793C", "#B23A8C"];
function colorPila(index) {
  return PALETA_PILAS[index % PALETA_PILAS.length];
}

// ---------------------------------------------------------------- Confirmación genérica
const modalConfirm = document.getElementById("modal-confirm");
function pedirConfirmacion(mensaje) {
  return new Promise((resolve) => {
    document.getElementById("confirm-mensaje").textContent = mensaje;
    modalConfirm.classList.add("open");

    const aceptar = document.getElementById("confirm-aceptar");
    const cancelar = document.getElementById("confirm-cancelar");

    function limpiar(resultado) {
      modalConfirm.classList.remove("open");
      aceptar.removeEventListener("click", onAceptar);
      cancelar.removeEventListener("click", onCancelar);
      resolve(resultado);
    }
    function onAceptar() { limpiar(true); }
    function onCancelar() { limpiar(false); }

    aceptar.addEventListener("click", onAceptar);
    cancelar.addEventListener("click", onCancelar);
  });
}

// ---------------------------------------------------------------- Tabs
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("view-" + btn.dataset.view).classList.add("active");
  });
});

// ============================================================================
// INVENTARIO
// ============================================================================
function renderCajas() {
  const term = normaliza(document.getElementById("buscar-inventario").value.trim());
  const lista = document.getElementById("lista-cajas");
  document.getElementById("conteo-cajas").textContent = cajas.length;

  if (!cajas.length) {
    lista.innerHTML = `<div class="empty-state"><span class="glyph">📦</span>Todavía no hay cajas registradas. Toca "+" para agregar la primera.</div>`;
    return;
  }

  const filtradas = term
    ? cajas.filter((c) =>
        [c.numero, c.nombre, c.categoria, c.ubicacion, c.contenido]
          .map(normaliza)
          .some((v) => v.includes(term))
      )
    : cajas;

  if (term && !filtradas.length) {
    lista.innerHTML = `<div class="empty-state"><span class="glyph">🔍</span>No encontramos ninguna caja que coincida con "${document.getElementById("buscar-inventario").value}".</div>`;
    return;
  }

  lista.innerHTML = cajas
    .map((c) => {
      const esMatch = term && [c.numero, c.nombre, c.categoria, c.ubicacion, c.contenido].map(normaliza).some((v) => v.includes(term));
      const esDim = term && !esMatch;
      const pila = pilas.find((p) => p.id === c.pilaId);
      let ubicacionTexto;
      if (pila) {
        ubicacionTexto = `${pila.nombre}${c.nivel ? ", nivel " + c.nivel : ""}`;
        if (c.ubicacion) ubicacionTexto += ` · ${c.ubicacion}`;
      } else {
        ubicacionTexto = c.ubicacion || "Sin pila asignada";
      }
      return `
      <div class="caja-card ${esMatch ? "match" : ""} ${esDim ? "dim" : ""}" data-id="${c.id}">
        <div class="caja-card-head">
          <div class="caja-num">${c.numero || "—"}</div>
          <div class="caja-info">
            <div class="nombre">${c.nombre || "Sin nombre"}</div>
            <div class="ubicacion">${ubicacionTexto}</div>
          </div>
          ${c.categoria ? `<span class="caja-tag">${c.categoria}</span>` : ""}
        </div>
        ${c.contenido ? `<div class="caja-contenido">${c.contenido}</div>` : ""}
        ${
          Array.isArray(c.items) && c.items.length
            ? `<div class="caja-items">${c.items.map((it) => `<span class="item-chip"><b>${it.cantidad}</b> ${it.nombre}</span>`).join("")}</div>`
            : ""
        }
        <div class="caja-actions">
          <button data-action="editar" data-id="${c.id}">Editar</button>
          <button data-action="eliminar" data-id="${c.id}" class="danger">Eliminar</button>
        </div>
      </div>`;
    })
    .join("");
}

document.getElementById("buscar-inventario").addEventListener("input", renderCajas);

document.getElementById("lista-cajas").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  const caja = cajas.find((c) => c.id === id);
  if (!caja) return;

  if (btn.dataset.action === "editar") abrirModalCaja(caja);
  if (btn.dataset.action === "eliminar") {
    pedirConfirmacion(`¿Eliminar la caja "${caja.nombre || caja.numero}"? Esta acción no se puede deshacer.`).then((ok) => {
      if (ok) db.collection("cajas").doc(id).delete().then(() => toast("Caja eliminada"));
    });
  }
});

// ---------------------------------------------------------------- Modal caja
const modalCaja = document.getElementById("modal-caja");

function poblarSelectPilas() {
  const sel = document.getElementById("caja-pila");
  const actual = sel.value;
  sel.innerHTML =
    `<option value="">Sin asignar</option>` +
    pilas.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join("");
  sel.value = actual;
}

function filaItem(item) {
  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `
    <input type="text" class="item-nombre" placeholder="Ej: hamis" value="${item ? item.nombre.replace(/"/g, "&quot;") : ""}">
    <input type="number" class="item-cantidad" min="0" step="1" value="${item ? item.cantidad : 1}">
    <button type="button" title="Quitar ítem">✕</button>`;
  row.querySelector("button").addEventListener("click", () => row.remove());
  return row;
}

document.getElementById("btn-agregar-item").addEventListener("click", () => {
  document.getElementById("items-editor").appendChild(filaItem(null));
});

function leerItemsDelEditor() {
  return Array.from(document.querySelectorAll("#items-editor .item-row"))
    .map((row) => ({
      nombre: row.querySelector(".item-nombre").value.trim(),
      cantidad: parseInt(row.querySelector(".item-cantidad").value, 10) || 0
    }))
    .filter((it) => it.nombre);
}

function abrirModalCaja(caja) {
  poblarSelectPilas();
  document.getElementById("modal-caja-titulo").textContent = caja ? "Editar caja" : "Nueva caja";
  document.getElementById("caja-id").value = caja ? caja.id : "";
  document.getElementById("caja-numero").value = caja ? caja.numero || "" : "";
  document.getElementById("caja-nombre").value = caja ? caja.nombre || "" : "";
  document.getElementById("caja-categoria").value = caja ? caja.categoria || "" : "";
  document.getElementById("caja-pila").value = caja ? caja.pilaId || "" : "";
  document.getElementById("caja-nivel").value = caja && caja.nivel ? caja.nivel : "";
  document.getElementById("caja-ubicacion").value = caja ? caja.ubicacion || "" : "";
  document.getElementById("caja-contenido").value = caja ? caja.contenido || "" : "";

  const editor = document.getElementById("items-editor");
  editor.innerHTML = "";
  const items = caja && Array.isArray(caja.items) ? caja.items : [];
  if (items.length) {
    items.forEach((it) => editor.appendChild(filaItem(it)));
  } else {
    editor.appendChild(filaItem(null));
  }

  modalCaja.classList.add("open");
}

function cerrarModalCaja() {
  modalCaja.classList.remove("open");
}

document.getElementById("fab-nueva-caja").addEventListener("click", () => abrirModalCaja(null));
document.getElementById("modal-caja-cancelar").addEventListener("click", cerrarModalCaja);
modalCaja.addEventListener("click", (e) => {
  if (e.target === modalCaja) cerrarModalCaja();
});

document.getElementById("modal-caja-guardar").addEventListener("click", () => {
  const id = document.getElementById("caja-id").value;
  const nivelVal = document.getElementById("caja-nivel").value;
  const data = {
    numero: document.getElementById("caja-numero").value.trim(),
    nombre: document.getElementById("caja-nombre").value.trim(),
    categoria: document.getElementById("caja-categoria").value.trim(),
    pilaId: document.getElementById("caja-pila").value || "",
    nivel: nivelVal ? parseInt(nivelVal, 10) : null,
    ubicacion: document.getElementById("caja-ubicacion").value.trim(),
    contenido: document.getElementById("caja-contenido").value.trim(),
    items: leerItemsDelEditor(),
    actualizado: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (!data.nombre && !data.numero) {
    toast("Ponle al menos un número o nombre a la caja");
    return;
  }

  const ref = id ? db.collection("cajas").doc(id) : db.collection("cajas").doc();
  ref.set(data, { merge: true }).then(() => {
    toast(id ? "Caja actualizada" : "Caja creada");
    cerrarModalCaja();
  });
});

// ============================================================================
// GESTIÓN DE PILAS
// ============================================================================
document.getElementById("toggle-pilas-manager").addEventListener("click", () => {
  document.getElementById("pilas-manager-body").classList.toggle("open");
});

document.getElementById("btn-agregar-pila").addEventListener("click", () => {
  const nombreInput = document.getElementById("nueva-pila-nombre");
  const nombre = nombreInput.value.trim();
  if (!nombre) {
    toast("Ponle un nombre a la pila");
    return;
  }
  const col = parseInt(document.getElementById("nueva-pila-col").value, 10) || 1;
  const row = parseInt(document.getElementById("nueva-pila-row").value, 10) || 1;
  const w = parseInt(document.getElementById("nueva-pila-w").value, 10) || 1;
  const h = parseInt(document.getElementById("nueva-pila-h").value, 10) || 1;

  db.collection("pilas")
    .add({ nombre, col, row, w, h, creado: firebase.firestore.FieldValue.serverTimestamp() })
    .then(() => {
      nombreInput.value = "";
      toast("Pila creada");
    });
});

function renderListaPilasAdmin() {
  const el = document.getElementById("lista-pilas-admin");
  if (!pilas.length) {
    el.innerHTML = `<div class="pila-admin-row">Todavía no creas ninguna pila.</div>`;
    return;
  }
  el.innerHTML = pilas
    .map(
      (p) => `
      <div class="pila-admin-row" data-id="${p.id}">
        <span class="pila-admin-nombre">${p.nombre}</span>
        <div class="pila-admin-pos">
          <label>Col <input type="number" min="1" max="5" class="pos-col" value="${p.col || 1}"></label>
          <label>Fila <input type="number" min="1" max="6" class="pos-row" value="${p.row || 1}"></label>
          <label>Ancho <input type="number" min="1" max="5" class="pos-w" value="${p.w || 1}"></label>
          <label>Alto <input type="number" min="1" max="6" class="pos-h" value="${p.h || 1}"></label>
        </div>
        <button class="pila-eliminar" data-id="${p.id}">Eliminar</button>
      </div>`
    )
    .join("");
}

document.getElementById("lista-pilas-admin").addEventListener("change", (e) => {
  const fila = e.target.closest(".pila-admin-row[data-id]");
  if (!fila || !e.target.matches(".pos-col, .pos-row, .pos-w, .pos-h")) return;
  const id = fila.dataset.id;
  db.collection("pilas").doc(id).update({
    col: parseInt(fila.querySelector(".pos-col").value, 10) || 1,
    row: parseInt(fila.querySelector(".pos-row").value, 10) || 1,
    w: parseInt(fila.querySelector(".pos-w").value, 10) || 1,
    h: parseInt(fila.querySelector(".pos-h").value, 10) || 1
  }).then(() => toast("Posición actualizada"));
});

document.getElementById("lista-pilas-admin").addEventListener("click", (e) => {
  const btn = e.target.closest("button.pila-eliminar");
  if (!btn) return;
  const pila = pilas.find((p) => p.id === btn.dataset.id);
  const enUso = cajas.some((c) => c.pilaId === btn.dataset.id);
  const aviso = enUso
    ? `Hay cajas asignadas a "${pila.nombre}". Si la eliminas, esas cajas quedan sin pila. ¿Eliminar igual?`
    : `¿Eliminar la pila "${pila.nombre}"?`;
  pedirConfirmacion(aviso).then((ok) => {
    if (ok) db.collection("pilas").doc(btn.dataset.id).delete().then(() => toast("Pila eliminada"));
  });
});

// ============================================================================
// PLANO — vista visual tipo planta, con posición aproximada de cada pila
// ============================================================================
function renderPlano() {
  const term = normaliza(document.getElementById("buscar-mapa").value.trim());
  const grid = document.getElementById("plano-grid");

  const conPosicion = pilas;
  if (!conPosicion.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;grid-row:1/-1;"><span class="glyph">🗺️</span>Crea pilas en "⚙ Gestionar pilas" y dales una posición para ver el plano.</div>`;
    return;
  }

  grid.innerHTML = conPosicion
    .map((p, i) => {
      const cajasPila = cajas.filter((c) => c.pilaId === p.id);
      const algunMatch = term ? cajasPila.some((c) => cajaCoincide(c, term)) : false;
      const dim = term && !algunMatch;
      const col = Math.min(5, Math.max(1, p.col || 1));
      const row = Math.min(6, Math.max(1, p.row || 1));
      const w = Math.max(1, Math.min(6 - col, p.w || 1));
      const h = Math.max(1, Math.min(7 - row, p.h || 1));
      return `
        <div class="plano-tile ${term && algunMatch ? "match" : ""} ${dim ? "dim" : ""}"
             style="grid-column:${col} / span ${w}; grid-row:${row} / span ${h}; background:${colorPila(i)};"
             data-id="${p.id}">
          ${p.nombre}
        </div>`;
    })
    .join("");
}

document.getElementById("plano-grid").addEventListener("click", (e) => {
  const tile = e.target.closest(".plano-tile[data-id]");
  if (!tile) return;
  const bloque = document.getElementById("torre-" + tile.dataset.id);
  if (bloque) bloque.scrollIntoView({ behavior: "smooth", block: "center" });
});

// ============================================================================
// MAPA — torres por pila (detalle debajo del plano)
// ============================================================================
function renderMapa() {
  const term = normaliza(document.getElementById("buscar-mapa").value.trim());
  const cont = document.getElementById("mapa-contenido");

  if (!cajas.length) {
    cont.innerHTML = `<div class="empty-state"><span class="glyph">🗺️</span>Agrega cajas en Inventario para verlas aquí.</div>`;
    return;
  }

  const bloques = [];

  // Si hay búsqueda, mostramos primero las pilas que tienen alguna coincidencia
  // (así no hay que bajar por todas las pilas para llegar a la que buscas).
  const pilasOrdenadas = term
    ? [...pilas].sort((a, b) => {
        const matchA = cajas.some((c) => c.pilaId === a.id && cajaCoincide(c, term)) ? 0 : 1;
        const matchB = cajas.some((c) => c.pilaId === b.id && cajaCoincide(c, term)) ? 0 : 1;
        return matchA - matchB;
      })
    : pilas;

  pilasOrdenadas.forEach((pila) => {
    const cajasPila = cajas.filter((c) => c.pilaId === pila.id);
    const maxNivel = Math.max(1, ...cajasPila.map((c) => c.nivel || 1));
    const algunMatch = term ? cajasPila.some((c) => cajaCoincide(c, term)) : true;

    let torreHtml = "";
    for (let n = 1; n <= maxNivel; n++) {
      const c = cajasPila.find((x) => x.nivel === n);
      if (c) {
        const match = cajaCoincide(c, term);
        const dim = term && !match;
        torreHtml += `
          <div class="nivel-slot">
            <span class="nivel-num">${n}</span>
            <div class="nivel-caja ${match ? "match" : ""} ${dim ? "dim" : ""}">
              <span><span class="n">${c.numero || "—"}</span> ${c.nombre || ""}</span>
            </div>
          </div>`;
      } else {
        torreHtml += `
          <div class="nivel-slot">
            <span class="nivel-num">${n}</span>
            <div class="nivel-vacio">vacío</div>
          </div>`;
      }
    }

    bloques.push(`
      <div class="pila-bloque ${term && !algunMatch ? "dim" : ""}" id="torre-${pila.id}">
        <div class="pila-titulo"><span class="glyph">▤</span>${pila.nombre} <span style="opacity:.5">(${cajasPila.length} caja${cajasPila.length === 1 ? "" : "s"})</span></div>
        <div class="pila-torre">${torreHtml}</div>
      </div>`);
  });

  // Cajas sin pila asignada
  const sinPila = cajas.filter((c) => !c.pilaId || !pilas.some((p) => p.id === c.pilaId));
  if (sinPila.length) {
    const algunMatch = term ? sinPila.some((c) => cajaCoincide(c, term)) : true;
    const items = sinPila
      .map((c) => {
        const match = cajaCoincide(c, term);
        const dim = term && !match;
        return `
          <div class="nivel-slot">
            <span class="nivel-num">·</span>
            <div class="nivel-caja ${match ? "match" : ""} ${dim ? "dim" : ""}">
              <span><span class="n">${c.numero || "—"}</span> ${c.nombre || ""}</span>
            </div>
          </div>`;
      })
      .join("");
    bloques.push(`
      <div class="pila-bloque ${term && !algunMatch ? "dim" : ""}">
        <div class="pila-titulo"><span class="glyph">?</span>Sin ubicar</div>
        <div class="pila-torre" style="flex-direction:column;">${items}</div>
      </div>`);
  }

  if (!pilas.length && !sinPila.length) {
    cont.innerHTML = `<div class="empty-state"><span class="glyph">🗺️</span>Crea tu primera pila en "⚙ Gestionar pilas" y asigna cajas a un nivel para verlas aquí.</div>`;
    return;
  }

  cont.innerHTML = bloques.join("");
}

document.getElementById("buscar-mapa").addEventListener("input", () => {
  renderMapa();
  renderPlano();
});

// ============================================================================
// MOVIMIENTOS
// ============================================================================

// ---------------------------------------------------------------- Selects de caja/ítem
function poblarSelectCajaMov() {
  const sel = document.getElementById("mov-caja");
  const actual = sel.value;
  sel.innerHTML =
    `<option value="">Selecciona una caja…</option>` +
    cajas.map((c) => `<option value="${c.id}">${c.numero ? c.numero + " - " : ""}${c.nombre || "Sin nombre"}</option>`).join("");
  sel.value = actual;
}

function poblarSelectItemMov() {
  const selCaja = document.getElementById("mov-caja");
  const selItem = document.getElementById("mov-item");
  const caja = cajas.find((c) => c.id === selCaja.value);
  const items = caja && Array.isArray(caja.items) ? caja.items.filter((it) => it.cantidad > 0) : [];

  if (!caja) {
    selItem.innerHTML = `<option value="">Elige primero una caja</option>`;
    selItem.disabled = true;
    return;
  }
  if (!items.length) {
    selItem.innerHTML = `<option value="">Esta caja no tiene ítems con stock</option>`;
    selItem.disabled = true;
    return;
  }
  selItem.disabled = false;
  selItem.innerHTML = items.map((it) => `<option value="${it.nombre}">${it.nombre} (quedan ${it.cantidad})</option>`).join("");
}

document.getElementById("mov-caja").addEventListener("change", poblarSelectItemMov);

// ---------------------------------------------------------------- Ajustar stock de una caja (transacción)
function ajustarStockCaja(cajaId, nombreItem, delta) {
  const ref = db.collection("cajas").doc(cajaId);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error("La caja ya no existe");
    const items = Array.isArray(doc.data().items) ? [...doc.data().items] : [];
    const idx = items.findIndex((it) => it.nombre === nombreItem);
    if (idx === -1) throw new Error("Ese ítem ya no está en la caja");
    const nuevaCantidad = (items[idx].cantidad || 0) + delta;
    if (nuevaCantidad < 0) throw new Error("No hay suficiente stock de ese ítem en la caja");
    items[idx] = { ...items[idx], cantidad: nuevaCantidad };
    tx.update(ref, { items });
  });
}

// ---------------------------------------------------------------- Registrar retiro nuevo
document.getElementById("mov-guardar").addEventListener("click", async () => {
  const registradoPor = document.getElementById("mov-registrador").value.trim();
  const persona = document.getElementById("mov-persona").value.trim();
  const cajaId = document.getElementById("mov-caja").value;
  const itemNombre = document.getElementById("mov-item").value;
  const cantidad = parseInt(document.getElementById("mov-cantidad").value, 10);

  if (!registradoPor || !persona || !cajaId || !itemNombre || !cantidad || cantidad < 1) {
    toast("Completa vestuarista, persona, caja, ítem y cantidad");
    return;
  }

  const caja = cajas.find((c) => c.id === cajaId);
  const cajaLabel = caja ? `${caja.numero ? caja.numero + " - " : ""}${caja.nombre || ""}` : "";

  try {
    await ajustarStockCaja(cajaId, itemNombre, -cantidad);
    await db.collection("movimientos").add({
      registradoPor,
      persona,
      cajaId,
      cajaLabel,
      itemNombre,
      cantidad,
      cantidadPendiente: cantidad,
      tipo: "retiro",
      estado: "pendiente",
      historial: [],
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast("Retiro registrado");
    document.getElementById("mov-persona").value = "";
    document.getElementById("mov-cantidad").value = "";
  } catch (e) {
    toast(e.message || "No se pudo registrar el movimiento");
  }
});

// ---------------------------------------------------------------- Modal resolver (devolución / traspaso)
const modalResolver = document.getElementById("modal-resolver");
let resolverTipoActual = "devolucion";

function setResolverTipo(tipo) {
  resolverTipoActual = tipo;
  document.getElementById("resolver-btn-devolver").classList.toggle("on", tipo === "devolucion");
  document.getElementById("resolver-btn-traspaso").classList.toggle("on", tipo === "traspaso");
  document.getElementById("resolver-persona-destino-wrap").style.display = tipo === "traspaso" ? "block" : "none";
}
document.getElementById("resolver-btn-devolver").addEventListener("click", () => setResolverTipo("devolucion"));
document.getElementById("resolver-btn-traspaso").addEventListener("click", () => setResolverTipo("traspaso"));

function abrirModalResolver(movimiento) {
  document.getElementById("resolver-mov-id").value = movimiento.id;
  document.getElementById("resolver-cantidad").value = movimiento.cantidadPendiente;
  document.getElementById("resolver-cantidad").max = movimiento.cantidadPendiente;
  document.getElementById("resolver-persona-destino").value = "";
  document.getElementById("resolver-registrador").value = "";
  setResolverTipo("devolucion");
  modalResolver.classList.add("open");
}

document.getElementById("resolver-cancelar").addEventListener("click", () => modalResolver.classList.remove("open"));
modalResolver.addEventListener("click", (e) => {
  if (e.target === modalResolver) modalResolver.classList.remove("open");
});

document.getElementById("resolver-guardar").addEventListener("click", async () => {
  const movId = document.getElementById("resolver-mov-id").value;
  const movimiento = movimientos.find((m) => m.id === movId);
  const cantidad = parseInt(document.getElementById("resolver-cantidad").value, 10);
  const registrador = document.getElementById("resolver-registrador").value.trim();
  const personaDestino = document.getElementById("resolver-persona-destino").value.trim();

  if (!movimiento) return;
  if (!registrador) {
    toast("Falta el nombre del vestuarista que registra el cambio");
    return;
  }
  if (!cantidad || cantidad < 1 || cantidad > movimiento.cantidadPendiente) {
    toast(`La cantidad debe ser entre 1 y ${movimiento.cantidadPendiente}`);
    return;
  }
  if (resolverTipoActual === "traspaso" && !personaDestino) {
    toast("Falta el nombre de quien recibe la prenda");
    return;
  }

  const nuevoPendiente = movimiento.cantidadPendiente - cantidad;
  const nuevoEstado = nuevoPendiente === 0 ? "devuelto" : "parcial";
  const entradaHistorial =
    resolverTipoActual === "devolucion"
      ? { tipo: "devolucion", cantidad, registradoPor: registrador, fecha: new Date().toISOString() }
      : { tipo: "traspaso", cantidad, hacia: personaDestino, registradoPor: registrador, fecha: new Date().toISOString() };

  try {
    if (resolverTipoActual === "devolucion") {
      await ajustarStockCaja(movimiento.cajaId, movimiento.itemNombre, cantidad);
    }

    await db.collection("movimientos").doc(movId).update({
      cantidadPendiente: nuevoPendiente,
      estado: nuevoEstado,
      historial: firebase.firestore.FieldValue.arrayUnion(entradaHistorial)
    });

    if (resolverTipoActual === "traspaso") {
      await db.collection("movimientos").add({
        registradoPor: registrador,
        persona: personaDestino,
        cajaId: movimiento.cajaId,
        cajaLabel: movimiento.cajaLabel,
        itemNombre: movimiento.itemNombre,
        cantidad,
        cantidadPendiente: cantidad,
        tipo: "retiro",
        estado: "pendiente",
        historial: [{ tipo: "traspaso-recibido", cantidad, desde: movimiento.persona, registradoPor: registrador, fecha: new Date().toISOString() }],
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    toast("Movimiento actualizado");
    modalResolver.classList.remove("open");
  } catch (e) {
    toast(e.message || "No se pudo actualizar el movimiento");
  }
});

// ---------------------------------------------------------------- Render historial
function renderMovimientos() {
  const lista = document.getElementById("lista-movimientos");
  document.getElementById("conteo-mov").textContent = movimientos.length;

  if (!movimientos.length) {
    lista.innerHTML = `<div class="empty-state"><span class="glyph">🔄</span>Sin movimientos todavía.</div>`;
    return;
  }

  lista.innerHTML = movimientos
    .map((m) => {
      const estado = m.estado || "pendiente";
      const historialHtml = (m.historial || [])
        .map((h) => {
          if (h.tipo === "devolucion") return `<div>↩ Devolvió ${h.cantidad} · registró ${h.registradoPor} · ${h.fecha ? new Date(h.fecha).toLocaleDateString("es-CL") : ""}</div>`;
          if (h.tipo === "traspaso") return `<div>➜ Se lo pasó a ${h.hacia} (${h.cantidad}) · registró ${h.registradoPor} · ${h.fecha ? new Date(h.fecha).toLocaleDateString("es-CL") : ""}</div>`;
          if (h.tipo === "traspaso-recibido") return `<div>⇐ Recibido de ${h.desde} (${h.cantidad})</div>`;
          return "";
        })
        .join("");

      return `
      <div class="mov-item">
        <div class="mov-dot ${m.tipo}"></div>
        <div class="mov-body">
          <div class="persona">
            ${m.persona} · ${m.cantidad} ${m.itemNombre}
            <span class="estado-badge ${estado}">${estado}</span>
          </div>
          <div class="detalle">Caja: ${m.cajaLabel || "—"} · registró ${m.registradoPor || "—"}</div>
          <div class="fecha">${fechaLegible(m.timestamp)}</div>
          ${historialHtml ? `<div class="mov-sub-historial">${historialHtml}</div>` : ""}
          ${estado !== "devuelto" ? `<button class="btn-resolver" data-id="${m.id}">Actualizar (devolvió / traspasó)</button>` : ""}
        </div>
      </div>`;
    })
    .join("");
}

document.getElementById("lista-movimientos").addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-resolver");
  if (!btn) return;
  const movimiento = movimientos.find((m) => m.id === btn.dataset.id);
  if (movimiento) abrirModalResolver(movimiento);
});

// ============================================================================
// LISTENERS FIRESTORE (tiempo real)
// ============================================================================
db.collection("cajas")
  .orderBy("numero")
  .onSnapshot(
    (snap) => {
      cajas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderCajas();
      renderMapa();
      renderPlano();
      poblarSelectCajaMov();
      poblarSelectItemMov();
    },
    (err) => {
      console.error(err);
      document.getElementById("lista-cajas").innerHTML =
        `<div class="empty-state"><span class="glyph">⚠️</span>No se pudo conectar a Firebase. Revisa js/firebase-config.js.</div>`;
    }
  );

db.collection("movimientos")
  .orderBy("timestamp", "desc")
  .limit(50)
  .onSnapshot(
    (snap) => {
      movimientos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderMovimientos();
    },
    (err) => console.error(err)
  );

db.collection("pilas")
  .orderBy("creado")
  .onSnapshot(
    (snap) => {
      pilas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderListaPilasAdmin();
      renderMapa();
      renderPlano();
      renderCajas();
    },
    (err) => console.error(err)
  );
