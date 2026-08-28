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

    if (respuesta.status === 204) {
        return null;
    }

    return respuesta.json();
}


/* =========================================================
   ESTADO
   ========================================================= */

let productos = [];
let rubros = [];
let categorias = [];

let productoEditandoId = null;
let tipoSeleccionado = "NORMAL";
let componentesNuevos = [];
let plantillasAVincularAlCrear = new Set();

let entidadModo = "rubro";
let entidadEditandoId = null;

let componentesModalProductoId = null;
let componentesModalLista = [];

let gruposModalProductoId = null;
let gruposLista = [];
let gruposOpcionesCache = {};
let grupoExpandidoId = null;
let grupoEditandoId = null;

let plantillas = [];
let plantillaEditandoId = null;
let plantillaOpcionesCache = [];


/* =========================================================
   CARGA INICIAL
   ========================================================= */

async function cargarTodo() {

    try {

        const [prod, rub, cat, plant] = await Promise.all([
            api("GET", "/productos/"),
            api("GET", "/rubros/"),
            api("GET", "/categorias/"),
            api("GET", "/plantillas-grupos")
        ]);

        productos = prod;
        rubros = rub;
        categorias = cat;
        plantillas = plant;

        poblarFiltrosProductos();

        renderProductos();
        renderRubros();
        renderCategorias();
        renderPlantillas();

    } catch (error) {

        if (error.message !== "auth") {

            console.error("ERROR CARGANDO CATÁLOGO:", error);

            showToast("No se pudo cargar el catálogo");
        }
    }
}


/* =========================================================
   TABS
   ========================================================= */

function inicializarTabs() {

    document.querySelectorAll(".ptab").forEach(btn => {

        btn.addEventListener("click", () => {

            document.querySelectorAll(".ptab")
                .forEach(b => b.classList.remove("active"));

            btn.classList.add("active");

            document.querySelectorAll(".ptab-panel")
                .forEach(p => p.style.display = "none");

            const panel = document.getElementById(
                "tab" + btn.dataset.tab.charAt(0).toUpperCase()
                + btn.dataset.tab.slice(1)
            );

            if (panel) {
                panel.style.display = "block";
            }
        });
    });
}


/* =========================================================
   RENDER — PRODUCTOS
   ========================================================= */

function poblarFiltrosProductos() {

    const selectRubro = document.getElementById("filtroRubro");
    const selectCategoria = document.getElementById("filtroCategoria");

    if (selectRubro) {

        const actual = selectRubro.value;

        selectRubro.innerHTML =
            `<option value="">Todos los rubros</option>` +
            rubros
                .filter(r => r.activo)
                .map(r => `<option value="${escapeHtml(r.nombre)}">${escapeHtml(r.nombre)}</option>`)
                .join("");

        selectRubro.value = actual;
    }

    if (selectCategoria) {

        const actual = selectCategoria.value;

        selectCategoria.innerHTML =
            `<option value="">Todas las categorías</option>` +
            categorias
                .filter(c => c.activo)
                .map(c => `<option value="${escapeHtml(c.nombre)}">${escapeHtml(c.nombre)}</option>`)
                .join("");

        selectCategoria.value = actual;
    }
}


function renderProductos() {

    const container = document.getElementById("productosLista");

    if (!container) {
        return;
    }

    const termino = (
        document.getElementById("productosBuscar")?.value || ""
    ).trim().toLowerCase();

    const rubroFiltro = document.getElementById("filtroRubro")?.value || "";
    const categoriaFiltro = document.getElementById("filtroCategoria")?.value || "";
    const estadoFiltro = document.getElementById("filtroEstado")?.value || "activos";

    document.getElementById("filtroEstado")?.classList.toggle(
        "filtro-activo",
        estadoFiltro !== "activos"
    );

    const filtrados = productos.filter(p => {

        if (termino && !p.nombre.toLowerCase().includes(termino)) {
            return false;
        }

        if (rubroFiltro && String(p.rubro || "") !== rubroFiltro) {
            return false;
        }

        if (categoriaFiltro && String(p.categoria || "") !== categoriaFiltro) {
            return false;
        }

        if (estadoFiltro === "activos" && !p.activo) {
            return false;
        }

        if (estadoFiltro === "inactivos" && p.activo) {
            return false;
        }

        return true;
    });

    if (!filtrados.length) {

        container.innerHTML = `<div class="p-vacio">No hay productos.</div>`;

        return;
    }

    container.innerHTML = filtrados.map(p => `
        <article class="p-row p-row-producto ${p.activo ? "" : "inactivo"}">

            <div class="p-info">
                <span class="p-nombre">${escapeHtml(p.nombre)}</span>
                <span class="p-sub">
                    ${escapeHtml(p.rubro || "Sin rubro")}
                    ${p.categoria ? " · " + escapeHtml(p.categoria) : ""}
                </span>
            </div>

            <span class="p-badge ${p.es_compuesto ? "compuesto" : ""}">
                ${p.es_compuesto ? "Compuesto" : "Normal"}
            </span>

            <span class="p-precio">
                $ ${Number(p.precio).toLocaleString("es-AR")}
            </span>

            <div class="p-actions">

                ${
                    p.es_compuesto
                        ? `<button type="button" data-comp="${p.id}" title="Hijos">🧩</button>
                           <button type="button" data-grupos="${p.id}" title="Grupos">🎛️</button>`
                        : ""
                }

                <button type="button" data-editar-prod="${p.id}" title="Editar">✏️</button>

                <button type="button" class="danger" data-desactivar-prod="${p.id}" title="Desactivar">
                    🗑️
                </button>

            </div>

        </article>
    `).join("");

    container.querySelectorAll("[data-editar-prod]").forEach(btn => {

        btn.addEventListener("click", () => {

            abrirProductoModal(
                productos.find(p => p.id === Number(btn.dataset.editarProd))
            );
        });
    });

    container.querySelectorAll("[data-comp]").forEach(btn => {

        btn.addEventListener("click", () => {

            abrirComponentesModal(
                productos.find(p => p.id === Number(btn.dataset.comp))
            );
        });
    });

    container.querySelectorAll("[data-grupos]").forEach(btn => {

        btn.addEventListener("click", () => {

            abrirGruposModal(
                productos.find(p => p.id === Number(btn.dataset.grupos))
            );
        });
    });

    container.querySelectorAll("[data-desactivar-prod]").forEach(btn => {

        btn.addEventListener("click", async () => {

            if (!confirm("¿Desactivar este producto?")) return;

            try {

                await api("DELETE", `/productos/${btn.dataset.desactivarProd}`);

                showToast("Producto desactivado");

                await cargarTodo();

            } catch (error) {

                showToast(error.message || "No se pudo desactivar");
            }
        });
    });
}


/* =========================================================
   RENDER — RUBROS
   ========================================================= */

function renderRubros() {

    const container = document.getElementById("rubrosLista");

    if (!container) {
        return;
    }

    if (!rubros.length) {

        container.innerHTML = `<div class="p-vacio">No hay rubros.</div>`;

        return;
    }

    container.innerHTML = rubros.map(r => `
        <article class="p-row ${r.activo ? "" : "inactivo"}" style="grid-template-columns: 1fr auto;">

            <div>
                <span class="p-nombre">${escapeHtml(r.nombre)}</span>
                ${r.descripcion ? `<span class="p-sub">${escapeHtml(r.descripcion)}</span>` : ""}
            </div>

            <div class="p-actions">
                <button type="button" data-editar-rubro="${r.id}">Editar</button>
                <button type="button" class="danger" data-desactivar-rubro="${r.id}">Desactivar</button>
            </div>

        </article>
    `).join("");

    container.querySelectorAll("[data-editar-rubro]").forEach(btn => {

        btn.addEventListener("click", () => {

            abrirEntidadModal(
                "rubro",
                rubros.find(r => r.id === Number(btn.dataset.editarRubro))
            );
        });
    });

    container.querySelectorAll("[data-desactivar-rubro]").forEach(btn => {

        btn.addEventListener("click", async () => {

            if (!confirm("¿Desactivar este rubro?")) return;

            try {

                await api("DELETE", `/rubros/${btn.dataset.desactivarRubro}`);

                showToast("Rubro desactivado");

                await cargarTodo();

            } catch (error) {

                showToast(error.message || "No se pudo desactivar");
            }
        });
    });
}


/* =========================================================
   RENDER — CATEGORÍAS
   ========================================================= */

function renderCategorias() {

    const container = document.getElementById("categoriasLista");

    if (!container) {
        return;
    }

    if (!categorias.length) {

        container.innerHTML = `<div class="p-vacio">No hay categorías.</div>`;

        return;
    }

    container.innerHTML = categorias.map(c => `
        <article class="p-row ${c.activo ? "" : "inactivo"}" style="grid-template-columns: 1fr auto;">

            <div>
                <span class="p-nombre">${escapeHtml(c.nombre)}</span>
                <span class="p-sub">${escapeHtml(c.rubro)}</span>
            </div>

            <div class="p-actions">
                <button type="button" data-editar-cat="${c.id}">Editar</button>
                <button type="button" class="danger" data-desactivar-cat="${c.id}">Desactivar</button>
            </div>

        </article>
    `).join("");

    container.querySelectorAll("[data-editar-cat]").forEach(btn => {

        btn.addEventListener("click", () => {

            abrirEntidadModal(
                "categoria",
                categorias.find(c => c.id === Number(btn.dataset.editarCat))
            );
        });
    });

    container.querySelectorAll("[data-desactivar-cat]").forEach(btn => {

        btn.addEventListener("click", async () => {

            if (!confirm("¿Desactivar esta categoría?")) return;

            try {

                await api("DELETE", `/categorias/${btn.dataset.desactivarCat}`);

                showToast("Categoría desactivada");

                await cargarTodo();

            } catch (error) {

                showToast(error.message || "No se pudo desactivar");
            }
        });
    });
}


/* =========================================================
   SELECTS AUXILIARES
   ========================================================= */

function poblarSelectRubros(select, seleccionadoId) {

    select.innerHTML = `<option value="">Sin rubro</option>` +
        rubros.filter(r => r.activo).map(r => `
            <option value="${r.id}" ${
                Number(seleccionadoId) === r.id ? "selected" : ""
            }>${escapeHtml(r.nombre)}</option>
        `).join("");
}

function poblarSelectCategorias(select, rubroId, seleccionadoId) {

    const opciones = categorias.filter(c =>
        c.activo && (!rubroId || Number(c.rubro_id) === Number(rubroId))
    );

    select.innerHTML = `<option value="">Sin categoría</option>` +
        opciones.map(c => `
            <option value="${c.id}" ${
                Number(seleccionadoId) === c.id ? "selected" : ""
            }>${escapeHtml(c.nombre)}</option>
        `).join("");
}

function poblarSelectProductosComoComponente(select, excluirId) {

    const opciones = productos.filter(p =>
        p.activo && p.id !== excluirId
    );

    select.innerHTML = opciones.map(p => `
        <option value="${p.id}">${escapeHtml(p.nombre)}</option>
    `).join("");
}


/* =========================================================
   MODAL: PRODUCTO
   ========================================================= */

function abrirProductoModal(producto = null) {

    productoEditandoId = producto ? producto.id : null;
    tipoSeleccionado = producto ? producto.tipo_producto : "NORMAL";
    componentesNuevos = [];
    plantillasAVincularAlCrear = new Set();

    document.getElementById("productoModalTitulo").textContent =
        producto ? "Editar producto" : "Nuevo producto";

    document.getElementById("pNombre").value = producto?.nombre || "";
    document.getElementById("pCodigo").value = producto?.codigo || "";
    document.getElementById("pPrecio").value = producto?.precio ?? "";
    document.getElementById("pCosto").value = producto?.costo ?? "";
    document.getElementById("pStockMinimo").value = producto?.stock_minimo ?? "";
    document.getElementById("pDescripcion").value = producto?.descripcion || "";

    poblarSelectRubros(document.getElementById("pRubro"), producto?.rubro_id);
    poblarSelectCategorias(
        document.getElementById("pCategoria"),
        producto?.rubro_id,
        producto?.categoria_id
    );

    document.querySelectorAll(".ptipo-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tipo === tipoSeleccionado);
    });

    actualizarVisibilidadComponentes(producto);

    if (!producto || !producto.es_compuesto) {

        poblarSelectProductosComoComponente(
            document.getElementById("pComponenteSelect"),
            productoEditandoId
        );

        renderComponentesNuevos();
    }

    document.getElementById("productoModal").style.display = "flex";
}

function renderPlantillasParaVincular() {

    const container = document.getElementById("pPlantillasVincularLista");

    if (!container) return;

    if (!plantillas.length) {

        container.innerHTML = `<span class="muted">
            No tenés plantillas creadas todavía (pestaña "Plantillas").
        </span>`;

        return;
    }

    container.innerHTML = plantillas
        .filter(pl => pl.activo)
        .map(pl => `
            <label style="display:flex; align-items:center; gap:8px; padding:7px 9px; background:var(--panel-soft); border:1px solid var(--border); border-radius:6px; font-size:12px; color:var(--text); cursor:pointer; margin-bottom:5px;">
                <input type="checkbox" data-plantilla-crear="${pl.id}">
                ${escapeHtml(pl.nombre)}
                <span class="muted">(${pl.opciones.length} opciones)</span>
            </label>
        `).join("");

    container.querySelectorAll("[data-plantilla-crear]").forEach(chk => {

        chk.addEventListener("change", () => {

            const id = Number(chk.dataset.plantillaCrear);

            if (chk.checked) {
                plantillasAVincularAlCrear.add(id);
            } else {
                plantillasAVincularAlCrear.delete(id);
            }
        });
    });
}

function actualizarVisibilidadComponentes(producto) {

    const esCompuesto = tipoSeleccionado === "COMPUESTO";
    const esEdicionExistente = !!(producto && producto.id);

    document.getElementById("pCompuestoBox").style.display =
        esCompuesto ? "block" : "none";

    // Vincular plantillas: solo tiene sentido al CREAR
    // (al editar ya existe el checklist dentro de "Grupos")

    document.getElementById("pPlantillasVincularBox").style.display =
        (esCompuesto && !esEdicionExistente) ? "block" : "none";

    if (esCompuesto && !esEdicionExistente) {
        renderPlantillasParaVincular();
    }

    // Botón "Configurar Grupos" — solo al editar un producto
    // que ya existe en la base

    document.getElementById("pGruposEditarAviso").style.display =
        (esCompuesto && esEdicionExistente) ? "block" : "none";

    // Ingredientes fijos (Hijos) — visible en ambos casos,
    // pero colapsado y secundario

    document.getElementById("pComponentesBuilder").style.display =
        (esCompuesto && !esEdicionExistente) ? "block" : "none";

    document.getElementById("pComponentesEditarAviso").style.display =
        (esCompuesto && esEdicionExistente) ? "block" : "none";
}

function cerrarProductoModal() {

    document.getElementById("productoModal").style.display = "none";
    productoEditandoId = null;
    componentesNuevos = [];
    plantillasAVincularAlCrear = new Set();
}

function renderComponentesNuevos() {

    const container = document.getElementById("pComponentesListaNueva");

    if (!componentesNuevos.length) {

        container.innerHTML = `<span class="muted">Todavía no agregaste componentes.</span>`;

        return;
    }

    container.innerHTML = componentesNuevos.map((c, i) => `
        <div class="pcomp-item">
            <span>${c.cantidad}x ${escapeHtml(c.nombre)} <span class="muted">(${c.tipo_relacion})</span></span>
            <button type="button" data-quitar="${i}">Quitar</button>
        </div>
    `).join("");

    container.querySelectorAll("[data-quitar]").forEach(btn => {

        btn.addEventListener("click", () => {

            componentesNuevos.splice(Number(btn.dataset.quitar), 1);

            renderComponentesNuevos();
        });
    });
}

async function guardarProducto() {

    const nombre = document.getElementById("pNombre").value.trim();
    const precio = document.getElementById("pPrecio").value;

    if (!nombre) {
        showToast("El nombre es obligatorio");
        return;
    }

    if (precio === "" || Number(precio) < 0) {
        showToast("Ingresá un precio válido");
        return;
    }

    const rubroId = document.getElementById("pRubro").value || null;
    const categoriaId = document.getElementById("pCategoria").value || null;

    try {

        if (productoEditandoId) {

            // EDITAR — sin componentes (van por endpoint aparte)

            await api("PUT", `/productos/${productoEditandoId}`, {
                nombre,
                codigo: document.getElementById("pCodigo").value.trim() || null,
                rubro_id: rubroId ? Number(rubroId) : null,
                categoria_id: categoriaId ? Number(categoriaId) : null,
                precio: Number(precio),
                costo: Number(document.getElementById("pCosto").value || 0),
                stock_minimo: Number(document.getElementById("pStockMinimo").value || 0),
                descripcion: document.getElementById("pDescripcion").value.trim() || null,
                tipo_producto: tipoSeleccionado
            });

            showToast("Producto actualizado");

        } else {

            // CREAR — con componentes embebidos si es COMPUESTO

            const resultado = await api("POST", "/productos/", {
                nombre,
                codigo: document.getElementById("pCodigo").value.trim() || null,
                rubro_id: rubroId ? Number(rubroId) : null,
                categoria_id: categoriaId ? Number(categoriaId) : null,
                precio: Number(precio),
                costo: Number(document.getElementById("pCosto").value || 0),
                stock_minimo: Number(document.getElementById("pStockMinimo").value || 0),
                descripcion: document.getElementById("pDescripcion").value.trim() || null,
                tipo_producto: tipoSeleccionado,
                componentes: tipoSeleccionado === "COMPUESTO"
                    ? componentesNuevos.map(c => ({
                        componente_id: c.componente_id,
                        cantidad: c.cantidad,
                        tipo_relacion: c.tipo_relacion,
                        obligatorio: true,
                        minimo: 0,
                        maximo: 0,
                        permite_repetir: true
                    }))
                    : []
            });

            const nuevoProductoId = resultado?.producto?.id;

            // Vincular las plantillas que tildaste, si elegiste alguna

            if (nuevoProductoId && plantillasAVincularAlCrear.size) {

                for (const plantillaId of plantillasAVincularAlCrear) {

                    try {

                        await api(
                            "POST",
                            `/productos/${nuevoProductoId}/plantillas/${plantillaId}`
                        );

                    } catch (error) {

                        console.error("ERROR VINCULANDO PLANTILLA:", error);
                    }
                }

                showToast("Producto creado con sus plantillas vinculadas");

            } else {

                showToast("Producto creado");
            }
        }

        cerrarProductoModal();

        await cargarTodo();

    } catch (error) {

        showToast(error.message || "No se pudo guardar el producto");
    }
}


/* =========================================================
   MODAL: COMPONENTES (producto ya existente)
   ========================================================= */

async function abrirComponentesModal(producto) {

    if (!producto) return;

    componentesModalProductoId = producto.id;

    document.getElementById("componentesModalTitulo").textContent =
        `Componentes de "${producto.nombre}"`;

    poblarSelectProductosComoComponente(
        document.getElementById("cmComponenteSelect"),
        producto.id
    );

    document.getElementById("componentesModal").style.display = "flex";

    await recargarComponentesModal();
}

async function recargarComponentesModal() {

    try {

        const data = await api(
            "GET",
            `/productos/${componentesModalProductoId}/componentes`
        );

        componentesModalLista = data.componentes;

        renderComponentesModal();

    } catch (error) {

        showToast(error.message || "No se pudieron cargar los componentes");
    }
}

function renderComponentesModal() {

    const container = document.getElementById("componentesModalLista");

    if (!componentesModalLista.length) {

        container.innerHTML = `<span class="muted">Sin componentes todavía.</span>`;

        return;
    }

    container.innerHTML = componentesModalLista.map(c => `
        <div class="pcomp-item">
            <span>
                ${c.cantidad}x ${escapeHtml(c.nombre)}
                <span class="muted">(${c.tipo_relacion})</span>
            </span>
            <button type="button" data-quitar-comp="${c.id}">Quitar</button>
        </div>
    `).join("");

    container.querySelectorAll("[data-quitar-comp]").forEach(btn => {

        btn.addEventListener("click", async () => {

            try {

                await api(
                    "DELETE",
                    `/productos/${componentesModalProductoId}/componentes/${btn.dataset.quitarComp}`
                );

                await recargarComponentesModal();

            } catch (error) {

                showToast(error.message || "No se pudo quitar");
            }
        });
    });
}

function cerrarComponentesModal() {

    document.getElementById("componentesModal").style.display = "none";
    componentesModalProductoId = null;
}


/* =========================================================
   MODAL: GRUPOS DE SELECCIÓN
   ========================================================= */

async function abrirGruposModal(producto) {

    if (!producto) return;

    gruposModalProductoId = producto.id;
    gruposOpcionesCache = {};
    grupoExpandidoId = null;
    grupoEditandoId = null;

    document.getElementById("gruposModalTitulo").textContent =
        `Grupos de "${producto.nombre}"`;

    limpiarFormGrupo();

    poblarSelectCategoriaAutomatica(document.getElementById("gCategoriaAuto"));

    document.getElementById("gruposModal").style.display = "flex";

    await recargarGrupos();

    await renderPlantillasVinculadas();
}

function cerrarGruposModal() {

    document.getElementById("gruposModal").style.display = "none";
    gruposModalProductoId = null;
}

function limpiarFormGrupo() {

    grupoEditandoId = null;
    document.getElementById("gGrupoId").value = "";
    document.getElementById("gNombre").value = "";
    document.getElementById("gMinimo").value = "0";
    document.getElementById("gMaximo").value = "0";
    document.getElementById("gModoPrecio").value = "INCLUIDO";
    document.getElementById("gCategoriaAuto").value = "";
    document.getElementById("gGuardarGrupo").textContent = "Guardar grupo";
}

function poblarSelectCategoriaAutomatica(select) {

    if (!select) return;

    const actual = select.value;

    select.innerHTML =
        `<option value="">— Cargar opciones a mano —</option>` +
        categorias
            .filter(c => c.activo)
            .map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`)
            .join("");

    select.value = actual;
}

async function recargarGrupos() {

    try {

        const data = await api(
            "GET",
            `/productos/${gruposModalProductoId}/grupos`
        );

        gruposLista = data.grupos;

        renderGruposModal();

    } catch (error) {

        showToast(error.message || "No se pudieron cargar los grupos");
    }
}

function renderGruposModal() {

    const container = document.getElementById("gruposModalLista");

    if (!gruposLista.length) {

        container.innerHTML = `<span class="muted">Todavía no hay grupos.</span>`;

        return;
    }

    container.innerHTML = gruposLista.map(g => `
        <div class="pgrupo-item">

            <div class="pgrupo-item-header">
                <div>
                    <strong>${escapeHtml(g.nombre)}</strong><br>
                    <span>
                        Elegir entre ${g.minimo_selecciones} y
                        ${g.maximo_selecciones || "∞"}
                    </span>
                </div>
                <div class="pgrupo-item-actions">
                    <button type="button" data-toggle-opciones="${g.id}">
                        Opciones
                    </button>
                    <button type="button" data-editar-grupo="${g.id}">Editar</button>
                    <button type="button" data-eliminar-grupo="${g.id}">Eliminar</button>
                </div>
            </div>

            <div class="pgrupo-opciones ${
                grupoExpandidoId === g.id ? "abierto" : ""
            }" id="opcionesDe${g.id}">

                <div class="pcomp-add-row">
                    <select id="opcSelect${g.id}"></select>
                    <input type="number" step="1" value="1" id="opcMin${g.id}" placeholder="Mín">
                    <input type="number" step="1" value="1" id="opcMax${g.id}" placeholder="Máx">
                    <button type="button" data-agregar-opcion="${g.id}">Agregar</button>
                </div>

                <div id="listaOpciones${g.id}"></div>

            </div>

        </div>
    `).join("");

    conectarEventosGrupos();

    if (grupoExpandidoId) {
        cargarOpcionesDeGrupo(grupoExpandidoId);
    }
}

function conectarEventosGrupos() {

    document.querySelectorAll("[data-toggle-opciones]").forEach(btn => {

        btn.addEventListener("click", () => {

            const id = Number(btn.dataset.toggleOpciones);

            grupoExpandidoId = grupoExpandidoId === id ? null : id;

            renderGruposModal();
        });
    });

    document.querySelectorAll("[data-editar-grupo]").forEach(btn => {

        btn.addEventListener("click", () => {

            const grupo = gruposLista.find(
                g => g.id === Number(btn.dataset.editarGrupo)
            );

            grupoEditandoId = grupo.id;
            document.getElementById("gGrupoId").value = grupo.id;
            document.getElementById("gNombre").value = grupo.nombre;
            document.getElementById("gMinimo").value = grupo.minimo_selecciones;
            document.getElementById("gMaximo").value = grupo.maximo_selecciones;
            document.getElementById("gModoPrecio").value = grupo.modo_precio || "INCLUIDO";
            document.getElementById("gCategoriaAuto").value = grupo.categoria_automatica_id || "";
            document.getElementById("gGuardarGrupo").textContent = "Actualizar grupo";
        });
    });

    document.querySelectorAll("[data-eliminar-grupo]").forEach(btn => {

        btn.addEventListener("click", async () => {

            if (!confirm("¿Eliminar este grupo?")) return;

            try {

                await api(
                    "DELETE",
                    `/productos/${gruposModalProductoId}/grupos/${btn.dataset.eliminarGrupo}`
                );

                await recargarGrupos();

            } catch (error) {

                showToast(error.message || "No se pudo eliminar");
            }
        });
    });

    document.querySelectorAll("[data-agregar-opcion]").forEach(btn => {

        btn.addEventListener("click", async () => {

            const grupoId = Number(btn.dataset.agregarOpcion);

            const select = document.getElementById(`opcSelect${grupoId}`);

            if (!select.value) return;

            try {

                await api(
                    "POST",
                    `/productos/${gruposModalProductoId}/grupos/${grupoId}/opciones`,
                    {
                        componente_id: Number(select.value),
                        cantidad: 1,
                        tipo_relacion: "SELECCION",
                        obligatorio: false,
                        minimo_cantidad: Number(
                            document.getElementById(`opcMin${grupoId}`).value || 0
                        ),
                        maximo_cantidad: Number(
                            document.getElementById(`opcMax${grupoId}`).value || 1
                        ),
                        permite_repetir: false
                    }
                );

                await cargarOpcionesDeGrupo(grupoId);

            } catch (error) {

                showToast(error.message || "No se pudo agregar la opción");
            }
        });
    });
}

async function cargarOpcionesDeGrupo(grupoId) {

    const select = document.getElementById(`opcSelect${grupoId}`);

    if (select) {

        poblarSelectProductosComoComponente(select, gruposModalProductoId);
    }

    try {

        const data = await api(
            "GET",
            `/productos/${gruposModalProductoId}/grupos/${grupoId}/opciones`
        );

        gruposOpcionesCache[grupoId] = data.opciones;

        renderOpcionesDeGrupo(grupoId);

    } catch (error) {

        showToast(error.message || "No se pudieron cargar las opciones");
    }
}

function renderOpcionesDeGrupo(grupoId) {

    const container = document.getElementById(`listaOpciones${grupoId}`);

    if (!container) return;

    const grupo = gruposLista.find(g => g.id === grupoId);

    if (grupo?.categoria_automatica_id) {

        container.innerHTML = `
            <p class="muted" style="font-size:11px; margin:0;">
                Este grupo usa categoría automática — las opciones
                se resuelven solas, no hace falta (ni se puede)
                cargarlas acá.
            </p>
        `;

        return;
    }

    const opciones = gruposOpcionesCache[grupoId] || [];

    if (!opciones.length) {

        container.innerHTML = `<span class="muted">Sin opciones todavía.</span>`;

        return;
    }

    container.innerHTML = opciones.map(o => `
        <div class="popcion-item">
            <span>
                ${escapeHtml(o.nombre)}
                <span class="muted">(${o.minimo_cantidad}-${o.maximo_cantidad})</span>
            </span>
            <button type="button" data-quitar-opcion="${o.id}" data-grupo="${grupoId}">
                Quitar
            </button>
        </div>
    `).join("");

    container.querySelectorAll("[data-quitar-opcion]").forEach(btn => {

        btn.addEventListener("click", async () => {

            try {

                await api(
                    "DELETE",
                    `/productos/${gruposModalProductoId}/grupos/${btn.dataset.grupo}/opciones/${btn.dataset.quitarOpcion}`
                );

                await cargarOpcionesDeGrupo(Number(btn.dataset.grupo));

            } catch (error) {

                showToast(error.message || "No se pudo quitar");
            }
        });
    });
}

async function guardarGrupo() {

    const nombre = document.getElementById("gNombre").value.trim();

    if (!nombre) {
        showToast("El nombre del grupo es obligatorio");
        return;
    }

    const payload = {
        nombre,
        minimo_selecciones: Number(document.getElementById("gMinimo").value || 0),
        maximo_selecciones: Number(document.getElementById("gMaximo").value || 0),
        orden: 0,
        modo_precio: document.getElementById("gModoPrecio").value,
        categoria_automatica_id:
            document.getElementById("gCategoriaAuto").value
                ? Number(document.getElementById("gCategoriaAuto").value)
                : null
    };

    try {

        if (grupoEditandoId) {

            await api(
                "PUT",
                `/productos/${gruposModalProductoId}/grupos/${grupoEditandoId}`,
                payload
            );

        } else {

            await api(
                "POST",
                `/productos/${gruposModalProductoId}/grupos`,
                payload
            );
        }

        limpiarFormGrupo();

        await recargarGrupos();

    } catch (error) {

        showToast(error.message || "No se pudo guardar el grupo");
    }
}


/* =========================================================
   RENDER — PLANTILLAS
   ========================================================= */

function renderPlantillas() {

    const container = document.getElementById("plantillasLista");

    if (!container) {
        return;
    }

    if (!plantillas.length) {

        container.innerHTML = `<div class="p-vacio">
            No hay plantillas todavía. Creá una (ej: "Sabores")
            y después vinculala desde el botón "Grupos" de
            cada producto compuesto.
        </div>`;

        return;
    }

    container.innerHTML = plantillas.map(pl => `
        <article class="p-row ${pl.activo ? "" : "inactivo"}" style="grid-template-columns: 1fr auto;">

            <div>
                <span class="p-nombre">${escapeHtml(pl.nombre)}</span>
                <span class="p-sub">
                    Mín ${pl.minimo_selecciones} · Máx ${pl.maximo_selecciones || "∞"}
                    · ${pl.opciones.length} opción/es
                </span>
            </div>

            <div class="p-actions">
                <button type="button" data-editar-plantilla="${pl.id}" title="Editar">✏️</button>
                <button type="button" class="danger" data-desactivar-plantilla="${pl.id}" title="Desactivar">🗑️</button>
            </div>

        </article>
    `).join("");

    container.querySelectorAll("[data-editar-plantilla]").forEach(btn => {

        btn.addEventListener("click", () => {

            abrirPlantillaModal(
                plantillas.find(pl => pl.id === Number(btn.dataset.editarPlantilla))
            );
        });
    });

    container.querySelectorAll("[data-desactivar-plantilla]").forEach(btn => {

        btn.addEventListener("click", async () => {

            if (!confirm("¿Desactivar esta plantilla? Se va a desvincular de todos los productos que la usen.")) return;

            try {

                await api("DELETE", `/plantillas-grupos/${btn.dataset.desactivarPlantilla}`);

                showToast("Plantilla desactivada");

                await cargarTodo();

            } catch (error) {

                showToast(error.message || "No se pudo desactivar");
            }
        });
    });
}


/* =========================================================
   MODAL: PLANTILLA
   ========================================================= */

function abrirPlantillaModal(plantilla = null) {

    plantillaEditandoId = plantilla ? plantilla.id : null;
    plantillaOpcionesCache = plantilla ? plantilla.opciones : [];

    document.getElementById("plantillaModalTitulo").textContent =
        plantilla ? "Editar plantilla" : "Nueva plantilla";

    document.getElementById("plGrupoId").value = plantilla?.id || "";
    document.getElementById("plNombre").value = plantilla?.nombre || "";
    document.getElementById("plMinimo").value = plantilla?.minimo_selecciones ?? 0;
    document.getElementById("plMaximo").value = plantilla?.maximo_selecciones ?? 0;
    document.getElementById("plModoPrecio").value = plantilla?.modo_precio || "INCLUIDO";

    poblarSelectCategoriaAutomatica(document.getElementById("plCategoriaAuto"));

    document.getElementById("plCategoriaAuto").value = plantilla?.categoria_automatica_id || "";

    document.getElementById("plGuardarDatos").textContent =
        plantilla ? "Actualizar datos" : "Crear plantilla";

    const opcionesBox = document.getElementById("plOpcionesBox");
    const addRow = document.querySelector("#plOpcionesBox .pcomp-add-row");
    const esAutomatica = !!(plantilla?.categoria_automatica_id);

    if (plantilla) {

        opcionesBox.style.display = "block";

        if (esAutomatica) {

            if (addRow) addRow.style.display = "none";

            const lista = document.getElementById("plOpcionesLista");

            lista.innerHTML = `
                <p class="muted" style="font-size:11.5px; margin:0 0 8px;">
                    Estas opciones se resuelven solas desde la
                    categoría elegida arriba — para agregar o
                    sacar una, hacelo desde esa categoría en
                    Productos, no acá.
                </p>
                ${plantilla.opciones.map(o => `
                    <div class="pcomp-item">
                        <span>${escapeHtml(o.nombre)}</span>
                    </div>
                `).join("")}
            `;

        } else {

            if (addRow) addRow.style.display = "flex";

            poblarSelectProductosComoComponente(
                document.getElementById("plComponenteSelect"),
                null
            );

            renderOpcionesPlantilla();
        }

    } else {

        opcionesBox.style.display = "none";
    }

    document.getElementById("plantillaModal").style.display = "flex";
}

function cerrarPlantillaModal() {

    document.getElementById("plantillaModal").style.display = "none";
    plantillaEditandoId = null;
}

async function guardarDatosPlantilla() {

    const nombre = document.getElementById("plNombre").value.trim();

    if (!nombre) {
        showToast("El nombre es obligatorio");
        return;
    }

    const payload = {
        nombre,
        minimo_selecciones: Number(document.getElementById("plMinimo").value || 0),
        maximo_selecciones: Number(document.getElementById("plMaximo").value || 0),
        modo_precio: document.getElementById("plModoPrecio").value,
        categoria_automatica_id:
            document.getElementById("plCategoriaAuto").value
                ? Number(document.getElementById("plCategoriaAuto").value)
                : null
    };

    try {

        if (plantillaEditandoId) {

            await api("PUT", `/plantillas-grupos/${plantillaEditandoId}`, payload);

            showToast("Plantilla actualizada");

            await cargarTodo();

            abrirPlantillaModal(
                plantillas.find(pl => pl.id === plantillaEditandoId)
            );

        } else {

            const resultado = await api("POST", "/plantillas-grupos", payload);

            showToast("Plantilla creada — ahora agregale opciones");

            await cargarTodo();

            abrirPlantillaModal(
                plantillas.find(pl => pl.id === resultado.id)
            );
        }

    } catch (error) {

        showToast(error.message || "No se pudo guardar la plantilla");
    }
}

function renderOpcionesPlantilla() {

    const container = document.getElementById("plOpcionesLista");

    if (!plantillaOpcionesCache.length) {

        container.innerHTML = `<span class="muted">Sin opciones todavía.</span>`;

        return;
    }

    container.innerHTML = plantillaOpcionesCache.map(o => `
        <div class="pcomp-item">
            <span>
                ${escapeHtml(o.nombre)}
                <span class="muted">(${o.minimo_cantidad}-${o.maximo_cantidad})</span>
            </span>
            <button type="button" data-quitar-plopcion="${o.id}">Quitar</button>
        </div>
    `).join("");

    container.querySelectorAll("[data-quitar-plopcion]").forEach(btn => {

        btn.addEventListener("click", async () => {

            try {

                await api(
                    "DELETE",
                    `/plantillas-grupos/${plantillaEditandoId}/opciones/${btn.dataset.quitarPlopcion}`
                );

                await cargarTodo();

                abrirPlantillaModal(
                    plantillas.find(pl => pl.id === plantillaEditandoId)
                );

            } catch (error) {

                showToast(error.message || "No se pudo quitar");
            }
        });
    });
}


/* =========================================================
   PLANTILLAS VINCULADAS A UN PRODUCTO (dentro de "Grupos")
   ========================================================= */

async function renderPlantillasVinculadas() {

    const box = document.getElementById("plantillasVinculadasLista");

    if (!box) return;

    if (!plantillas.length) {

        box.innerHTML = `<span class="muted">
            Todavía no creaste ninguna plantilla (pestaña "Plantillas").
        </span>`;

        return;
    }

    let vinculadas = [];

    try {

        const data = await api(
            "GET",
            `/productos/${gruposModalProductoId}/plantillas`
        );

        vinculadas = data.plantilla_ids;

    } catch (error) {

        showToast("No se pudieron cargar las plantillas vinculadas");
    }

    box.innerHTML = plantillas
        .filter(pl => pl.activo)
        .map(pl => `
            <label style="
                display:flex; align-items:center; gap:8px;
                padding:7px 9px; margin-bottom:5px;
                background:var(--panel-soft); border:1px solid var(--border);
                border-radius:6px; font-size:12px; color:var(--text);
                cursor:pointer;
            ">
                <input
                    type="checkbox"
                    data-plantilla-check="${pl.id}"
                    ${vinculadas.includes(pl.id) ? "checked" : ""}
                >
                ${escapeHtml(pl.nombre)}
                <span class="muted">(${pl.opciones.length} opciones)</span>
            </label>
        `).join("");

    box.querySelectorAll("[data-plantilla-check]").forEach(chk => {

        chk.addEventListener("change", async () => {

            const plantillaId = Number(chk.dataset.plantillaCheck);

            try {

                if (chk.checked) {

                    await api(
                        "POST",
                        `/productos/${gruposModalProductoId}/plantillas/${plantillaId}`
                    );

                } else {

                    await api(
                        "DELETE",
                        `/productos/${gruposModalProductoId}/plantillas/${plantillaId}`
                    );
                }

                showToast(
                    chk.checked ? "Plantilla vinculada" : "Plantilla desvinculada"
                );

            } catch (error) {

                chk.checked = !chk.checked;

                showToast(error.message || "No se pudo actualizar");
            }
        });
    });
}


/* =========================================================
   MODAL: RUBRO / CATEGORÍA (genérico)
   ========================================================= */

function abrirEntidadModal(modo, entidad = null) {

    entidadModo = modo;
    entidadEditandoId = entidad ? entidad.id : null;

    const esRubro = modo === "rubro";

    document.getElementById("entidadModalTitulo").textContent =
        (entidad ? "Editar " : "Nuevo/a ") + (esRubro ? "rubro" : "categoría");

    document.getElementById("entidadRubroField").style.display =
        esRubro ? "none" : "flex";

    if (!esRubro) {

        poblarSelectRubros(
            document.getElementById("eRubro"),
            entidad?.rubro_id
        );
    }

    document.getElementById("eNombre").value = entidad?.nombre || "";
    document.getElementById("eDescripcion").value = entidad?.descripcion || "";

    document.getElementById("entidadModal").style.display = "flex";
}

function cerrarEntidadModal() {

    document.getElementById("entidadModal").style.display = "none";
    entidadEditandoId = null;
}

async function guardarEntidad() {

    const nombre = document.getElementById("eNombre").value.trim();

    if (!nombre) {
        showToast("El nombre es obligatorio");
        return;
    }

    const esRubro = entidadModo === "rubro";

    if (!esRubro && !document.getElementById("eRubro").value) {
        showToast("Elegí un rubro para la categoría");
        return;
    }

    const base = esRubro ? "/rubros" : "/categorias";

    const payload = esRubro
        ? {
            nombre,
            descripcion: document.getElementById("eDescripcion").value.trim() || null
        }
        : {
            rubro_id: Number(document.getElementById("eRubro").value),
            nombre,
            descripcion: document.getElementById("eDescripcion").value.trim() || null
        };

    try {

        if (entidadEditandoId) {
            await api("PUT", `${base}/${entidadEditandoId}`, payload);
        } else {
            await api("POST", `${base}/`, payload);
        }

        showToast(esRubro ? "Rubro guardado" : "Categoría guardada");

        cerrarEntidadModal();

        await cargarTodo();

    } catch (error) {

        showToast(error.message || "No se pudo guardar");
    }
}


/* =========================================================
   EVENTOS
   ========================================================= */

function inicializarEventos() {

    inicializarTabs();

    document.getElementById("productosBuscar")
        .addEventListener("input", renderProductos);

    document.getElementById("filtroRubro")
        .addEventListener("change", renderProductos);

    document.getElementById("filtroCategoria")
        .addEventListener("change", renderProductos);

    document.getElementById("filtroEstado")
        .addEventListener("change", renderProductos);

    document.getElementById("btnNuevoProducto")
        .addEventListener("click", () => abrirProductoModal());

    document.getElementById("productoModalCerrar")
        .addEventListener("click", cerrarProductoModal);

    document.getElementById("productoModalCancelar")
        .addEventListener("click", cerrarProductoModal);

    document.getElementById("productoModalGuardar")
        .addEventListener("click", guardarProducto);

    document.getElementById("pRubro").addEventListener("change", event => {

        poblarSelectCategorias(
            document.getElementById("pCategoria"),
            event.target.value,
            null
        );
    });

    document.querySelectorAll(".ptipo-btn").forEach(btn => {

        btn.addEventListener("click", () => {

            tipoSeleccionado = btn.dataset.tipo;

            document.querySelectorAll(".ptipo-btn")
                .forEach(b => b.classList.toggle("active", b === btn));

            actualizarVisibilidadComponentes(
                productoEditandoId
                    ? { id: productoEditandoId }
                    : null
            );
        });
    });

    document.getElementById("pComponenteAgregar")
        .addEventListener("click", () => {

            const select = document.getElementById("pComponenteSelect");

            if (!select.value) return;

            const cantidad = Number(
                document.getElementById("pComponenteCantidad").value || 1
            );

            componentesNuevos.push({
                componente_id: Number(select.value),
                nombre: select.options[select.selectedIndex].text,
                cantidad,
                tipo_relacion: document.getElementById("pComponenteRelacion").value
            });

            renderComponentesNuevos();
        });

    document.getElementById("btnGestionarComponentes")
        .addEventListener("click", () => {

            if (!productoEditandoId) return;

            const idActual = productoEditandoId;

            const productoActual = productos.find(p => p.id === idActual);

            cerrarProductoModal();

            abrirComponentesModal(productoActual);
        });

    document.getElementById("btnGestionarGrupos")
        .addEventListener("click", () => {

            if (!productoEditandoId) return;

            const idActual = productoEditandoId;

            const productoActual = productos.find(p => p.id === idActual);

            cerrarProductoModal();

            abrirGruposModal(productoActual);
        });

    // Componentes modal (producto existente)

    document.getElementById("componentesModalCerrar")
        .addEventListener("click", cerrarComponentesModal);

    document.getElementById("componentesModalCerrar2")
        .addEventListener("click", cerrarComponentesModal);

    document.getElementById("cmAgregar")
        .addEventListener("click", async () => {

            const select = document.getElementById("cmComponenteSelect");

            if (!select.value) return;

            try {

                await api(
                    "POST",
                    `/productos/${componentesModalProductoId}/componentes`,
                    {
                        componente_id: Number(select.value),
                        cantidad: Number(
                            document.getElementById("cmCantidad").value || 1
                        ),
                        tipo_relacion: document.getElementById("cmRelacion").value,
                        obligatorio: true,
                        minimo: 0,
                        maximo: 0,
                        permite_repetir: true
                    }
                );

                await recargarComponentesModal();

            } catch (error) {

                showToast(error.message || "No se pudo agregar");
            }
        });

    // Grupos

    document.getElementById("gruposModalCerrar")
        .addEventListener("click", cerrarGruposModal);

    document.getElementById("gruposModalCerrar2")
        .addEventListener("click", cerrarGruposModal);

    document.getElementById("gGuardarGrupo")
        .addEventListener("click", guardarGrupo);

    // Rubros / Categorías

    document.getElementById("btnNuevoRubro")
        .addEventListener("click", () => abrirEntidadModal("rubro"));

    document.getElementById("btnNuevaCategoria")
        .addEventListener("click", () => abrirEntidadModal("categoria"));

    document.getElementById("entidadModalCerrar")
        .addEventListener("click", cerrarEntidadModal);

    document.getElementById("entidadModalCancelar")
        .addEventListener("click", cerrarEntidadModal);

    document.getElementById("entidadModalGuardar")
        .addEventListener("click", guardarEntidad);

    // Plantillas

    document.getElementById("btnNuevaPlantilla")
        .addEventListener("click", () => abrirPlantillaModal());

    document.getElementById("plantillaModalCerrar")
        .addEventListener("click", cerrarPlantillaModal);

    document.getElementById("plantillaModalCerrar2")
        .addEventListener("click", cerrarPlantillaModal);

    document.getElementById("plGuardarDatos")
        .addEventListener("click", guardarDatosPlantilla);

    document.getElementById("plAgregarOpcion")
        .addEventListener("click", async () => {

            const select = document.getElementById("plComponenteSelect");

            if (!select.value || !plantillaEditandoId) return;

            try {

                await api(
                    "POST",
                    `/plantillas-grupos/${plantillaEditandoId}/opciones`,
                    {
                        componente_id: Number(select.value),
                        cantidad: 1,
                        tipo_relacion: "SELECCION",
                        obligatorio: false,
                        minimo_cantidad: Number(
                            document.getElementById("plOpcionMin").value || 0
                        ),
                        maximo_cantidad: Number(
                            document.getElementById("plOpcionMax").value || 1
                        ),
                        permite_repetir: false
                    }
                );

                await cargarTodo();

                abrirPlantillaModal(
                    plantillas.find(pl => pl.id === plantillaEditandoId)
                );

            } catch (error) {

                showToast(error.message || "No se pudo agregar la opción");
            }
        });
}


/* =========================================================
   INIT / DESTROY
   ========================================================= */

async function inicializar() {

    inicializarEventos();

    await cargarTodo();
}

function destruir() {
    // Sin intervalos que limpiar por ahora.
}

window.LightPOS = window.LightPOS || {};
window.LightPOS.productos = {
    init: inicializar,
    destroy: destruir
};

})();