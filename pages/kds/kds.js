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


/* =========================================================
   ESTADO
   ========================================================= */

let pedidosCocina = [];
let intervaloPoll = null;
let intervaloReloj = null;

const INTERVALO_POLL_MS = 4000;
const INTERVALO_RELOJ_MS = 1000;


/* =========================================================
   NORMALIZAR ESTADO (mismo criterio que ventas.js)
   ========================================================= */

function obtenerEstadoPedido(pedido) {

    if (!pedido) return "";

    if (typeof pedido.estado === "string") return pedido.estado;
    if (typeof pedido.estado_nombre === "string") return pedido.estado_nombre;

    return "";
}

function esPreparacion(pedido) {

    const normalizado = String(obtenerEstadoPedido(pedido))
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    return normalizado.includes("PREPARACION");
}


/* =========================================================
   OBTENER ITEMS / CLIENTE (defensivo, distintas formas
   en que puede venir el pedido desde /pedidos/activos)
   ========================================================= */

function obtenerItems(pedido) {

    if (Array.isArray(pedido?.items)) return pedido.items;
    if (Array.isArray(pedido?.detalle)) return pedido.detalle;

    return [];
}

function obtenerNombreCliente(pedido) {

    return (
        pedido?.cliente_nombre ||
        pedido?.nombre_cliente ||
        pedido?.cliente?.nombre ||
        "Mostrador"
    );
}

function obtenerMinutos(pedido) {

    const fecha =
        pedido.fecha ||
        pedido.fecha_inicio ||
        pedido.created_at ||
        pedido.fecha_creacion;

    if (!fecha) return 0;

    const inicio = new Date(fecha);

    if (isNaN(inicio.getTime())) return 0;

    const diferencia = Date.now() - inicio.getTime();

    return Math.max(0, Math.floor(diferencia / 60000));
}

function claseColorPorMinutos(minutos) {

    if (minutos < 20) return "kds-verde";
    if (minutos < 40) return "kds-naranja";

    return "kds-rojo";
}


/* =========================================================
   CARGAR PEDIDOS
   ========================================================= */

async function cargarPedidos() {

    try {

        const respuesta = await fetch(
            `${API_URL}/pedidos/activos`,
            {
                method: "GET",
                headers: authHeaders(),
                cache: "no-store"
            }
        );

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) {
                return;
            }

            throw new Error(`HTTP ${respuesta.status}`);
        }

        const data = await respuesta.json();

        const todos = Array.isArray(data)
            ? data
            : (Array.isArray(data?.pedidos) ? data.pedidos : []);

        pedidosCocina = todos.filter(esPreparacion);

        renderPedidos();

    } catch (error) {

        console.error("ERROR CARGANDO PEDIDOS (KDS):", error);
    }
}


/* =========================================================
   RENDER
   ========================================================= */

function renderPedidos() {

    const grid = document.getElementById("kdsGrid");
    const counter = document.getElementById("kdsCounter");

    if (!grid) return;

    if (counter) {
        counter.textContent = pedidosCocina.length;
    }

    if (!pedidosCocina.length) {

        grid.innerHTML = `
            <div class="kds-vacio">
                🍽️ No hay pedidos en preparación en este momento.
            </div>
        `;

        return;
    }

    grid.innerHTML = pedidosCocina
        .map(pedido => renderTarjeta(pedido))
        .join("");

    grid.querySelectorAll("[data-listo]").forEach(btn => {

        btn.addEventListener("click", () => {

            marcarListo(Number(btn.dataset.listo));
        });
    });
}

function renderTarjeta(pedido) {

    const minutos = obtenerMinutos(pedido);
    const clase = claseColorPorMinutos(minutos);

    const items = obtenerItems(pedido);

    const tipoEntrega = String(
        pedido.tipo_entrega || pedido.tipoEntrega || "LOCAL"
    ).toUpperCase();

    return `
        <article class="kds-card" data-pedido-id="${pedido.id}">

            <div class="kds-card-title ${clase}">
                <span class="kds-numero">#${escapeHtml(pedido.id)}</span>
                <span class="kds-time">${minutos} min</span>
            </div>

            <div class="kds-meta">
                ${escapeHtml(obtenerNombreCliente(pedido))} · ${escapeHtml(tipoEntrega)}
            </div>

            <div class="kds-body">

                ${
                    items.length
                        ? items.map(item => renderItem(item)).join("")
                        : `<span class="muted" style="color:var(--muted); font-size:12px;">
                               Sin detalle disponible
                           </span>`
                }

            </div>

            <div class="kds-footer">
                <button
                    type="button"
                    class="kds-listo-btn"
                    data-listo="${pedido.id}"
                >
                    ✅ Listo
                </button>
            </div>

        </article>
    `;
}

function renderItem(item) {

    const nombre =
        item.nombre ||
        item.nombre_producto ||
        item.producto_nombre ||
        "Producto";

    const cantidad = item.cantidad ?? 1;

    const opciones = Array.isArray(item.opciones) ? item.opciones : [];

    return `
        <div class="kds-item">

            <strong>${cantidad}x ${escapeHtml(nombre)}</strong>

            ${
                opciones.length
                    ? `<div class="kds-suboptions">
                        ${opciones.map(o => `
                            <span>
                                + ${o.cantidad ?? 1}x
                                ${escapeHtml(o.nombre || o.producto_nombre || "")}
                            </span>
                        `).join("")}
                       </div>`
                    : ""
            }

        </div>
    `;
}


/* =========================================================
   MARCAR LISTO (PREPARACION -> LISTO)
   ========================================================= */

async function marcarListo(pedidoId) {

    try {

        const respuesta = await fetch(
            `${API_URL}/pedidos/${pedidoId}/avanzar-estado`,
            {
                method: "PUT",
                headers: authHeaders()
            }
        );

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) {
                return;
            }

            throw new Error(`HTTP ${respuesta.status}`);
        }

        // Lo sacamos de la vista al instante, sin esperar
        // el próximo poll.

        pedidosCocina = pedidosCocina.filter(
            p => Number(p.id) !== pedidoId
        );

        renderPedidos();

        showToast(`Pedido #${pedidoId} listo para retirar`);

        await cargarPedidos();

    } catch (error) {

        console.error("ERROR MARCANDO LISTO:", error);

        showToast("No se pudo marcar el pedido como listo");
    }
}


/* =========================================================
   RELOJ VISUAL (recalcula minutos y color sin ir al server)
   ========================================================= */

function actualizarReloj() {

    if (!pedidosCocina.length) return;

    renderPedidos();
}


/* =========================================================
   INIT / DESTROY
   ========================================================= */

async function inicializar() {

    await cargarPedidos();

    intervaloPoll = setInterval(cargarPedidos, INTERVALO_POLL_MS);
    intervaloReloj = setInterval(actualizarReloj, INTERVALO_RELOJ_MS * 30);
}

function destruir() {

    if (intervaloPoll) {
        clearInterval(intervaloPoll);
        intervaloPoll = null;
    }

    if (intervaloReloj) {
        clearInterval(intervaloReloj);
        intervaloReloj = null;
    }
}

window.LightPOS = window.LightPOS || {};
window.LightPOS.kds = {
    init: inicializar,
    destroy: destruir
};

})();
