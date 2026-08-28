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
   SALUDO + FECHA
   ========================================================= */

function renderSaludo() {

    const usuarioRaw = localStorage.getItem("lightpos_usuario");

    let nombre = "";

    try {

        const usuario = usuarioRaw ? JSON.parse(usuarioRaw) : null;

        nombre = usuario?.nombre ? `, ${usuario.nombre}` : "";

    } catch {}

    const hora = new Date().getHours();

    const saludo =
        hora < 12 ? "Buen día" :
        hora < 20 ? "Buenas tardes" :
        "Buenas noches";

    document.getElementById("homeSaludo").textContent =
        `${saludo}${nombre} 👋`;

    document.getElementById("homeFecha").textContent =
        new Date().toLocaleDateString("es-AR", {
            weekday: "long", day: "numeric", month: "long"
        });
}


/* =========================================================
   RESUMEN DE HOY
   ========================================================= */

async function cargarResumen() {

    try {

        const data = await api("/reportes/resumen-hoy");

        renderCards(data);
        renderMedios(data.ventas_por_medio_hoy);

    } catch (error) {

        console.error("ERROR CARGANDO RESUMEN:", error);

        document.getElementById("homeCards").innerHTML =
            `<div class="home-vacio">No se pudo cargar el resumen.</div>`;
    }
}

function renderCards(data) {

    const container = document.getElementById("homeCards");

    container.innerHTML = `

        <div class="home-card acento">
            <div class="home-card-icon">💰</div>
            <div class="home-card-valor">${money(data.ventas_hoy.total)}</div>
            <div class="home-card-label">Vendido hoy (${data.ventas_hoy.cantidad} pedidos)</div>
        </div>

        <div class="home-card">
            <div class="home-card-icon">🧾</div>
            <div class="home-card-valor">${data.pedidos_activos}</div>
            <div class="home-card-label">Pedidos activos</div>
        </div>

        <div class="home-card ${data.caja_abierta ? "ok" : "alerta"}">
            <div class="home-card-icon">${data.caja_abierta ? "🔓" : "🔒"}</div>
            <div class="home-card-valor" style="font-size:15px;">
                ${data.caja_abierta ? escapeHtml(data.caja_nombre || "Abierta") : "Cerrada"}
            </div>
            <div class="home-card-label">Estado de caja</div>
        </div>

        <div class="home-card">
            <div class="home-card-icon">📉</div>
            <div class="home-card-valor">${money(data.gastos_hoy)}</div>
            <div class="home-card-label">Gastos de hoy</div>
        </div>

        <div class="home-card">
            <div class="home-card-icon">📦</div>
            <div class="home-card-valor">${data.productos_total}</div>
            <div class="home-card-label">Productos activos</div>
        </div>

        <div class="home-card">
            <div class="home-card-icon">👥</div>
            <div class="home-card-valor">${data.clientes_total}</div>
            <div class="home-card-label">Clientes</div>
        </div>
    `;
}

function renderMedios(medios) {

    const container = document.getElementById("homeMedios");

    if (!medios || !medios.length) {

        container.innerHTML =
            `<span class="muted" style="font-size:12px; color:var(--muted);">
                Todavía no hay ventas hoy.
            </span>`;

        return;
    }

    container.innerHTML = medios.map(m => `
        <div class="home-medio-item">
            <span>
                ${escapeHtml(m.medio)}
                <span class="muted">(${m.cantidad})</span>
            </span>
            <strong>${money(m.total)}</strong>
        </div>
    `).join("");
}


/* =========================================================
   INIT / DESTROY
   ========================================================= */

let intervalo = null;

async function inicializar() {

    renderSaludo();

    await cargarResumen();

    intervalo = setInterval(cargarResumen, 30000);
}

function destruir() {

    if (intervalo) {
        clearInterval(intervalo);
        intervalo = null;
    }
}

window.LightPOS = window.LightPOS || {};
window.LightPOS.home = {
    init: inicializar,
    destroy: destruir
};

})();
