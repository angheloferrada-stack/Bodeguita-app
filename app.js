// ==========================================================================
// Bodega Folclor — lógica de la app
// Requiere que js/firebase-config.js ya haya corrido firebase.initializeApp()
// y dejado disponible la variable global `db` (Firestore).
// ==========================================================================

let cajas = [];
let movimientos = [];
let pilas = [];
let tipoMovActual = "retiro";

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
    if (confirm(`¿Eliminar la caja "${caja.nombre || caja.numero}"? Esta acción no se puede deshacer.`)) {
      db.collection("cajas").doc(id).delete().then(() => toast("Caja eliminada"));
    }
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
          <label>Col <input type="number" min="1" max="6" class="pos-col" value="${p.col || 1}"></label>
          <label>Fila <input type="number" min="1" max="8" class="pos-row" value="${p.row || 1}"></label>
          <label>Ancho <input type="number" min="1" max="6" class="pos-w" value="${p.w || 1}"></label>
          <label>Alto <input type="number" min="1" max="8" class="pos-h" value="${p.h || 1}"></label>
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
  if (confirm(aviso)) {
    db.collection("pilas").doc(btn.dataset.id).delete().then(() => toast("Pila eliminada"));
  }
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
      const col = Math.min(6, Math.max(1, p.col || 1));
      const row = Math.min(8, Math.max(1, p.row || 1));
      const w = Math.max(1, Math.min(7 - col, p.w || 1));
      const h = Math.max(1, Math.min(9 - row, p.h || 1));
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

  pilas.forEach((pila) => {
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
function setTipoMov(tipo) {
  tipoMovActual = tipo;
  document.getElementById("btn-retiro").classList.toggle("on", tipo === "retiro");
  document.getElementById("btn-devolucion").classList.toggle("on", tipo === "devolucion");
}

document.getElementById("btn-retiro").addEventListener("click", () => setTipoMov("retiro"));
document.getElementById("btn-devolucion").addEventListener("click", () => setTipoMov("devolucion"));

document.getElementById("mov-guardar").addEventListener("click", () => {
  const persona = document.getElementById("mov-persona").value.trim();
  const detalle = document.getElementById("mov-detalle").value.trim();
  const cajaRef = document.getElementById("mov-caja").value.trim();

  if (!persona || !detalle) {
    toast("Falta el nombre o el detalle del movimiento");
    return;
  }

  db.collection("movimientos")
    .add({
      persona,
      detalle,
      caja: cajaRef,
      tipo: tipoMovActual,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
      toast("Movimiento registrado");
      document.getElementById("mov-persona").value = "";
      document.getElementById("mov-detalle").value = "";
      document.getElementById("mov-caja").value = "";
    });
});

function renderMovimientos() {
  const lista = document.getElementById("lista-movimientos");
  document.getElementById("conteo-mov").textContent = movimientos.length;

  if (!movimientos.length) {
    lista.innerHTML = `<div class="empty-state"><span class="glyph">🔄</span>Sin movimientos todavía.</div>`;
    return;
  }

  lista.innerHTML = movimientos
    .map(
      (m) => `
      <div class="mov-item">
        <div class="mov-dot ${m.tipo}"></div>
        <div class="mov-body">
          <div class="persona">${m.persona}${m.caja ? ` · caja ${m.caja}` : ""}</div>
          <div class="detalle">${m.tipo === "retiro" ? "Se llevó" : "Devolvió"}: ${m.detalle}</div>
          <div class="fecha">${fechaLegible(m.timestamp)}</div>
        </div>
      </div>`
    )
    .join("");
}

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
