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
  const input = document.getElementById("nueva-pila-nombre");
  const nombre = input.value.trim();
  if (!nombre) {
    toast("Ponle un nombre a la pila");
    return;
  }
  db.collection("pilas")
    .add({ nombre, creado: firebase.firestore.FieldValue.serverTimestamp() })
    .then(() => {
      input.value = "";
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
      <div class="pila-admin-row">
        <span>${p.nombre}</span>
        <button data-id="${p.id}">Eliminar</button>
      </div>`
    )
    .join("");
}

document.getElementById("lista-pilas-admin").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-id]");
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
// MAPA — torres por pila
// ============================================================================
function renderMapa() {
  const term = normaliza(document.getElementById("buscar-mapa").value.trim());
  const cont = document.getElementById("mapa-contenido");

  if (!cajas.length) {
    cont.innerHTML = `<div class="empty-state"><span class="glyph">🗺️</span>Agrega cajas en Inventario para verlas aquí.</div>`;
    return;
  }

  function esMatch(c) {
    return term && [c.numero, c.nombre, c.categoria, c.ubicacion, c.contenido].map(normaliza).some((v) => v.includes(term));
  }

  const bloques = [];

  pilas.forEach((pila) => {
    const cajasPila = cajas.filter((c) => c.pilaId === pila.id);
    const maxNivel = Math.max(1, ...cajasPila.map((c) => c.nivel || 1));
    const algunMatch = term ? cajasPila.some(esMatch) : true;

    let torreHtml = "";
    for (let n = 1; n <= maxNivel; n++) {
      const c = cajasPila.find((x) => x.nivel === n);
      if (c) {
        const match = esMatch(c);
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
      <div class="pila-bloque ${term && !algunMatch ? "dim" : ""}">
        <div class="pila-titulo"><span class="glyph">▤</span>${pila.nombre} <span style="opacity:.5">(${cajasPila.length} caja${cajasPila.length === 1 ? "" : "s"})</span></div>
        <div class="pila-torre">${torreHtml}</div>
      </div>`);
  });

  // Cajas sin pila asignada
  const sinPila = cajas.filter((c) => !c.pilaId || !pilas.some((p) => p.id === c.pilaId));
  if (sinPila.length) {
    const algunMatch = term ? sinPila.some(esMatch) : true;
    const items = sinPila
      .map((c) => {
        const match = esMatch(c);
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

db.collection("pilas")
  .orderBy("creado")
  .onSnapshot(
    (snap) => {
      pilas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderListaPilasAdmin();
      renderMapa();
      renderCajas();
    },
    (err) => console.error(err)
  );
