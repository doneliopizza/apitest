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

function money(value) {

    return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0
    }).format(Number(value) || 0);
}

async function api(ruta) {

    const respuesta = await fetch(`${API_URL}${ruta}`, {
        method: "GET",
        headers: authHeaders()
    });

    if (!respuesta.ok) {

        if (manejarErrorAuth(respuesta.status)) {
            throw new Error("auth");
        }

        throw new Error(`HTTP ${respuesta.status}`);
    }

    return respuesta.json();
}


/* =========================================================
   FECHAS — helpers en horario LOCAL (no UTC)
   ========================================================= */

function fechaISO(d) {

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");

    return `${y}-${m}-${dia}`;
}

function hoy() {
    return new Date();
}


/* =========================================================
   ESTADO
   ========================================================= */

let rangoDesde = fechaISO(hoy());
let rangoHasta = fechaISO(hoy());
let tabActual = "resumen";


/* =========================================================
   RANGOS RÁPIDOS
   ========================================================= */

function calcularRango(tipo) {

    const ahora = hoy();

    if (tipo === "hoy") {

        return [fechaISO(ahora), fechaISO(ahora)];
    }

    if (tipo === "ayer") {

        const ayer = new Date(ahora);
        ayer.setDate(ayer.getDate() - 1);

        return [fechaISO(ayer), fechaISO(ayer)];
    }

    if (tipo === "semana") {

        const inicio = new Date(ahora);

        const diaSemana = (inicio.getDay() + 6) % 7; // lunes=0

        inicio.setDate(inicio.getDate() - diaSemana);

        return [fechaISO(inicio), fechaISO(ahora)];
    }

    if (tipo === "mes") {

        const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

        return [fechaISO(inicio), fechaISO(ahora)];
    }

    if (tipo === "anio") {

        const inicio = new Date(ahora.getFullYear(), 0, 1);

        return [fechaISO(inicio), fechaISO(ahora)];
    }

    return [fechaISO(ahora), fechaISO(ahora)];
}


/* =========================================================
   INICIALIZAR SELECTOR DE RANGO
   ========================================================= */

function inicializarRango() {

    document.getElementById("rangoDesde").value = rangoDesde;
    document.getElementById("rangoHasta").value = rangoHasta;

    document.querySelectorAll(".rango-btn").forEach(btn => {

        btn.addEventListener("click", () => {

            document.querySelectorAll(".rango-btn").forEach(b => {
                b.classList.toggle("active", b === btn);
            });

            const [desde, hasta] = calcularRango(btn.dataset.rango);

            rangoDesde = desde;
            rangoHasta = hasta;

            document.getElementById("rangoDesde").value = desde;
            document.getElementById("rangoHasta").value = hasta;

            cargarTabActual();
        });
    });

    ["rangoDesde", "rangoHasta"].forEach(id => {

        document.getElementById(id).addEventListener("change", () => {

            rangoDesde = document.getElementById("rangoDesde").value || rangoDesde;
            rangoHasta = document.getElementById("rangoHasta").value || rangoHasta;

            document.querySelectorAll(".rango-btn").forEach(b => b.classList.remove("active"));

            cargarTabActual();
        });
    });
}


/* =========================================================
   TABS
   ========================================================= */

function inicializarTabs() {

    document.querySelectorAll("[data-rtab]").forEach(btn => {

        btn.addEventListener("click", () => {

            document.querySelectorAll("[data-rtab]").forEach(b => {
                b.classList.toggle("active", b === btn);
            });

            tabActual = btn.dataset.rtab;

            document.getElementById("rtabResumen").style.display = tabActual === "resumen" ? "block" : "none";
            document.getElementById("rtabVentas").style.display = tabActual === "ventas" ? "block" : "none";
            document.getElementById("rtabGastos").style.display = tabActual === "gastos" ? "block" : "none";
            document.getElementById("rtabSegmentos").style.display = tabActual === "segmentos" ? "block" : "none";

            cargarTabActual();
        });
    });
}

function cargarTabActual() {

    if (tabActual === "resumen") cargarResumen();
    else if (tabActual === "ventas") cargarVentas();
    else if (tabActual === "gastos") cargarGastos();
    else if (tabActual === "segmentos") cargarSegmentos();
}


/* =========================================================
   RESUMEN (cards + gráfico + top productos)
   ========================================================= */

async function cargarResumen() {

    try {

        const [ventas, grafico, top] = await Promise.all([
            api(`/reportes/ventas?desde=${rangoDesde}&hasta=${rangoHasta}`),
            api(`/reportes/ventas-por-dia?desde=${rangoDesde}&hasta=${rangoHasta}`),
            api(`/reportes/top-productos?desde=${rangoDesde}&hasta=${rangoHasta}&limite=6`)
        ]);

        const gastosData = await api(`/reportes/gastos?desde=${rangoDesde}&hasta=${rangoHasta}`);

        renderCards(ventas.resumen, gastosData.total);
        renderGrafico(grafico);
        renderTopProductos(top);

    } catch (error) {

        console.error("ERROR CARGANDO RESUMEN:", error);
    }
}

function renderCards(resumenVentas, totalGastos) {

    const ganancia = resumenVentas.total - totalGastos;

    document.getElementById("reportesCards").innerHTML = `

        <div class="reportes-card acento">
            <div class="reportes-card-icon">💰</div>
            <div class="reportes-card-valor">${money(resumenVentas.total)}</div>
            <div class="reportes-card-label">Total vendido</div>
        </div>

        <div class="reportes-card">
            <div class="reportes-card-icon">🧾</div>
            <div class="reportes-card-valor">${resumenVentas.cantidad}</div>
            <div class="reportes-card-label">Pedidos</div>
        </div>

        <div class="reportes-card">
            <div class="reportes-card-icon">🎯</div>
            <div class="reportes-card-valor">${money(resumenVentas.promedio)}</div>
            <div class="reportes-card-label">Ticket promedio</div>
        </div>

        <div class="reportes-card">
            <div class="reportes-card-icon">📉</div>
            <div class="reportes-card-valor">${money(totalGastos)}</div>
            <div class="reportes-card-label">Gastos</div>
        </div>

        <div class="reportes-card ${ganancia >= 0 ? "positivo" : "negativo"}">
            <div class="reportes-card-icon">${ganancia >= 0 ? "📈" : "📉"}</div>
            <div class="reportes-card-valor">${money(ganancia)}</div>
            <div class="reportes-card-label">Ganancia neta</div>
        </div>
    `;
}

function renderGrafico(datos) {

    const container = document.getElementById("reporteGraficoVentas");

    const totalRango = datos.reduce((s, d) => s + d.total, 0);

    document.getElementById("reporteTotalRango").textContent = money(totalRango);

    if (!datos.length) {

        container.innerHTML = `<div class="reporte-vacio">Sin ventas en este rango.</div>`;

        return;
    }

    const maximo = Math.max(...datos.map(d => d.total), 1);

    container.innerHTML = datos.map(d => {

        const fecha = new Date(d.fecha + "T12:00:00");

        const diaTexto = datos.length <= 14
            ? fecha.toLocaleDateString("es-AR", { weekday: "short" })
            : fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });

        const alturaPct = Math.max(4, Math.round((d.total / maximo) * 100));

        return `
            <div class="reporte-barra-col">
                <span class="reporte-barra-valor">${d.total > 0 ? money(d.total) : ""}</span>
                <div class="reporte-barra" style="height:${alturaPct}%;" title="${escapeHtml(diaTexto)}: ${money(d.total)}"></div>
                <span class="reporte-barra-dia">${escapeHtml(diaTexto)}</span>
            </div>
        `;
    }).join("");
}

function renderTopProductos(datos) {

    const container = document.getElementById("reporteTopProductos");

    if (!datos.length) {

        container.innerHTML = `<div class="reporte-vacio">Sin ventas en este rango.</div>`;

        return;
    }

    const maximo = Math.max(...datos.map(d => d.cantidad), 1);

    container.innerHTML = datos.map(d => {

        const anchoPct = Math.max(4, Math.round((d.cantidad / maximo) * 100));

        return `
            <div class="reporte-top-item">
                <div class="reporte-top-item-info">
                    <strong>${escapeHtml(d.nombre)}</strong>
                    <span>${d.cantidad}x · ${money(d.total)}</span>
                </div>
                <div class="reporte-top-barra-fondo">
                    <div class="reporte-top-barra" style="width:${anchoPct}%;"></div>
                </div>
            </div>
        `;
    }).join("");
}


/* =========================================================
   TABLA DE VENTAS
   ========================================================= */

async function cargarVentas() {

    try {

        const data = await api(`/reportes/ventas?desde=${rangoDesde}&hasta=${rangoHasta}`);

        renderResumenBar("ventasResumenBar", [
            { label: "Pedidos", valor: data.resumen.cantidad },
            { label: "Total", valor: money(data.resumen.total) },
            { label: "Promedio", valor: money(data.resumen.promedio) },
        ]);

        const tbody = document.getElementById("ventasTablaBody");

        if (!data.pedidos.length) {

            tbody.innerHTML = `<tr><td colspan="7" class="reportes-tabla-vacio">Sin ventas en este rango.</td></tr>`;

            return;
        }

        tbody.innerHTML = data.pedidos.map(p => `
            <tr>
                <td>#${escapeHtml(p.id)}</td>
                <td>${new Date(p.fecha).toLocaleString("es-AR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}</td>
                <td>${escapeHtml(p.cliente)}</td>
                <td>${escapeHtml(p.medio_pago)}</td>
                <td>${escapeHtml(p.tipo_entrega)}</td>
                <td>${escapeHtml(p.estado)}</td>
                <td>${money(p.total)}</td>
            </tr>
        `).join("");

    } catch (error) {

        console.error("ERROR CARGANDO VENTAS:", error);
    }
}


/* =========================================================
   TABLA DE GASTOS
   ========================================================= */

async function cargarGastos() {

    try {

        const data = await api(`/reportes/gastos?desde=${rangoDesde}&hasta=${rangoHasta}`);

        renderResumenBar("gastosResumenBar", [
            { label: "Gastos", valor: data.gastos.length },
            { label: "Total", valor: money(data.total) },
        ]);

        const tbody = document.getElementById("gastosTablaBody");

        if (!data.gastos.length) {

            tbody.innerHTML = `<tr><td colspan="5" class="reportes-tabla-vacio">Sin gastos en este rango.</td></tr>`;

            return;
        }

        tbody.innerHTML = data.gastos.map(g => `
            <tr>
                <td>${new Date(g.fecha).toLocaleString("es-AR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}</td>
                <td>${escapeHtml(g.tipo)}</td>
                <td>${escapeHtml(g.detalle || "—")}</td>
                <td>${escapeHtml(g.usuario)}</td>
                <td>${money(g.monto)}</td>
            </tr>
        `).join("");

    } catch (error) {

        console.error("ERROR CARGANDO GASTOS:", error);
    }
}

function renderResumenBar(containerId, chips) {

    document.getElementById(containerId).innerHTML = chips.map(c => `
        <span class="chip">${escapeHtml(c.label)}: <strong>${c.valor}</strong></span>
    `).join("");
}


/* =========================================================
   SEGMENTOS
   ========================================================= */

async function cargarSegmentos() {

    try {

        const data = await api(`/reportes/segmentos?desde=${rangoDesde}&hasta=${rangoHasta}`);

        renderSegmento("segMedioPago", data.por_medio_pago, "nombre");
        renderSegmento("segTipoEntrega", data.por_tipo_entrega, "nombre");
        renderSegmento("segRubro", data.por_rubro, "nombre");

    } catch (error) {

        console.error("ERROR CARGANDO SEGMENTOS:", error);
    }
}

function renderSegmento(containerId, datos, campoNombre) {

    const container = document.getElementById(containerId);

    if (!datos.length) {

        container.innerHTML = `<div class="reporte-vacio">Sin datos en este rango.</div>`;

        return;
    }

    const maximo = Math.max(...datos.map(d => d.total), 1);

    container.innerHTML = datos.map(d => {

        const anchoPct = Math.max(4, Math.round((d.total / maximo) * 100));

        return `
            <div class="reporte-top-item">
                <div class="reporte-top-item-info">
                    <strong>${escapeHtml(d[campoNombre])}</strong>
                    <span>${d.cantidad}x · ${money(d.total)}</span>
                </div>
                <div class="reporte-top-barra-fondo">
                    <div class="reporte-top-barra" style="width:${anchoPct}%;"></div>
                </div>
            </div>
        `;
    }).join("");
}


/* =========================================================
   INIT / DESTROY
   ========================================================= */

async function inicializar() {

    inicializarRango();
    inicializarTabs();

    await cargarResumen();
}

function destruir() {}

window.LightPOS = window.LightPOS || {};
window.LightPOS.reportes = {
    init: inicializar,
    destroy: destruir
};

})();
