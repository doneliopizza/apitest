(function () {

const API_URL = window.LIGHTPOS_API_URL;
const TOKEN = localStorage.getItem("lightpos_token");

let intervalo = null;

function authHeaders() {
    return {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
    };
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
        style: "currency", currency: "ARS", maximumFractionDigits: 0
    }).format(Number(value) || 0);
}

function showToast(message) {

    const toast = document.getElementById("toast");

    if (!toast) { console.log(message); return; }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(window.toastTimer);

    window.toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}


async function cargarMisPedidos() {

    try {

        const respuesta = await fetch(`${API_URL}/colaboradores/mis-pedidos`, {
            headers: authHeaders()
        });

        if (!respuesta.ok) {

            if (respuesta.status === 401) {
                window.location.href = "login.html";
                return;
            }

            throw new Error(`HTTP ${respuesta.status}`);
        }

        const pedidos = await respuesta.json();

        renderPedidos(pedidos);

    } catch (error) {

        console.error("ERROR CARGANDO MIS PEDIDOS:", error);
    }
}

function renderPedidos(pedidos) {

    const container = document.getElementById("deliveryLista");

    if (!container) return;

    if (!pedidos.length) {

        container.innerHTML = `
            <div class="delivery-vacio">
                No tenés pedidos asignados por ahora.
            </div>
        `;

        return;
    }

    container.innerHTML = pedidos.map(p => `
        <div class="delivery-card">

            <div class="delivery-card-top">
                <strong>#${escapeHtml(p.id)} — ${escapeHtml(p.cliente_nombre)}</strong>
                <span class="delivery-card-total">${money(p.total)}</span>
            </div>

            ${p.direccion_entrega ? `
                <div class="delivery-card-linea">📍 ${escapeHtml(p.direccion_entrega)}</div>
            ` : ""}

            ${p.cliente_telefono ? `
                <div class="delivery-card-linea">📞 ${escapeHtml(p.cliente_telefono)}</div>
            ` : ""}

            <div class="delivery-card-linea">💳 ${escapeHtml(p.medio_pago || "—")}</div>

            ${p.observaciones ? `
                <div class="delivery-card-linea">📝 ${escapeHtml(p.observaciones)}</div>
            ` : ""}

            <button type="button" class="delivery-btn-entregado" data-entregar="${p.id}">
                ✓ Marcar como entregado
            </button>

        </div>
    `).join("");

    container.querySelectorAll("[data-entregar]").forEach(btn => {

        btn.addEventListener("click", () => marcarEntregado(Number(btn.dataset.entregar)));
    });
}

async function marcarEntregado(pedidoId) {

    if (!confirm(`¿Confirmás que entregaste el pedido #${pedidoId}?`)) return;

    try {

        const respuesta = await fetch(
            `${API_URL}/colaboradores/mis-pedidos/${pedidoId}/entregado`,
            { method: "PUT", headers: authHeaders() }
        );

        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

        showToast(`Pedido #${pedidoId} entregado`);

        await cargarMisPedidos();

    } catch (error) {

        console.error("ERROR MARCANDO ENTREGADO:", error);

        showToast("No se pudo actualizar el pedido");
    }
}


function inicializar() {

    cargarMisPedidos();

    intervalo = setInterval(cargarMisPedidos, 15000);
}

function destruir() {

    if (intervalo) {
        clearInterval(intervalo);
        intervalo = null;
    }
}

window.LightPOS = window.LightPOS || {};
window.LightPOS.delivery = {
    init: inicializar,
    destroy: destruir
};

})();