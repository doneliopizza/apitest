(function () {

/* =========================================================
   CONFIGURACIÓN
   ========================================================= */

const API_URL = window.LIGHTPOS_API_URL;
const TOKEN = localStorage.getItem("lightpos_token");

if (!TOKEN) {
    window.location.href = "login.html";
}


/* =========================================================
   AUTH
   ========================================================= */

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


/* =========================================================
   ESTADO
   ========================================================= */

let agentes = [];

let intervaloRefresco = null;

const INTERVALO_REFRESCO_MS = 15000;


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/* =========================================================
   TOAST
   ========================================================= */

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
   FORMATO FECHA
   ========================================================= */

function formatearFecha(valor) {

    if (!valor) {
        return "Nunca";
    }

    const fecha = new Date(valor);

    if (isNaN(fecha.getTime())) {
        return "—";
    }

    return fecha.toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}


/* =========================================================
   CARGAR AGENTES
   ========================================================= */

async function cargarAgentes() {

    try {

        const respuesta = await fetch(
            `${API_URL}/impresoras/agentes`,
            {
                method: "GET",
                headers: authHeaders()
            }
        );

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) {
                return;
            }

            throw new Error(`HTTP ${respuesta.status}`);
        }

        const data = await respuesta.json();

        agentes = Array.isArray(data) ? data : [];

        renderAgentes();

    } catch (error) {

        console.error("ERROR CARGANDO AGENTES:", error);

        showToast("No se pudieron cargar los agentes de impresión");
    }
}


/* =========================================================
   RENDER
   ========================================================= */

function renderAgentes() {

    const container = document.getElementById("agentesList");

    if (!container) {
        return;
    }

    if (!agentes.length) {

        container.innerHTML = `
            <div class="agentes-vacio">
                Todavía no se conectó ningún agente de
                impresión. Abrí LightPOS Agente en la PC
                del local y esperá unos segundos.
            </div>
        `;

        return;
    }

    container.innerHTML = agentes
        .map(agente => renderAgenteCard(agente))
        .join("");

    // Selects de rol

    container
        .querySelectorAll("select[data-rol]")
        .forEach(select => {

            select.addEventListener(
                "change",
                () => {

                    const impresoraId = select.value;

                    if (!impresoraId) {
                        return;
                    }

                    marcarPredeterminada(
                        Number(impresoraId),
                        select.dataset.rol
                    );
                }
            );
        });

    // Botones "Probar" (impresora puntual)

    container
        .querySelectorAll("[data-probar]")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    probarImpresora(
                        Number(button.dataset.probar)
                    );
                }
            );
        });

    // Botones "Probar" (rol / predeterminada)

    container
        .querySelectorAll("[data-probar-rol]")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const [agenteId, rol] =
                        button.dataset.probarRol.split(":");

                    probarRol(
                        Number(agenteId),
                        rol
                    );
                }
            );
        });

    // Botones "Activar / Desactivar"

    container
        .querySelectorAll("[data-toggle]")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    cambiarEstadoImpresora(
                        Number(button.dataset.toggle),
                        button.dataset.activa === "true"
                    );
                }
            );
        });
}


function renderAgenteCard(agente) {

    const impresorasActivas = agente.impresoras.filter(
        imp => imp.activa
    );

    const opcionesSelect = impresoras =>
        impresoras
            .map(imp => `
                <option value="${imp.id}">
                    ${escapeHtml(imp.nombre_sistema || imp.nombre)}
                </option>
            `)
            .join("");

    const impresoraTicket = agente.impresoras.find(
        imp => imp.predeterminada_ticket
    );

    const impresoraCocina = agente.impresoras.find(
        imp => imp.predeterminada_cocina
    );

    return `
        <article class="agente-card">

            <div class="agente-card-header">

                <div class="agente-info">

                    <span class="status-dot ${
                        agente.en_linea ? "" : "offline"
                    }"></span>

                    <strong>
                        ${escapeHtml(agente.nombre)}
                    </strong>

                    <span class="agente-meta">
                        ${escapeHtml(agente.sistema_operativo || "—")}
                        · v${escapeHtml(agente.version || "?")}
                        ${agente.ip ? "· " + escapeHtml(agente.ip) : ""}
                    </span>

                </div>

                <span class="agente-ultima-conexion">
                    Últ. conexión: ${formatearFecha(agente.ultima_conexion)}
                </span>

            </div>

            <div class="agente-roles">

                <div class="rol-selector">

                    <label>Impresora para tickets</label>

                    <div class="rol-selector-row">

                        <select data-rol="ticket" data-agente="${agente.id}">
                            <option value="">Sin asignar</option>
                            ${opcionesSelect(impresorasActivas)
                                .replace(
                                    impresoraTicket
                                        ? `value="${impresoraTicket.id}"`
                                        : "__nada__",
                                    impresoraTicket
                                        ? `value="${impresoraTicket.id}" selected`
                                        : "__nada__"
                                )}
                        </select>

                        <button
                            type="button"
                            data-probar-rol="${agente.id}:ticket"
                        >
                            Probar
                        </button>

                    </div>

                </div>

                <div class="rol-selector">

                    <label>Impresora para cocina</label>

                    <div class="rol-selector-row">

                        <select data-rol="cocina" data-agente="${agente.id}">
                            <option value="">Sin asignar</option>
                            ${opcionesSelect(impresorasActivas)
                                .replace(
                                    impresoraCocina
                                        ? `value="${impresoraCocina.id}"`
                                        : "__nada__",
                                    impresoraCocina
                                        ? `value="${impresoraCocina.id}" selected`
                                        : "__nada__"
                                )}
                        </select>

                        <button
                            type="button"
                            data-probar-rol="${agente.id}:cocina"
                        >
                            Probar
                        </button>

                    </div>

                </div>

            </div>

            <div class="impresoras-detectadas">

                <span class="eyebrow">
                    IMPRESORAS DETECTADAS (${agente.impresoras.length})
                </span>

                ${
                    agente.impresoras.length
                        ? agente.impresoras
                            .map(imp => renderImpresoraRow(imp))
                            .join("")
                        : `<div class="agentes-vacio">
                               Este agente todavía no detectó
                               ninguna impresora.
                           </div>`
                }

            </div>

        </article>
    `;
}


function renderImpresoraRow(impresora) {

    return `
        <div class="impresora-row ${
            impresora.activa ? "" : "inactiva"
        }">

            <div class="impresora-nombre-col">

                <span class="impresora-nombre">
                    ${escapeHtml(
                        impresora.nombre_sistema || impresora.nombre
                    )}
                </span>

                ${
                    impresora.predeterminada_ticket
                        ? '<span class="impresora-badge ticket">Ticket</span>'
                        : ""
                }

                ${
                    impresora.predeterminada_cocina
                        ? '<span class="impresora-badge cocina">Cocina</span>'
                        : ""
                }

                ${
                    !impresora.activa
                        ? '<span class="impresora-badge inactiva">Inactiva</span>'
                        : ""
                }

            </div>

            <div class="impresora-actions">

                <button
                    type="button"
                    data-probar="${impresora.id}"
                >
                    Probar
                </button>

                <button
                    type="button"
                    class="${impresora.activa ? "danger" : ""}"
                    data-toggle="${impresora.id}"
                    data-activa="${impresora.activa}"
                >
                    ${impresora.activa ? "Desactivar" : "Activar"}
                </button>

            </div>

        </div>
    `;
}


/* =========================================================
   MARCAR PREDETERMINADA
   ========================================================= */

async function marcarPredeterminada(impresoraId, rol) {

    try {

        const respuesta = await fetch(
            `${API_URL}/impresoras/${impresoraId}/predeterminada/${rol}`,
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

        showToast(
            `Impresora asignada para ${
                rol === "cocina" ? "cocina" : "tickets"
            }`
        );

        await cargarAgentes();

    } catch (error) {

        console.error("ERROR MARCANDO PREDETERMINADA:", error);

        showToast("No se pudo asignar la impresora");
    }
}


/* =========================================================
   ACTIVAR / DESACTIVAR
   ========================================================= */

async function cambiarEstadoImpresora(impresoraId, activaActual) {

    try {

        const respuesta = await fetch(
            `${API_URL}/impresoras/${impresoraId}/estado`,
            {
                method: "PUT",
                headers: authHeaders(),
                body: JSON.stringify({
                    activa: !activaActual
                })
            }
        );

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) {
                return;
            }

            throw new Error(`HTTP ${respuesta.status}`);
        }

        showToast(
            !activaActual
                ? "Impresora activada"
                : "Impresora desactivada"
        );

        await cargarAgentes();

    } catch (error) {

        console.error("ERROR CAMBIANDO ESTADO:", error);

        showToast("No se pudo cambiar el estado de la impresora");
    }
}


/* =========================================================
   PROBAR ROL (predeterminada)
   ========================================================= */

async function probarRol(agenteId, rol) {

    try {

        const respuesta = await fetch(
            `${API_URL}/impresoras/agentes/${agenteId}/probar-rol/${rol}`,
            {
                method: "POST",
                headers: authHeaders()
            }
        );

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) {
                return;
            }

            const data = await respuesta.json().catch(() => null);

            throw new Error(data?.detail || `HTTP ${respuesta.status}`);
        }

        showToast(
            `Prueba de "${rol}" enviada — fijate cuál impresora imprime`
        );

    } catch (error) {

        console.error("ERROR PROBANDO ROL:", error);

        showToast(error.message || "No se pudo probar la selección");
    }
}


/* =========================================================
   PROBAR IMPRESORA
   ========================================================= */

async function probarImpresora(impresoraId) {

    try {

        const respuesta = await fetch(
            `${API_URL}/impresoras/${impresoraId}/probar`,
            {
                method: "POST",
                headers: authHeaders()
            }
        );

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) {
                return;
            }

            throw new Error(`HTTP ${respuesta.status}`);
        }

        showToast("Prueba enviada — debería imprimir en unos segundos");

    } catch (error) {

        console.error("ERROR PROBANDO IMPRESORA:", error);

        showToast("No se pudo enviar la prueba de impresión");
    }
}


/* =========================================================
   INICIALIZACIÓN / DESTRUCCIÓN (llamado por el shell)
   ========================================================= */

async function inicializar() {

    await cargarAgentes();

    intervaloRefresco = setInterval(
        cargarAgentes,
        INTERVALO_REFRESCO_MS
    );
}


function destruir() {

    if (intervaloRefresco) {

        clearInterval(intervaloRefresco);

        intervaloRefresco = null;
    }
}


window.LightPOS = window.LightPOS || {};
window.LightPOS.configuracion = {
    init: inicializar,
    destroy: destruir
};

})();
