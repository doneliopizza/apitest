(function () {

const API_URL = window.LIGHTPOS_API_URL;
const TOKEN = localStorage.getItem("lightpos_token");

if (!TOKEN) {
    window.location.href = "login.html";
}

function authHeaders() {
    return {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
    };
}

function manejarErrorAuth(status) {

    if (status === 401 || status === 403) {

        localStorage.removeItem("lightpos_token");
        localStorage.removeItem("lightpos_usuario");

        window.location.href = "login.html";

        return true;
    }

    return false;
}

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showToast(message) {

    const toast = document.getElementById("toast");

    if (!toast) {
        console.log(message);
        return;
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(window.toastTimer);

    window.toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2200);
}

function money(value) {

    return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0
    }).format(Number(value) || 0);
}

async function api(metodo, ruta, body) {

    const respuesta = await fetch(`${API_URL}${ruta}`, {
        method: metodo,
        headers: authHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined
    });

    if (!respuesta.ok) {

        if (manejarErrorAuth(respuesta.status)) {
            throw new Error("auth");
        }

        const data = await respuesta.json().catch(() => null);

        throw new Error(data?.detail || `HTTP ${respuesta.status}`);
    }

    return respuesta.json();
}


/* =========================================================
   ESTADO
   ========================================================= */

let aperturaActual = null;
let cajas = [];
let intervaloRefresco = null;

const INTERVALO_REFRESCO_MS = 15000;

const INTERVALO_MOV_MS = 0;


/* =========================================================
   CARGAR ESTADO
   ========================================================= */

async function cargarEstado() {

    try {

        const estado = await api("GET", "/cajas/estado");

        if (estado.abierta) {

            aperturaActual = estado;

            await cargarArqueo();

            mostrarCajaAbierta();

        } else {

            aperturaActual = null;

            await cargarCajasParaAbrir();

            mostrarCajaCerrada();
        }

    } catch (error) {

        console.error("ERROR CARGANDO ESTADO DE CAJA:", error);
    }
}

function mostrarCajaCerrada() {

    document.getElementById("cajaTitulo").textContent = "Caja cerrada";
    document.getElementById("cajaCerradaBox").style.display = "block";
    document.getElementById("cajaAbiertaBox").style.display = "none";
}

function mostrarCajaAbierta() {

    document.getElementById("cajaTitulo").textContent = "Caja abierta";
    document.getElementById("cajaCerradaBox").style.display = "none";
    document.getElementById("cajaAbiertaBox").style.display = "block";
}


/* =========================================================
   ABRIR CAJA
   ========================================================= */

async function cargarCajasParaAbrir() {

    cajas = await api("GET", "/cajas/");

    const select = document.getElementById("selectCaja");

    select.innerHTML = cajas
        .filter(c => c.activo)
        .map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`)
        .join("");
}

async function abrirCaja() {

    const cajaId = document.getElementById("selectCaja").value;

    if (!cajaId) {

        showToast("Creá o elegí una caja primero");

        return;
    }

    const monto = Number(
        document.getElementById("montoInicial").value || 0
    );

    try {

        await api("POST", `/cajas/${cajaId}/abrir`, {
            monto_inicial: monto
        });

        showToast("Caja abierta");

        await cargarEstado();

    } catch (error) {

        showToast(error.message || "No se pudo abrir la caja");
    }
}

async function crearCajaRapida() {

    const nombre = document.getElementById("nuevaCajaNombre").value.trim();

    if (!nombre) {

        showToast("Ingresá un nombre para la caja");

        return;
    }

    try {

        await api("POST", "/cajas/", { nombre });

        document.getElementById("nuevaCajaNombre").value = "";

        showToast("Caja creada");

        await cargarCajasParaAbrir();

    } catch (error) {

        showToast(error.message || "No se pudo crear la caja");
    }
}


/* =========================================================
   ARQUEO EN VIVO
   ========================================================= */

async function cargarArqueo() {

    if (!aperturaActual) return;

    try {

        const arqueo = await api(
            "GET",
            `/cajas/aperturas/${aperturaActual.apertura_id}/arqueo`
        );

        renderArqueo(arqueo);

    } catch (error) {

        console.error("ERROR CARGANDO ARQUEO:", error);
    }
}

function renderArqueo(arqueo) {

    document.getElementById("cajaNombreActual").textContent =
        arqueo.caja_nombre;

    const fecha = arqueo.fecha_apertura
        ? new Date(arqueo.fecha_apertura).toLocaleString("es-AR", {
            day: "2-digit", month: "2-digit",
            hour: "2-digit", minute: "2-digit"
        })
        : "—";

    document.getElementById("cajaAperturaInfo").textContent =
        `${arqueo.usuario_nombre} · abierta ${fecha}`;

    document.getElementById("resMontoInicial").textContent =
        money(arqueo.monto_inicial);

    document.getElementById("resEfectivoVentas").textContent =
        money(arqueo.efectivo_ventas);

    document.getElementById("resMovimientos").textContent =
        money(arqueo.total_movimientos);

    document.getElementById("resEsperado").textContent =
        money(arqueo.total_esperado);

    const ventasBox = document.getElementById("ventasPorMedio");

    ventasBox.innerHTML = arqueo.ventas_por_medio.length
        ? arqueo.ventas_por_medio.map(v => `
            <div class="caja-lista-item">
                <span>
                    ${escapeHtml(v.medio)}
                    <span class="muted">(${v.cantidad})</span>
                </span>
                <strong>${money(v.total)}</strong>
            </div>
        `).join("")
        : `<div class="caja-lista-vacio">Todavía no hay ventas en este turno.</div>`;

    const movBox = document.getElementById("movimientosLista");

    movBox.innerHTML = arqueo.movimientos.length
        ? arqueo.movimientos.map(m => `
            <div class="caja-lista-item">
                <span>${escapeHtml(m.tipo)}: ${escapeHtml(m.concepto || "")}</span>
                <strong>${money(m.monto)}</strong>
            </div>
        `).join("")
        : `<div class="caja-lista-vacio">Sin movimientos manuales todavía.</div>`;
}


/* =========================================================
   MOVIMIENTO MANUAL
   ========================================================= */

let tipoMovimientoActual = "INGRESO";

function abrirMovimientoModal() {

    tipoMovimientoActual = "INGRESO";

    document.querySelectorAll("[data-tipo-mov]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tipoMov === "INGRESO");
    });

    document.getElementById("movConcepto").value = "";
    document.getElementById("movMonto").value = "";

    document.getElementById("movimientoModal").style.display = "flex";
}

function cerrarMovimientoModal() {

    document.getElementById("movimientoModal").style.display = "none";
}

async function guardarMovimiento() {

    const monto = Number(document.getElementById("movMonto").value || 0);

    if (monto <= 0) {

        showToast("Ingresá un monto válido");

        return;
    }

    try {

        await api(
            "POST",
            `/cajas/aperturas/${aperturaActual.apertura_id}/movimiento`,
            {
                tipo: tipoMovimientoActual,
                concepto: document.getElementById("movConcepto").value.trim() || null,
                monto
            }
        );

        showToast(
            tipoMovimientoActual === "INGRESO"
                ? "Ingreso registrado"
                : "Egreso registrado"
        );

        cerrarMovimientoModal();

        await cargarArqueo();

    } catch (error) {

        showToast(error.message || "No se pudo registrar el movimiento");
    }
}


/* =========================================================
   CERRAR CAJA
   ========================================================= */

async function cerrarCaja() {

    const monto = document.getElementById("montoCierre").value;

    if (monto === "" || Number(monto) < 0) {

        showToast("Ingresá el monto contado real");

        return;
    }

    if (!confirm("¿Cerrar la caja? No vas a poder deshacerlo.")) {

        return;
    }

    try {

        const resultado = await api(
            "PUT",
            `/cajas/aperturas/${aperturaActual.apertura_id}/cerrar`,
            { monto_cierre: Number(monto) }
        );

        const diferencia = resultado.diferencia;

        showToast(
            diferencia === 0
                ? "Caja cerrada — sin diferencia"
                : `Caja cerrada — diferencia: ${money(diferencia)}`
        );

        await cargarEstado();

    } catch (error) {

        showToast(error.message || "No se pudo cerrar la caja");
    }
}


/* =========================================================
   TABS
   ========================================================= */

function inicializarTabsCajas() {

    document.querySelectorAll("[data-cajas-tab]").forEach(btn => {

        btn.addEventListener("click", () => {

            document.querySelectorAll("[data-cajas-tab]").forEach(b => {
                b.classList.toggle("active", b === btn);
            });

            const tab = btn.dataset.cajasTab;

            document.getElementById("tabCaja").style.display =
                tab === "caja" ? "block" : "none";

            document.getElementById("tabGastos").style.display =
                tab === "gastos" ? "block" : "none";

            if (tab === "gastos") {
                cargarGastos();
            }
        });
    });
}


/* =========================================================
   GASTOS
   ========================================================= */

async function cargarGastos() {

    try {

        const gastos = await api("GET", "/gastos/");

        renderGastos(gastos);

    } catch (error) {

        console.error("ERROR CARGANDO GASTOS:", error);
    }
}

function renderGastos(gastos) {

    const container = document.getElementById("gastosLista");

    if (!gastos.length) {

        container.innerHTML =
            `<div class="caja-lista-vacio">Todavía no cargaste ningún gasto.</div>`;

        return;
    }

    container.innerHTML = gastos.map(g => {

        const fecha = g.fecha
            ? new Date(g.fecha).toLocaleString("es-AR", {
                day: "2-digit", month: "2-digit",
                hour: "2-digit", minute: "2-digit"
            })
            : "";

        return `
            <div class="caja-lista-item">
                <span>
                    <strong>${escapeHtml(g.tipo)}</strong>
                    ${g.detalle ? " · " + escapeHtml(g.detalle) : ""}
                    <span class="muted"> · ${fecha}</span>
                </span>
                <strong>${money(g.monto)}</strong>
            </div>
        `;
    }).join("");
}

async function guardarGasto() {

    const tipo = document.getElementById("gastoTipo").value.trim();
    const detalle = document.getElementById("gastoDetalle").value.trim();
    const monto = Number(document.getElementById("gastoMonto").value || 0);

    if (!tipo) {
        showToast("Ingresá el tipo de gasto");
        return;
    }

    if (monto <= 0) {
        showToast("Ingresá un monto válido");
        return;
    }

    try {

        await api("POST", "/gastos/", {
            tipo,
            detalle: detalle || null,
            monto
        });

        document.getElementById("gastoTipo").value = "";
        document.getElementById("gastoDetalle").value = "";
        document.getElementById("gastoMonto").value = "";

        showToast("Gasto registrado");

        await cargarGastos();

    } catch (error) {

        showToast(error.message || "No se pudo registrar el gasto");
    }
}


/* =========================================================
   EVENTOS
   ========================================================= */

function inicializarEventos() {

    inicializarTabsCajas();

    document.getElementById("btnGuardarGasto")
        .addEventListener("click", guardarGasto);

    document.getElementById("btnAbrirCaja")
        .addEventListener("click", abrirCaja);

    document.getElementById("btnCrearCaja")
        .addEventListener("click", crearCajaRapida);

    document.getElementById("btnNuevoMovimiento")
        .addEventListener("click", abrirMovimientoModal);

    document.getElementById("movimientoModalCerrar")
        .addEventListener("click", cerrarMovimientoModal);

    document.getElementById("movimientoModalCancelar")
        .addEventListener("click", cerrarMovimientoModal);

    document.getElementById("movimientoModalGuardar")
        .addEventListener("click", guardarMovimiento);

    document.querySelectorAll("[data-tipo-mov]").forEach(btn => {

        btn.addEventListener("click", () => {

            tipoMovimientoActual = btn.dataset.tipoMov;

            document.querySelectorAll("[data-tipo-mov]").forEach(b => {
                b.classList.toggle("active", b === btn);
            });
        });
    });

    document.getElementById("btnCerrarCaja")
        .addEventListener("click", cerrarCaja);
}


/* =========================================================
   INIT / DESTROY
   ========================================================= */

async function inicializar() {

    inicializarEventos();

    await cargarEstado();

    intervaloRefresco = setInterval(cargarEstado, INTERVALO_REFRESCO_MS);
}

function destruir() {

    if (intervaloRefresco) {
        clearInterval(intervaloRefresco);
        intervaloRefresco = null;
    }
}

window.LightPOS = window.LightPOS || {};
window.LightPOS.cajas = {
    init: inicializar,
    destroy: destruir
};

})();
