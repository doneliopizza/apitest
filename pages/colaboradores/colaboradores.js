(function () {

/* =========================================================
   CONFIGURACIÓN
   ========================================================= */

const API_URL = window.LIGHTPOS_API_URL;
const TOKEN = localStorage.getItem("lightpos_token");


function authHeaders() {
    return {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
    };
}

function manejarErrorAuth(status) {

    if (status === 401 || status === 403) {

        if (status === 403) {

            showToast("No tenés permiso para esto");

            return true;
        }

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

let colaboradores = [];
let rolesCatalogo = [];
let permisosCatalogo = [];
let editandoColaboradorId = null;
let editandoRolId = null;


/* =========================================================
   TABS
   ========================================================= */

function inicializarTabs() {

    document.querySelectorAll("[data-coltab]").forEach(btn => {

        btn.addEventListener("click", () => {

            document.querySelectorAll("[data-coltab]").forEach(b => {
                b.classList.toggle("active", b === btn);
            });

            const tab = btn.dataset.coltab;

            document.getElementById("colTabLista").style.display = tab === "lista" ? "block" : "none";
            document.getElementById("colTabRoles").style.display = tab === "roles" ? "block" : "none";
            document.getElementById("colTabFichadas").style.display = tab === "fichadas" ? "block" : "none";
        });
    });
}


/* =========================================================
   CATÁLOGOS
   ========================================================= */

async function cargarRolesCatalogo() {

    try {

        const respuesta = await fetch(`${API_URL}/colaboradores/roles-catalogo`, {
            headers: authHeaders()
        });

        if (!respuesta.ok) {
            if (manejarErrorAuth(respuesta.status)) return;
            throw new Error(`HTTP ${respuesta.status}`);
        }

        rolesCatalogo = await respuesta.json();

        renderRolesLista();

    } catch (error) {

        console.error("ERROR CARGANDO ROLES:", error);
    }
}

async function cargarPermisosCatalogo() {

    try {

        const respuesta = await fetch(`${API_URL}/colaboradores/permisos-catalogo`, {
            headers: authHeaders()
        });

        if (!respuesta.ok) {
            if (manejarErrorAuth(respuesta.status)) return;
            throw new Error(`HTTP ${respuesta.status}`);
        }

        permisosCatalogo = await respuesta.json();

    } catch (error) {

        console.error("ERROR CARGANDO PERMISOS:", error);
    }
}


/* =========================================================
   LISTA DE COLABORADORES
   ========================================================= */

async function cargarColaboradores() {

    try {

        const respuesta = await fetch(`${API_URL}/colaboradores`, {
            headers: authHeaders()
        });

        if (!respuesta.ok) {
            if (manejarErrorAuth(respuesta.status)) return;
            throw new Error(`HTTP ${respuesta.status}`);
        }

        colaboradores = await respuesta.json();

        renderColaboradoresLista();

    } catch (error) {

        console.error("ERROR CARGANDO COLABORADORES:", error);

        showToast("No se pudieron cargar los colaboradores");
    }
}

function renderColaboradoresLista() {

    const container = document.getElementById("colLista");

    if (!container) return;

    const buscarInput = document.getElementById("colBuscar");
    const texto = buscarInput ? buscarInput.value.trim().toLowerCase() : "";

    const filtrados = colaboradores.filter(c =>
        !texto ||
        c.nombre.toLowerCase().includes(texto) ||
        c.email.toLowerCase().includes(texto)
    );

    if (!filtrados.length) {

        container.innerHTML = `<div class="p-vacio">No hay colaboradores para mostrar.</div>`;

        return;
    }

    container.innerHTML = filtrados.map(c => `
        <div class="p-row ${c.activo ? "" : "inactivo"}" style="grid-template-columns: minmax(0,1fr) auto auto;">

            <div>
                <span class="p-nombre">${escapeHtml(c.nombre)}</span>
                <span class="p-sub">${escapeHtml(c.email)}${c.telefono ? " · " + escapeHtml(c.telefono) : ""}</span>
            </div>

            <div style="display:flex; gap:4px; flex-wrap:wrap; max-width:220px;">
                ${c.roles.map(r => `
                    <span class="p-badge compuesto">${escapeHtml(r.nombre)}</span>
                `).join("") || `<span class="p-sub">Sin rol</span>`}
            </div>

            <div class="p-actions">
                <button type="button" data-col-editar="${c.id}">✏️ Editar</button>
                <button type="button" data-col-toggle="${c.id}" data-activo="${c.activo}">
                    ${c.activo ? "Desactivar" : "Activar"}
                </button>
            </div>

        </div>
    `).join("");

    container.querySelectorAll("[data-col-editar]").forEach(btn => {

        btn.addEventListener("click", () => {

            const colaborador = colaboradores.find(c => c.id === Number(btn.dataset.colEditar));

            if (colaborador) abrirModalColaborador(colaborador);
        });
    });

    container.querySelectorAll("[data-col-toggle]").forEach(btn => {

        btn.addEventListener("click", () => {

            toggleActivoColaborador(
                Number(btn.dataset.colToggle),
                btn.dataset.activo === "true"
            );
        });
    });
}

async function toggleActivoColaborador(id, activoActual) {

    try {

        const respuesta = await fetch(`${API_URL}/colaboradores/${id}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({ activo: !activoActual })
        });

        if (!respuesta.ok) {
            if (manejarErrorAuth(respuesta.status)) return;
            throw new Error(`HTTP ${respuesta.status}`);
        }

        showToast(!activoActual ? "Colaborador activado" : "Colaborador desactivado");

        await cargarColaboradores();

    } catch (error) {

        console.error("ERROR:", error);

        showToast("No se pudo actualizar");
    }
}


/* =========================================================
   MODAL COLABORADOR
   ========================================================= */

function renderRolesCheckboxesColaborador(rolesSeleccionados = []) {

    const container = document.getElementById("colRolesCheckboxes");

    if (!container) return;

    const idsSeleccionados = new Set(rolesSeleccionados.map(r => r.id ?? r));

    container.innerHTML = rolesCatalogo.map(rol => `
        <label style="display:flex; align-items:center; gap:8px; padding:8px 0; color:var(--text); font-size:12.5px;">
            <input type="checkbox" value="${rol.id}" ${idsSeleccionados.has(rol.id) ? "checked" : ""}>
            <strong>${escapeHtml(rol.nombre)}</strong>
            <span style="color:var(--muted); font-size:11px;">— ${escapeHtml(rol.descripcion || "")}</span>
        </label>
    `).join("");
}

function abrirModalColaborador(colaborador = null) {

    editandoColaboradorId = colaborador ? colaborador.id : null;

    document.getElementById("colModalTitulo").textContent =
        colaborador ? "Editar colaborador" : "Nuevo colaborador";

    document.getElementById("colNombre").value = colaborador?.nombre || "";
    document.getElementById("colEmail").value = colaborador?.email || "";
    document.getElementById("colTelefono").value = colaborador?.telefono || "";
    document.getElementById("colSalario").value = colaborador?.salario_base || "";
    document.getElementById("colPassword").value = "";

    document.getElementById("colPasswordLabel").textContent =
        colaborador ? "Nueva contraseña (dejar vacío para no cambiarla)" : "Contraseña";

    document.getElementById("colEmail").disabled = !!colaborador;

    renderRolesCheckboxesColaborador(colaborador?.roles || []);

    document.getElementById("colModal").style.display = "flex";
}

function cerrarModalColaborador() {

    document.getElementById("colModal").style.display = "none";

    editandoColaboradorId = null;
}

async function guardarColaborador() {

    const nombre = document.getElementById("colNombre").value.trim();
    const email = document.getElementById("colEmail").value.trim();
    const password = document.getElementById("colPassword").value;
    const telefono = document.getElementById("colTelefono").value.trim() || null;
    const salarioTexto = document.getElementById("colSalario").value;
    const salario_base = salarioTexto ? Number(salarioTexto) : null;

    const roles = [...document.querySelectorAll("#colRolesCheckboxes input:checked")]
        .map(input => Number(input.value));

    if (!nombre) return showToast("Ingresá el nombre");
    if (!email) return showToast("Ingresá el email");
    if (!editandoColaboradorId && !password) return showToast("Ingresá una contraseña");
    if (!roles.length) return showToast("Elegí al menos un rol");

    try {

        let respuesta;

        if (editandoColaboradorId) {

            const payload = { nombre, telefono, salario_base, roles };

            if (password) payload.password = password;

            respuesta = await fetch(`${API_URL}/colaboradores/${editandoColaboradorId}`, {
                method: "PUT",
                headers: authHeaders(),
                body: JSON.stringify(payload)
            });

        } else {

            respuesta = await fetch(`${API_URL}/colaboradores`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ nombre, email, password, telefono, salario_base, roles })
            });
        }

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) return;

            const data = await respuesta.json().catch(() => null);

            throw new Error(data?.detail || `HTTP ${respuesta.status}`);
        }

        showToast(editandoColaboradorId ? "Colaborador actualizado" : "Colaborador creado");

        cerrarModalColaborador();

        await cargarColaboradores();

    } catch (error) {

        console.error("ERROR GUARDANDO COLABORADOR:", error);

        showToast(error.message || "No se pudo guardar");
    }
}


/* =========================================================
   ROLES Y PERMISOS
   ========================================================= */

function renderRolesLista() {

    const container = document.getElementById("rolesLista");

    if (!container) return;

    container.innerHTML = rolesCatalogo.map(rol => `
        <div class="pgrupo-item" style="margin-bottom:10px;">

            <div class="pgrupo-item-header">

                <div>
                    <strong>${escapeHtml(rol.nombre)}</strong>
                    <span style="display:block; margin-top:2px;">${escapeHtml(rol.descripcion || "")} — ${rol.permisos.length} permisos</span>
                </div>

                <div class="pgrupo-item-actions">
                    <button type="button" data-rol-editar="${rol.id}">✏️ Editar permisos</button>
                </div>

            </div>

        </div>
    `).join("");

    container.querySelectorAll("[data-rol-editar]").forEach(btn => {

        btn.addEventListener("click", () => {

            const rol = rolesCatalogo.find(r => r.id === Number(btn.dataset.rolEditar));

            if (rol) abrirModalRol(rol);
        });
    });
}

function abrirModalRol(rol) {

    editandoRolId = rol.id;

    document.getElementById("rolModalTitulo").textContent = `Permisos de ${rol.nombre}`;

    const permisosSeleccionados = new Set(rol.permisos);

    const porModulo = {};

    permisosCatalogo.forEach(p => {

        const modulo = p.modulo || "otros";

        if (!porModulo[modulo]) porModulo[modulo] = [];

        porModulo[modulo].push(p);
    });

    const grid = document.getElementById("rolPermisosGrid");

    grid.innerHTML = Object.keys(porModulo).sort().map(modulo => `
        <div style="margin-bottom:14px;">

            <div style="color:var(--primary); font-size:10.5px; font-weight:800; text-transform:uppercase; margin-bottom:6px; letter-spacing:.4px;">
                ${escapeHtml(modulo)}
            </div>

            ${porModulo[modulo].map(p => `
                <label style="display:flex; align-items:center; gap:8px; padding:5px 0; color:var(--text); font-size:12px;">
                    <input type="checkbox" value="${p.codigo}" ${permisosSeleccionados.has(p.codigo) ? "checked" : ""}>
                    ${escapeHtml(p.nombre)}
                    <span style="color:var(--muted); font-size:10.5px;">(${p.codigo})</span>
                </label>
            `).join("")}

        </div>
    `).join("");

    document.getElementById("rolModal").style.display = "flex";
}

function cerrarModalRol() {

    document.getElementById("rolModal").style.display = "none";

    editandoRolId = null;
}

async function guardarPermisosRol() {

    if (!editandoRolId) return;

    const permisos = [...document.querySelectorAll("#rolPermisosGrid input:checked")]
        .map(input => input.value);

    try {

        const respuesta = await fetch(
            `${API_URL}/colaboradores/roles-catalogo/${editandoRolId}/permisos`,
            {
                method: "PUT",
                headers: authHeaders(),
                body: JSON.stringify({ permisos })
            }
        );

        if (!respuesta.ok) {
            if (manejarErrorAuth(respuesta.status)) return;
            throw new Error(`HTTP ${respuesta.status}`);
        }

        showToast("Permisos del rol actualizados");

        cerrarModalRol();

        await cargarRolesCatalogo();

    } catch (error) {

        console.error("ERROR GUARDANDO PERMISOS DE ROL:", error);

        showToast("No se pudo guardar");
    }
}


/* =========================================================
   FICHADAS
   ========================================================= */

async function buscarFichadas() {

    const desde = document.getElementById("fichDesde").value;
    const hasta = document.getElementById("fichHasta").value;

    if (!desde || !hasta) {
        showToast("Elegí un rango de fechas");
        return;
    }

    try {

        const respuesta = await fetch(
            `${API_URL}/colaboradores/fichadas/resumen?desde=${desde}&hasta=${hasta}`,
            { headers: authHeaders() }
        );

        if (!respuesta.ok) {
            if (manejarErrorAuth(respuesta.status)) return;
            throw new Error(`HTTP ${respuesta.status}`);
        }

        const resumen = await respuesta.json();

        renderFichadas(resumen);

    } catch (error) {

        console.error("ERROR CARGANDO FICHADAS:", error);

        showToast("No se pudieron cargar las fichadas");
    }
}

function renderFichadas(resumen) {

    const container = document.getElementById("fichResumen");

    if (!container) return;

    if (!resumen.length) {

        container.innerHTML = `<div class="p-vacio">Sin fichadas en ese rango.</div>`;

        return;
    }

    container.innerHTML = resumen.map(r => `
        <div class="p-row" style="grid-template-columns: minmax(0,1fr) auto;">

            <span class="p-nombre">${escapeHtml(r.nombre)}</span>

            <strong style="color:var(--primary);">${r.horas_trabajadas} hs</strong>

        </div>
    `).join("");
}


/* =========================================================
   INICIALIZACIÓN
   ========================================================= */

function inicializar() {

    inicializarTabs();

    const nuevoBtn = document.getElementById("colNuevoBtn");
    if (nuevoBtn) nuevoBtn.addEventListener("click", () => abrirModalColaborador(null));

    const buscar = document.getElementById("colBuscar");
    if (buscar) buscar.addEventListener("input", renderColaboradoresLista);

    document.getElementById("colModalCerrar")?.addEventListener("click", cerrarModalColaborador);
    document.getElementById("colModalCancelar")?.addEventListener("click", cerrarModalColaborador);
    document.getElementById("colModalGuardar")?.addEventListener("click", guardarColaborador);

    document.getElementById("rolModalCerrar")?.addEventListener("click", cerrarModalRol);
    document.getElementById("rolModalCancelar")?.addEventListener("click", cerrarModalRol);
    document.getElementById("rolModalGuardar")?.addEventListener("click", guardarPermisosRol);

    document.getElementById("fichBuscarBtn")?.addEventListener("click", buscarFichadas);

    cargarPermisosCatalogo();
    cargarRolesCatalogo();
    cargarColaboradores();
}

function destruir() {
    // sin intervalos que limpiar por ahora
}

window.LightPOS = window.LightPOS || {};
window.LightPOS.colaboradores = {
    init: inicializar,
    destroy: destruir
};

})();