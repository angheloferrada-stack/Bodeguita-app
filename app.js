// ==========================================================================
// Bodega Folclor — lógica de la app
// Requiere que js/firebase-config.js ya haya corrido firebase.initializeApp()
// y dejado disponible la variable global `db` (Firestore).
// ==========================================================================

let cajas = [];
let movimientos = [];
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
      return `
      <div class="caja-card ${esMatch ? "match" : ""} ${esDim ? "dim" : ""}" data-id="${c.id}">
        <div class="caja-card-head">
          <div class="caja-num">${c.numero || "—"}</div>
          <div class="caja-info">
            <div class="nombre">${c.nombre || "Sin nombre"}</div>
            <div class="ubicacion">${c.ubicacion || "Ubicación no registrada"}</div>
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

function abrirModalCaja(caja) {
  document.getElementById("modal-caja-titulo").textContent = caja ? "Editar caja" : "Nueva caja";
  document.getElementById("caja-id").value = caja ? caja.id : "";
  document.getElementById("caja-numero").value = caja ? caja.numero || "" : "";
  document.getElementById("caja-nombre").value = caja ? caja.nombre || "" : "";
  document.getElementById("caja-categoria").value = caja ? caja.categoria || "" : "";
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
  const data = {
    numero: document.getElementById("caja-numero").value.trim(),
    nombre: document.getElementById("caja-nombre").value.trim(),
    categoria: document.getElementById("caja-categoria").value.trim(),
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
// MAPA
// ============================================================================
function renderMapa() {
  const term = normaliza(document.getElementById("buscar-mapa").value.trim());
  const grid = document.getElementById("mapa-grid");

  if (!cajas.length) {
    grid.innerHTML = `<div class="empty-state"><span class="glyph">🗺️</span>Agrega cajas en Inventario para verlas aquí.</div>`;
    return;
  }

  grid.innerHTML = cajas
    .map((c) => {
      const campos = [c.numero, c.nombre, c.categoria, c.ubicacion, c.contenido].map(normaliza);
      const esMatch = term && campos.some((v) => v.includes(term));
      const esDim = term && !esMatch;
      return `<div class="mapa-tile ${esMatch ? "match" : ""} ${esDim ? "dim" : ""}" title="${c.nombre || ""} — ${c.ubicacion || ""}">${c.numero || "?"}</div>`;
    })
    .join("");
}

document.getElementById("buscar-mapa").addEventListener("input", renderMapa);

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
