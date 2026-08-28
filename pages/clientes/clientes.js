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


let clientes = [];
let clienteEditandoId = null;
let debounceBusqueda = null;


/* =========================================================
   CARGAR / BUSCAR
   ========================================================= */

async function cargarClientes(termino = "") {

    try {

        const url = termino
            ? `${API_URL}/clientes/?buscar=${encodeURIComponent(termino)}`
            : `${API_URL}/clientes/`;

        const respuesta = await fetch(url, {
            method: "GET",
            headers: authHeaders()
        });

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) {
                return;
            }

            throw new Error(`HTTP ${respuesta.status}`);
        }

        clientes = await respuesta.json();

        renderClientes();

    } catch (error) {

        console.error("ERROR CARGANDO CLIENTES:", error);

        showToast("No se pudieron cargar los clientes");
    }
}


/* =========================================================
   RENDER
   ========================================================= */

function renderClientes() {

    const container = document.getElementById("clientesLista");

    if (!container) {
        return;
    }

    if (!clientes.length) {

        container.innerHTML = `
            <div class="clientes-vacio">
                No se encontraron clientes.
            </div>
        `;

        return;
    }

    container.innerHTML = clientes
        .map(cliente => `
            <article class="cliente-row">

                <div>
                    <span class="cliente-nombre">
                        ${escapeHtml(cliente.nombre)}
                    </span>
                    ${
                        cliente.domicilio_fiscal
                            ? `<span class="cliente-sub">${escapeHtml(cliente.domicilio_fiscal)}</span>`
                            : ""
                    }
                </div>

                <span class="cliente-col">
                    ${escapeHtml(cliente.telefono || "—")}
                </span>

                <span class="cliente-col">
                    ${escapeHtml(cliente.documento || "—")}
                </span>

                <div class="cliente-actions">

                    <button
                        type="button"
                        data-editar="${cliente.id}"
                    >
                        Editar
                    </button>

                    <button
                        type="button"
                        class="danger"
                        data-desactivar="${cliente.id}"
                    >
                        Desactivar
                    </button>

                </div>

            </article>
        `)
        .join("");

    container.querySelectorAll("[data-editar]").forEach(btn => {

        btn.addEventListener("click", () => {

            abrirModal(
                clientes.find(
                    c => Number(c.id) === Number(btn.dataset.editar)
                )
            );
        });
    });

    container.querySelectorAll("[data-desactivar]").forEach(btn => {

        btn.addEventListener("click", () => {

            desactivarCliente(Number(btn.dataset.desactivar));
        });
    });
}


/* =========================================================
   MODAL
   ========================================================= */

function abrirModal(cliente = null) {

    clienteEditandoId = cliente ? cliente.id : null;

    document.getElementById("clienteModalTitulo").textContent =
        cliente ? "Editar cliente" : "Nuevo cliente";

    document.getElementById("clFormNombre").value = cliente?.nombre || "";
    document.getElementById("clFormTelefono").value = cliente?.telefono || "";
    document.getElementById("clFormEmail").value = cliente?.email || "";
    document.getElementById("clFormDocumento").value = cliente?.documento || "";
    document.getElementById("clFormDomicilio").value = cliente?.domicilio_fiscal || "";
    document.getElementById("clFormObservaciones").value = cliente?.observaciones || "";

    document.getElementById("clienteModal").style.display = "flex";
}

function cerrarModal() {

    document.getElementById("clienteModal").style.display = "none";
    clienteEditandoId = null;
}


/* =========================================================
   GUARDAR (crear o editar)
   ========================================================= */

async function guardarCliente() {

    const nombre = document.getElementById("clFormNombre").value.trim();

    if (!nombre) {
        showToast("El nombre es obligatorio");
        return;
    }

    const payload = {
        nombre,
        telefono: document.getElementById("clFormTelefono").value.trim() || null,
        email: document.getElementById("clFormEmail").value.trim() || null,
        documento: document.getElementById("clFormDocumento").value.trim() || null,
        domicilio_fiscal: document.getElementById("clFormDomicilio").value.trim() || null,
        observaciones: document.getElementById("clFormObservaciones").value.trim() || null
    };

    try {

        const url = clienteEditandoId
            ? `${API_URL}/clientes/${clienteEditandoId}`
            : `${API_URL}/clientes/`;

        const respuesta = await fetch(url, {
            method: clienteEditandoId ? "PUT" : "POST",
            headers: authHeaders(),
            body: JSON.stringify(payload)
        });

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) {
                return;
            }

            const data = await respuesta.json().catch(() => null);

            throw new Error(data?.detail || `HTTP ${respuesta.status}`);
        }

        showToast(
            clienteEditandoId ? "Cliente actualizado" : "Cliente creado"
        );

        cerrarModal();

        await cargarClientes(
            document.getElementById("clientesBuscar").value.trim()
        );

    } catch (error) {

        console.error("ERROR GUARDANDO CLIENTE:", error);

        showToast(
            typeof error.message === "string"
                ? error.message
                : "No se pudo guardar el cliente"
        );
    }
}


/* =========================================================
   DESACTIVAR
   ========================================================= */

async function desactivarCliente(id) {

    if (!confirm("¿Desactivar este cliente?")) {
        return;
    }

    try {

        const respuesta = await fetch(`${API_URL}/clientes/${id}`, {
            method: "DELETE",
            headers: authHeaders()
        });

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) {
                return;
            }

            throw new Error(`HTTP ${respuesta.status}`);
        }

        showToast("Cliente desactivado");

        await cargarClientes(
            document.getElementById("clientesBuscar").value.trim()
        );

    } catch (error) {

        console.error("ERROR DESACTIVANDO CLIENTE:", error);

        showToast("No se pudo desactivar el cliente");
    }
}


/* =========================================================
   EVENTOS
   ========================================================= */

function inicializarEventos() {

    document.getElementById("btnNuevoCliente")
        .addEventListener("click", () => abrirModal());

    document.getElementById("clienteModalCerrar")
        .addEventListener("click", cerrarModal);

    document.getElementById("clienteModalCancelar")
        .addEventListener("click", cerrarModal);

    document.getElementById("clienteModalGuardar")
        .addEventListener("click", guardarCliente);

    document.getElementById("clienteModal")
        .addEventListener("click", event => {

            if (event.target.id === "clienteModal") {
                cerrarModal();
            }
        });

    document.getElementById("clientesBuscar")
        .addEventListener("input", event => {

            clearTimeout(debounceBusqueda);

            debounceBusqueda = setTimeout(() => {
                cargarClientes(event.target.value.trim());
            }, 350);
        });
}


/* =========================================================
   INIT / DESTROY
   ========================================================= */

async function inicializar() {

    inicializarEventos();

    await cargarClientes();
}

function destruir() {

    clearTimeout(debounceBusqueda);
}

window.LightPOS = window.LightPOS || {};
window.LightPOS.clientes = {
    init: inicializar,
    destroy: destruir
};

})();
