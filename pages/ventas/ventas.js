/* =========================================================
   LIGHT POS - PEDIDOS
   =========================================================

   ESTA PANTALLA NO CREA VENTAS.

   FLUJO:

   CLIENTE
      ↓
   PRODUCTOS
      ↓
   CARRITO
      ↓
   PROCESAR PEDIDO
      ↓
   POST /pedidos/pos
      ↓
   PEDIDO ACTIVO
      ↓
   LIMPIAR PANTALLA

   EL COBRO SE HACE DESPUÉS,
   DESDE PEDIDOS ACTIVOS.

   ========================================================= */

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
   ESTADO GLOBAL
   ========================================================= */

let productos = [];
let clientes = [];

let carrito = [];
let cartLineIdCounter = 1;

let variedadProductoActual = null;
let variedadGrupos = [];
let variedadSeleccion = {};

let pedidosActivos = [];
let pedidoActivoSeleccionado = null;

let clienteActual = null;

let categoriaActual = "Todos";

let procesandoPedido = false;
let modoEdicionPedidoId = null;
let modoEdicionCliente = false;

/* =========================================================
   ACTUALIZACIÓN AUTOMÁTICA PEDIDOS
   ========================================================= */

let intervaloPedidos = null;

let intervaloRelojPedidos = null;

let intervaloPedidosActivos = null;

let cargandoPedidosAutomaticamente = false;

let pedidosActivosAnterior = [];

let actualizandoPedidos = false;

const INTERVALO_PEDIDOS_MS = 3000;
const INTERVALO_RELOJ_MS = 1000;
/*
   IMPORTANTE:

   El medio de pago NO se utiliza para crear
   el pedido.

   Se utilizará posteriormente cuando
   cobremos desde PEDIDOS ACTIVOS.
*/

let medioPagoActual = "Efectivo";
let descuentoTipo = "MONTO";
let descuentoValor = 0;
let dineroRecibido = 0;


/* =========================================================
   FORMATO MONEDA
   ========================================================= */

function money(value) {

    return new Intl.NumberFormat(
        "es-AR",
        {
            style: "currency",
            currency: "ARS",
            maximumFractionDigits: 0
        }
    ).format(
        Number(value) || 0
    );
}


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
   PRODUCTOS
   ========================================================= */

async function cargarProductos() {

    try {

        console.log(
            "Consultando productos:",
            `${API_URL}/productos`
        );

        const respuesta = await fetch(
            `${API_URL}/productos`,
            {
                method: "GET",
                headers: authHeaders()
            }
        );

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) {
                return;
            }

            throw new Error(
                `HTTP ${respuesta.status}`
            );
        }

        const data = await respuesta.json();

        console.log(
            "PRODUCTOS API:",
            data
        );

        productos = (Array.isArray(data) ? data : [])
            .filter(p => p.activo !== false);

        renderCategories();
        renderProducts();

    } catch (error) {

        console.error(
            "ERROR CARGANDO PRODUCTOS:",
            error
        );

        showToast(
            "No se pudieron cargar los productos"
        );
    }
}


/* =========================================================
   CLIENTES
   ========================================================= */

async function cargarClientes() {

    try {

        console.log(
            "Consultando clientes:",
            `${API_URL}/clientes/`
        );

        const respuesta = await fetch(
            `${API_URL}/clientes/`,
            {
                method: "GET",
                headers: authHeaders()
            }
        );

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) {
                return;
            }

            throw new Error(
                `HTTP ${respuesta.status}`
            );
        }

        const data = await respuesta.json();

        console.log(
            "CLIENTES API:",
            data
        );

        clientes = Array.isArray(data)
            ? data
            : [];

    } catch (error) {

        console.error(
            "ERROR CARGANDO CLIENTES:",
            error
        );

        showToast(
            "No se pudieron cargar los clientes"
        );
    }
}


/* =========================================================
   BUSCAR CLIENTES
   ========================================================= */

async function buscarClientes() {

    const input = document.getElementById(
        "clientSearch"
    );

    if (!input) {
        return;
    }

    const texto = input.value.trim();

    if (!texto) {

        showToast(
            "Ingresá un dato para buscar"
        );

        return;
    }

    try {

        const url =
            `${API_URL}/clientes/?buscar=${encodeURIComponent(texto)}`;

        console.log(
            "Buscando clientes:",
            url
        );

        const respuesta = await fetch(
            url,
            {
                method: "GET",
                headers: authHeaders()
            }
        );

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) {
                return;
            }

            throw new Error(
                `HTTP ${respuesta.status}`
            );
        }

        const resultados = (await respuesta.json())
            .filter(c => c.activo !== false);

        console.log(
            "RESULTADOS CLIENTES:",
            resultados
        );

        if (
            !Array.isArray(resultados) ||
            resultados.length === 0
        ) {

            showToast(
                "No se encontraron clientes"
            );

            return;
        }

        if (resultados.length === 1) {

            seleccionarCliente(
                resultados[0]
            );

            return;
        }

        mostrarResultadosClientes(
            resultados
        );

    } catch (error) {

        console.error(
            "ERROR BUSCANDO CLIENTE:",
            error
        );

        showToast(
            "No se pudo buscar el cliente"
        );
    }
}


/* =========================================================
   MOSTRAR RESULTADOS CLIENTES
   ========================================================= */

function mostrarResultadosClientes(resultados) {

    const container =
        document.getElementById("clientsList");

    const selector =
        document.getElementById("clientSelector");

    if (!container) {
        return;
    }

    container.innerHTML = resultados
        .map(cliente => {

            return `
                <button
                    type="button"
                    class="client-option"
                    data-client-id="${escapeHtml(cliente.id)}"
                >

                    <div>

                        <strong>
                            ${escapeHtml(cliente.nombre || "")}
                        </strong>

                        <span>
                            Dirección:
                            ${escapeHtml(cliente.domicilio_fiscal || "-")}
                        </span>

                        <span>
                            Documento:
                            ${escapeHtml(cliente.documento || "-")}
                        </span>

                    </div>

                    <span>
                        Seleccionar
                    </span>

                </button>
            `;

        })
        .join("");

    container
        .querySelectorAll(".client-option")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const id =
                        Number(button.dataset.clientId);

                    const cliente =
                        resultados.find(
                            item =>
                                Number(item.id) === id
                        );

                    if (cliente) {

                        seleccionarCliente(
                            cliente
                        );
                    }
                }
            );
        });

    if (selector) {

        selector.style.display = "flex";
    }
}


/* =========================================================
   SELECCIONAR CLIENTE
   ========================================================= */

function seleccionarCliente(cliente) {

    if (!cliente) {
        return;
    }

    console.log(
        "CLIENTE SELECCIONADO:",
        cliente
    );

    clienteActual = cliente;

    const clientName =
        document.getElementById("clientName");

    const clientDocument =
        document.getElementById("clientDocument");

    const clientAddress =
        document.getElementById("clientAddress1");

    const clientPhone =
        document.getElementById("clientPhone");

    if (clientName) {

        clientName.textContent =
            cliente.nombre || "Sin nombre";
    }

    if (clientDocument) {

        clientDocument.textContent =
            cliente.documento
                ? `Documento: ${cliente.documento}`
                : "Sin documento";
    }

    if (clientAddress) {

        clientAddress.textContent =
            cliente.domicilio_fiscal ||
            cliente.direccion ||
            "—";
    }

    const direccionInput = document.getElementById("editDireccionInput");

    if (direccionInput && !modoEdicionPedidoId) {

        direccionInput.value =
            cliente.domicilio_fiscal ||
            cliente.direccion ||
            "";
    }

    if (clientPhone) {

        clientPhone.textContent =
            cliente.telefono ||
            "—";
    }

    const selector =
        document.getElementById("clientSelector");

    if (selector) {

        selector.style.display = "none";
    }

    const search =
        document.getElementById("clientSearch");

    if (search) {

        search.value = "";
    }

    showToast(
        `Cliente seleccionado: ${cliente.nombre || ""}`
    );

    updateTotals();
}


/* =========================================================
   LIMPIAR CLIENTE
   ========================================================= */

function limpiarCliente() {

    clienteActual = null;

    const clientName =
        document.getElementById("clientName");

    const clientDocument =
        document.getElementById("clientDocument");

    const clientAddress =
        document.getElementById("clientAddress1");

    const clientPhone =
        document.getElementById("clientPhone");

    const search =
        document.getElementById("clientSearch");

    if (clientName) {

        clientName.textContent =
            "Sin cliente";
    }

    if (clientDocument) {

        clientDocument.textContent =
            "Sin cliente";
    }

    if (clientAddress) {

        clientAddress.textContent =
            "—";
    }

    if (clientPhone) {

        clientPhone.textContent =
            "—";
    }

    if (search) {

        search.value = "";
    }

    const selector =
        document.getElementById("clientSelector");

    if (selector) {

        selector.style.display = "none";
    }
}

/* =========================================================
   MODAL CLIENTES
   ========================================================= */

function abrirModalCliente(cliente = null) {

    const modal = document.getElementById("clientModal");

    if (!modal) {
        console.warn("No existe #clientModal");
        return;
    }

    const titulo = modal.querySelector(".client-modal-header h3");
    const telefono = document.getElementById("clienteTelefono");
    const nombre = document.getElementById("clienteNombre");
    const direccion = document.getElementById("clienteDireccion");

    modoEdicionCliente = !!cliente;

    if (titulo) {
        titulo.textContent = cliente
            ? "Editar cliente"
            : "Nuevo cliente";
    }

    if (telefono) {
        telefono.value = cliente?.telefono || "";
    }

    if (nombre) {
        nombre.value = cliente?.nombre || "";
    }

    if (direccion) {
        direccion.value =
            cliente?.domicilio_fiscal ||
            cliente?.direccion ||
            "";
    }

    modal.style.display = "flex";

    setTimeout(() => {

        if (telefono) {
            telefono.focus();
        }

    }, 50);
}


function cerrarModalCliente() {

    const modal =
        document.getElementById("clientModal");

    if (!modal) {
        return;
    }

    modal.style.display = "none";

    modoEdicionCliente = false;

    const telefono =
        document.getElementById("clienteTelefono");

    const nombre =
        document.getElementById("clienteNombre");

    const direccion =
        document.getElementById("clienteDireccion");

    if (telefono) telefono.value = "";
    if (nombre) nombre.value = "";
    if (direccion) direccion.value = "";
}


async function guardarCliente() {

    const telefono =
        document.getElementById("clienteTelefono")?.value.trim();

    const nombre =
        document.getElementById("clienteNombre")?.value.trim();

    const direccion =
        document.getElementById("clienteDireccion")?.value.trim();

    if (!nombre) {
        showToast("Ingresá el nombre del cliente");
        return;
    }

    if (!telefono) {
        showToast("Ingresá el teléfono del cliente");
        return;
    }

    const estabaEditando = modoEdicionCliente;

    const payload = {
        nombre: nombre,
        telefono: telefono,
        direccion: direccion || null
    };

    console.log("CLIENTE PAYLOAD:", payload);

    try {

        let respuesta;

        /* =====================================================
           EDITAR
        ===================================================== */

        if (
            modoEdicionCliente &&
            clienteActual?.id
        ) {

            const idCliente =
                Number(clienteActual.id);

            const url =
                `${API_URL}/clientes/${idCliente}`;

            console.log("PUT CLIENTE:", url);

            respuesta = await fetch(
                url,
                {
                    method: "PUT",
                    headers: authHeaders(),
                    body: JSON.stringify(payload)
                }
            );
        }

        /* =====================================================
           CREAR
        ===================================================== */

        else {

            const url =
                `${API_URL}/clientes/`;

            console.log("POST CLIENTE:", url);

            respuesta = await fetch(
                url,
                {
                    method: "POST",
                    headers: authHeaders(),
                    body: JSON.stringify(payload)
                }
            );
        }

        /* =====================================================
           ERROR HTTP
        ===================================================== */

        if (!respuesta.ok) {

            if (
                manejarErrorAuth(
                    respuesta.status
                )
            ) {
                return;
            }

            let detalle = "";

            try {

                const errorData =
                    await respuesta.json();

                detalle =
                    errorData?.detail
                        ? JSON.stringify(errorData.detail)
                        : JSON.stringify(errorData);

            } catch {

                detalle =
                    await respuesta.text();
            }

            throw new Error(
                `HTTP ${respuesta.status} - ${detalle}`
            );
        }

        /* =====================================================
           EDITAR
           El PUT puede devolver 200, 204 o una respuesta
           sin el objeto completo.
        ===================================================== */

        if (estabaEditando) {

            let resultado = null;

            try {

                const texto =
                    await respuesta.text();

                if (texto) {
                    resultado =
                        JSON.parse(texto);
                }

            } catch {
                resultado = null;
            }

            console.log(
                "RESPUESTA UPDATE CLIENTE:",
                resultado
            );

            /*
             * No necesitamos que el PUT devuelva
             * nuevamente todo el cliente.
             *
             * Ya tenemos el cliente original.
             * Actualizamos sus datos localmente.
             */

            const clienteActualizado = {
                ...clienteActual,
                nombre: nombre,
                telefono: telefono,
                direccion: direccion || null,
                domicilio_fiscal:
                    direccion || null
            };

            const indice =
                clientes.findIndex(
                    cliente =>
                        Number(cliente.id) ===
                        Number(clienteActual.id)
                );

            if (indice >= 0) {

                clientes[indice] =
                    clienteActualizado;

            } else {

                clientes.push(
                    clienteActualizado
                );
            }

            seleccionarCliente(
                clienteActualizado
            );

            cerrarModalCliente();

            showToast(
                "Cliente actualizado"
            );

            return;
        }

        /* =====================================================
           CREAR
        ===================================================== */

        const resultado =
            await respuesta.json();

        console.log(
            "RESPUESTA CLIENTE:",
            resultado
        );

        const clienteCreado =
            resultado?.cliente ||
            resultado?.data ||
            resultado;

        if (
            !clienteCreado ||
            !clienteCreado.id
        ) {

            throw new Error(
                "La API no devolvió correctamente el cliente"
            );
        }

        /* =====================================================
           ACTUALIZAR LISTA LOCAL
        ===================================================== */

        const indice =
            clientes.findIndex(
                cliente =>
                    Number(cliente.id) ===
                    Number(clienteCreado.id)
            );

        if (indice >= 0) {

            clientes[indice] =
                clienteCreado;

        } else {

            clientes.push(
                clienteCreado
            );
        }

        /* =====================================================
           SELECCIONAR AUTOMÁTICAMENTE
        ===================================================== */

        seleccionarCliente(
            clienteCreado
        );

        cerrarModalCliente();

        showToast(
            "Cliente creado"
        );

    } catch (error) {

        console.error(
            "ERROR GUARDANDO CLIENTE:",
            error
        );

        showToast(
            `No se pudo guardar el cliente: ${error.message}`
        );
    }
}
/* =========================================================
   PRODUCTOS - CATEGORÍAS
   ========================================================= */

function renderCategories() {

    const container =
        document.getElementById("categories");

    if (!container) {
        return;
    }

    const categorias = [
        "Todos",
        ...new Set(
            productos
                .map(
                    producto =>
                        producto.rubro ||
                        producto.categoria
                )
                .filter(Boolean)
        )
    ];

    container.innerHTML =
        categorias
            .map(categoria => {

                return `
                    <button
                        type="button"
                        class="category-button ${
                            categoria === categoriaActual
                                ? "active"
                                : ""
                        }"
                        data-category="${escapeHtml(categoria)}"
                    >
                        ${escapeHtml(categoria)}
                    </button>
                `;

            })
            .join("");

    container
        .querySelectorAll(".category-button")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    categoriaActual =
                        button.dataset.category;

                    renderCategories();
                    renderProducts();
                }
            );
        });
}


/* =========================================================
   PRODUCTOS
   ========================================================= */

function renderProducts() {

    const grid =
        document.getElementById("productsGrid");

    if (!grid) {
        return;
    }

    const searchInput =
        document.getElementById("productSearch");

    const search =
        searchInput
            ? searchInput.value.trim().toLowerCase()
            : "";

    const filtrados =
        productos.filter(producto => {

            const nombre =
                String(
                    producto.nombre || ""
                ).toLowerCase();

            const categoria =
                producto.rubro ||
                producto.categoria;

            const pertenece =
                categoriaActual === "Todos" ||
                categoria === categoriaActual;

            return (
                pertenece &&
                nombre.includes(search)
            );
        });

    grid.innerHTML = `
        <div class="product-list-header">

            <span>
                NOMBRE DEL PRODUCTO
            </span>

            <span>
                PRECIO
            </span>

        </div>
    `;

    if (!filtrados.length) {

        grid.innerHTML += `
            <div class="empty-products">
                No se encontraron productos.
            </div>
        `;

        return;
    }

    filtrados.forEach(producto => {

        const row =
            document.createElement("div");

        row.className =
            "product-card";

        row.innerHTML = `
            <div class="product-name">
                ${escapeHtml(producto.nombre || "")}
            </div>

            <div class="product-price">
                ${money(producto.precio)}
            </div>
        `;

        row.addEventListener(
            "click",
            () => {

                addToCart(producto.id);
            }
        );

        grid.appendChild(row);
    });
}


/* =========================================================
   AGREGAR PRODUCTO
   ========================================================= */

function addToCart(productId) {

    const producto =
        productos.find(
            item =>
                Number(item.id) ===
                Number(productId)
        );

    if (!producto) {
        return;
    }

    // ----------------------------------------------------
    // PRODUCTO COMPUESTO -> ABRIR SELECTOR DE VARIEDAD
    // ----------------------------------------------------

    if (producto.es_compuesto) {

        abrirSelectorVariedad(producto);

        return;
    }

    // ----------------------------------------------------
    // PRODUCTO NORMAL -> AGREGAR / SUMAR CANTIDAD
    // ----------------------------------------------------

    const existente =
        carrito.find(
            item =>
                Number(item.id) === Number(productId) &&
                (!item.opciones || item.opciones.length === 0)
        );

    if (existente) {

        existente.cantidad++;

    } else {

        carrito.push({
            ...producto,
            cantidad: 1,
            opciones: [],
            cartLineId: cartLineIdCounter++
        });
    }

    renderCart();

    showToast(
        `${producto.nombre} agregado`
    );
}


/* =========================================================
   SELECTOR DE VARIEDAD (grupos con mínimo/máximo)
   ========================================================= */

async function abrirSelectorVariedad(producto) {

    try {

        const respuesta = await fetch(
            `${API_URL}/productos/${producto.id}/grupos-completos`,
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

        // Si no tiene grupos configurados, se agrega directo,
        // sin bloquear la venta.

        if (!data.grupos || !data.grupos.length) {

            carrito.push({
                ...producto,
                cantidad: 1,
                opciones: [],
                cartLineId: cartLineIdCounter++
            });

            renderCart();

            showToast(`${producto.nombre} agregado`);

            return;
        }

        variedadProductoActual = producto;
        variedadSeleccion = {};

        variedadGrupos = data.grupos;

        variedadGrupos.forEach(grupo => {
            variedadSeleccion[grupo.id] = {};
        });

        renderSelectorVariedad();

        document.getElementById("variedadModal").style.display = "flex";

    } catch (error) {

        console.error("ERROR ABRIENDO SELECTOR DE VARIEDAD:", error);

        showToast("No se pudo cargar la variedad de este producto");
    }
}

function cerrarSelectorVariedad() {

    document.getElementById("variedadModal").style.display = "none";

    variedadProductoActual = null;
    variedadGrupos = [];
    variedadSeleccion = {};
}

function totalSeleccionadoEnGrupo(grupoId) {

    return Object.values(variedadSeleccion[grupoId] || {})
        .reduce((suma, cantidad) => suma + cantidad, 0);
}

function mostrarErrorVariedad(mensaje) {

    const el = document.getElementById("variedadModalError");

    if (!el) {
        showToast(mensaje);
        return;
    }

    el.textContent = mensaje;
    el.style.display = "block";

    clearTimeout(window.variedadErrorTimer);

    window.variedadErrorTimer = setTimeout(() => {
        el.style.display = "none";
    }, 2200);
}

function renderSelectorVariedad() {

    const titulo = document.getElementById("variedadModalTitulo");
    const body = document.getElementById("variedadModalBody");

    if (titulo) {

        titulo.textContent =
            `Elegir variedad — ${variedadProductoActual.nombre}`;
    }

    if (!body) {
        return;
    }

    body.innerHTML = variedadGrupos.map(grupo => {

        const total = totalSeleccionadoEnGrupo(grupo.id);

        const maximo = grupo.maximo_selecciones || 0;

        const cumpleMinimo = total >= grupo.minimo_selecciones;
        const superaMaximo = maximo > 0 && total > maximo;

        return `
            <div class="variedad-grupo">

                <div class="variedad-grupo-header">
                    <strong>${escapeHtml(grupo.nombre)}</strong>
                    <span class="${
                        (!cumpleMinimo || superaMaximo) ? "variedad-count-error" : ""
                    }">
                        ${total} / ${
                            maximo > 0
                                ? `mín ${grupo.minimo_selecciones}, máx ${maximo}`
                                : `mín ${grupo.minimo_selecciones}`
                        }
                    </span>
                </div>

                <div class="variedad-opciones-box">

                    <input
                        type="text"
                        class="variedad-buscar"
                        data-grupo-buscar="${grupo.id}"
                        placeholder="Buscar..."
                        autocomplete="off"
                    >

                    <div class="variedad-opciones" data-grupo-lista="${grupo.id}">
                        ${grupo.opciones.map(opcion => {

                            const cantidad =
                                variedadSeleccion[grupo.id][opcion.componente_id] || 0;

                            const maxOpcion = opcion.maximo_cantidad || 0;

                            return `
                                <div
                                    class="variedad-opcion"
                                    data-opcion-nombre="${escapeHtml(opcion.nombre.toLowerCase())}"
                                >
                                    <span>${escapeHtml(opcion.nombre)}</span>
                                    <div class="variedad-stepper">
                                        <button
                                            type="button"
                                            data-op-menos="${grupo.id}:${opcion.componente_id}"
                                        >−</button>
                                        <span>${cantidad}</span>
                                        <button
                                            type="button"
                                            data-op-mas="${grupo.id}:${opcion.componente_id}:${maxOpcion}"
                                        >+</button>
                                    </div>
                                </div>
                            `;
                        }).join("")}
                    </div>

                </div>

            </div>
        `;
    }).join("");

    body.querySelectorAll("[data-grupo-buscar]").forEach(input => {

        input.addEventListener("input", () => {

            const grupoId = input.dataset.grupoBuscar;
            const texto = input.value.trim().toLowerCase();

            const lista = body.querySelector(`[data-grupo-lista="${grupoId}"]`);

            if (!lista) return;

            lista.querySelectorAll("[data-opcion-nombre]").forEach(fila => {

                const coincide =
                    !texto || fila.dataset.opcionNombre.includes(texto);

                fila.style.display = coincide ? "flex" : "none";
            });
        });
    });

    body.querySelectorAll("[data-op-menos]").forEach(btn => {

        btn.addEventListener("click", () => {

            const [grupoId, componenteId] =
                btn.dataset.opMenos.split(":").map(Number);

            const actual = variedadSeleccion[grupoId][componenteId] || 0;

            if (actual > 0) {
                variedadSeleccion[grupoId][componenteId] = actual - 1;
            }

            renderSelectorVariedad();
        });
    });

    body.querySelectorAll("[data-op-mas]").forEach(btn => {

        const [grupoId, componenteId, maxOpcion] =
            btn.dataset.opMas.split(":").map(Number);

        btn.addEventListener("click", () => {

            const grupo = variedadGrupos.find(g => g.id === grupoId);

            const actual = variedadSeleccion[grupoId][componenteId] || 0;

            if (maxOpcion > 0 && actual >= maxOpcion) {

                mostrarErrorVariedad(`Máximo ${maxOpcion} de esta opción`);
                return;
            }

            const totalGrupo = totalSeleccionadoEnGrupo(grupoId);
            const maxGrupo = grupo?.maximo_selecciones || 0;

            if (maxGrupo > 0 && totalGrupo >= maxGrupo) {

                mostrarErrorVariedad(
                    `"${grupo.nombre}" ya llegó a su máximo (${maxGrupo})`
                );
                return;
            }

            variedadSeleccion[grupoId][componenteId] = actual + 1;

            renderSelectorVariedad();
        });
    });
}

function confirmarSelectorVariedad() {

    // Validar mínimos/máximos de cada grupo antes de confirmar

    for (const grupo of variedadGrupos) {

        const total = totalSeleccionadoEnGrupo(grupo.id);

        if (total < grupo.minimo_selecciones) {

            mostrarErrorVariedad(
                `"${grupo.nombre}" necesita al menos ${grupo.minimo_selecciones} selección/es`
            );

            return;
        }

        if (grupo.maximo_selecciones > 0 && total > grupo.maximo_selecciones) {

            mostrarErrorVariedad(
                `"${grupo.nombre}" admite como máximo ${grupo.maximo_selecciones}`
            );

            return;
        }
    }

    // Armar lista plana de opciones elegidas

    const opcionesElegidas = [];

    variedadGrupos.forEach(grupo => {

        grupo.opciones.forEach(opcion => {

            const cantidad =
                variedadSeleccion[grupo.id][opcion.componente_id] || 0;

            if (cantidad > 0) {

                opcionesElegidas.push({
                    componente_id: opcion.componente_id,
                    nombre: opcion.nombre,
                    cantidad
                });
            }
        });
    });

    // -----------------------------------------------------
    // PRECIO EFECTIVO
    //
    // - Grupo modo MAXIMO ("mitad y mitad"): se cobra el más
    //   caro de lo elegido en ese grupo, en vez del base.
    // - Grupo modo SUMA ("adicionales"): cada opción elegida
    //   suma su propio precio × cantidad, arriba del base.
    //
    // El backend recalcula esto igual al confirmar la venta
    // (nunca confía en lo que mande el front) — esto es solo
    // para que el carrito muestre el total correcto antes.
    // -----------------------------------------------------

    let precioEfectivo = Number(variedadProductoActual.precio || 0);
    let huboGrupoMaximo = false;
    let sumaMaximos = 0;
    let sumaAdicionales = 0;

    variedadGrupos.forEach(grupo => {

        if (grupo.modo_precio === "MAXIMO") {

            let maxDelGrupo = 0;
            let tieneSeleccion = false;

            grupo.opciones.forEach(opcion => {

                const cantidad =
                    variedadSeleccion[grupo.id][opcion.componente_id] || 0;

                if (cantidad > 0) {

                    tieneSeleccion = true;

                    const precioOpcion = Number(opcion.precio || 0);

                    if (precioOpcion > maxDelGrupo) {
                        maxDelGrupo = precioOpcion;
                    }
                }
            });

            if (tieneSeleccion) {

                huboGrupoMaximo = true;
                sumaMaximos += maxDelGrupo;
            }

        } else if (grupo.modo_precio === "SUMA") {

            grupo.opciones.forEach(opcion => {

                const cantidad =
                    variedadSeleccion[grupo.id][opcion.componente_id] || 0;

                if (cantidad > 0) {

                    sumaAdicionales +=
                        Number(opcion.precio || 0) * cantidad;
                }
            });
        }
    });

    if (huboGrupoMaximo) {
        precioEfectivo = sumaMaximos;
    }

    precioEfectivo += sumaAdicionales;

    carrito.push({
        ...variedadProductoActual,
        precio: precioEfectivo,
        cantidad: 1,
        opciones: opcionesElegidas,
        cartLineId: cartLineIdCounter++
    });

    renderCart();

    showToast(`${variedadProductoActual.nombre} agregado`);

    cerrarSelectorVariedad();
}


/* =========================================================
   CAMBIAR CANTIDAD
   ========================================================= */

function editarItemCarrito(cartLineId) {

    const item = carrito.find(
        producto => Number(producto.cartLineId) === Number(cartLineId)
    );

    if (!item) return;

    const nuevoNombre = prompt("Nombre del producto:", item.nombre);

    if (nuevoNombre === null) return; // canceló

    if (!nuevoNombre.trim()) {
        showToast("El nombre no puede quedar vacío");
        return;
    }

    const nuevoPrecioTexto = prompt(
        "Precio unitario:",
        String(Number(item.precio || 0))
    );

    if (nuevoPrecioTexto === null) return; // canceló

    const nuevoPrecio = Number(
        String(nuevoPrecioTexto)
            .trim()
            .replace(/\./g, "")   // punto = separador de miles (8.500 -> 8500)
            .replace(",", ".")    // coma = decimal (8500,50 -> 8500.50)
    );

    if (!Number.isFinite(nuevoPrecio) || nuevoPrecio < 0) {
        showToast("Precio inválido");
        return;
    }

    item.nombre = nuevoNombre.trim();
    item.precio = nuevoPrecio;
    item.editadoManualmente = true;

    renderCart();
}


function changeQuantity(cartLineId, delta) {

    const item =
        carrito.find(
            producto =>
                Number(producto.cartLineId) ===
                Number(cartLineId)
        );

    if (!item) {
        return;
    }

    item.cantidad += delta;

    if (item.cantidad <= 0) {

        carrito =
            carrito.filter(
                producto =>
                    Number(producto.cartLineId) !==
                    Number(cartLineId)
            );
    }

    renderCart();
}


/* =========================================================
   RENDER CARRITO
   ========================================================= */

function renderCart() {

    const cart =
        document.getElementById("cartList");

    if (!cart) {
        return;
    }

    if (!carrito.length) {

        cart.innerHTML = `
            <div class="empty-cart">

                <div>

                    <div
                        style="
                            font-size:28px;
                            margin-bottom:8px;
                        "
                    >
                        🛒
                    </div>

                    <strong>
                        El carrito está vacío
                    </strong>

                    <div
                        style="
                            margin-top:5px;
                        "
                    >
                        Seleccioná productos
                        para crear un pedido.
                    </div>

                </div>

            </div>
        `;

        updateTotals();

        return;
    }

    cart.innerHTML =
        carrito
            .map(item => {

                const precio =
                    Number(item.precio || 0);

                const cantidad =
                    Number(item.cantidad || 0);

                const subtotal =
                    precio * cantidad;

                const opciones =
                    Array.isArray(item.opciones)
                        ? item.opciones
                        : [];

                return `
                    <article
                        class="cart-item cart-item-compact"
                    >

                        <div class="cart-item-row">

                            <div class="cart-item-info">

                                <span class="cart-name">
                                    ${escapeHtml(item.nombre)}
                                </span>

                                <span class="cart-price">
                                    ${money(precio)} c/u
                                    <button
                                        type="button"
                                        class="cart-item-editar"
                                        data-editar-item="${item.cartLineId}"
                                        title="Editar nombre o precio"
                                    >
                                        ✏️
                                    </button>
                                </span>

                            </div>

                            <div class="quantity">

                                <button
                                    type="button"
                                    data-minus="${item.cartLineId}"
                                >
                                    −
                                </button>

                                <span>
                                    ${cantidad}
                                </span>

                                <button
                                    type="button"
                                    data-plus="${item.cartLineId}"
                                >
                                    +
                                </button>

                            </div>

                            <div class="cart-item-total">
                                ${money(subtotal)}
                            </div>

                        </div>

                        ${
                            opciones.length
                                ? `<div class="cart-opciones">
                                    ${opciones.map(o => `
                                        <span>+ ${o.cantidad}x ${escapeHtml(o.nombre)}</span>
                                    `).join("")}
                                   </div>`
                                : ""
                        }

                    </article>
                `;
            })
            .join("");

    cart
        .querySelectorAll("[data-editar-item]")
        .forEach(button => {

            button.addEventListener(
                "click",
                event => {

                    event.stopPropagation();

                    editarItemCarrito(
                        Number(button.dataset.editarItem)
                    );
                }
            );
        });

    cart
        .querySelectorAll("[data-minus]")
        .forEach(button => {

            button.addEventListener(
                "click",
                event => {

                    event.stopPropagation();

                    changeQuantity(
                        Number(button.dataset.minus),
                        -1
                    );
                }
            );
        });

    cart
        .querySelectorAll("[data-plus]")
        .forEach(button => {

            button.addEventListener(
                "click",
                event => {

                    event.stopPropagation();

                    changeQuantity(
                        Number(button.dataset.plus),
                        1
                    );
                }
            );
        });

    updateTotals();
}


/* =========================================================
   MEDIO DE PAGO
   =========================================================

   IMPORTANTE:

   Esto queda preparado para COBRO.

   NO participa en procesarPedido().
   ========================================================= */

function seleccionarMedioPago(medio) {

    medioPagoActual =
        medio || "Efectivo";

    console.log(
        "MEDIO DE PAGO SELECCIONADO:",
        medioPagoActual
    );

    const botones =
        document.querySelectorAll(
            ".payment-method"
        );

    botones.forEach(button => {

        const activo =
            button.dataset.method ===
            medioPagoActual;

        button.classList.toggle(
            "active",
            activo
        );
    });

    const cashSection =
        document.getElementById("cashSection");

    if (cashSection) {

        cashSection.style.display =
            medioPagoActual === "Efectivo"
                ? "block"
                : "none";
    }

    if (medioPagoActual !== "Efectivo") {

        dineroRecibido = 0;

        const cashReceived =
            document.getElementById("cashReceived");

        const changeAmount =
            document.getElementById("changeAmount");

        if (cashReceived) {
            cashReceived.value = "";
        }

        if (changeAmount) {
            changeAmount.textContent = money(0);
        }
    }

    showToast(
        `Medio de pago: ${medioPagoActual}`
    );
}


/* =========================================================
   VUELTO
   ========================================================= */

function actualizarVuelto() {

    const input =
        document.getElementById("cashReceived");

    const subtotal =
        getSubtotal();

    const total =
        subtotal - calcularDescuento(subtotal);

    dineroRecibido =
        Number(input?.value || 0);

    const vuelto =
        dineroRecibido - total;

    const changeAmount =
        document.getElementById("changeAmount");

    if (changeAmount) {

        changeAmount.textContent =
            money(
                vuelto > 0
                    ? vuelto
                    : 0
            );
    }

    console.log(
        "DINERO RECIBIDO:",
        dineroRecibido
    );

    console.log(
        "TOTAL:",
        total
    );

    console.log(
        "VUELTO:",
        vuelto
    );
}


/* =========================================================
   DESCUENTO
   ========================================================= */

function inicializarDescuento() {

    const tipoSelect = document.getElementById("discountType");
    const valorInput = document.getElementById("discountValue");

    if (tipoSelect) {

        tipoSelect.addEventListener("change", () => {

            descuentoTipo = tipoSelect.value;

            updateTotals();
        });
    }

    if (valorInput) {

        valorInput.addEventListener("input", () => {

            descuentoValor = Number(valorInput.value || 0);

            updateTotals();
        });
    }
}


/* =========================================================
   INICIALIZAR MEDIOS DE PAGO
   ========================================================= */

function inicializarMediosPago() {

    const container =
        document.getElementById("paymentMethods");

    if (!container) {

        console.warn(
            "No existe #paymentMethods"
        );

        return;
    }

    const botones =
        container.querySelectorAll(
            ".payment-method"
        );

    botones.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const medio =
                    button.dataset.method;

                seleccionarMedioPago(medio);
            }
        );
    });

    const cashReceived =
        document.getElementById("cashReceived");

    if (cashReceived) {

        cashReceived.addEventListener(
            "input",
            actualizarVuelto
        );
    }

    seleccionarMedioPago(
        medioPagoActual
    );
}


/* =========================================================
   TOTAL
   ========================================================= */

function getSubtotal() {

    return carrito.reduce(
        (total, item) => {

            return (
                total +
                (
                    Number(item.precio || 0) *
                    Number(item.cantidad || 0)
                )
            );
        },
        0
    );
}

function calcularDescuento(subtotal) {

    const valor = Number(descuentoValor || 0);

    if (valor <= 0) {
        return 0;
    }

    let descuento =
        descuentoTipo === "PORCENTAJE"
            ? subtotal * (valor / 100)
            : valor;

    if (descuento > subtotal) {
        descuento = subtotal;
    }

    return Math.round(descuento);
}


/* =========================================================
   ACTUALIZAR TOTALES
   ========================================================= */

function updateTotals() {

    const subtotal =
        getSubtotal();

    const descuento =
        calcularDescuento(subtotal);

    const total =
        subtotal - descuento;

    const subtotalElement =
        document.getElementById("subtotal");

    const discountElement =
        document.getElementById("discount");

    const totalElement =
        document.getElementById("total");

    const paymentTotalElement =
        document.getElementById("paymentTotal");

    const processButton =
        document.getElementById("chargeButton");

    const tipoEntrega =
        obtenerTipoEntrega();

    const esVentaMostrador =
        tipoEntrega === "MOSTRADOR";

    if (subtotalElement) {

        subtotalElement.textContent =
            money(subtotal);
    }

    if (discountElement) {

        discountElement.textContent =
            money(descuento);
    }

    if (totalElement) {

        totalElement.textContent =
            money(total);
    }

    if (paymentTotalElement) {

        paymentTotalElement.textContent =
            money(total);
    }

    if (processButton) {

        processButton.textContent =
            `Procesar pedido ${money(total)}`;

        const puedeProcesar =
            !procesandoPedido &&
            carrito.length > 0 &&
            subtotal > 0 &&
            (
                modoEdicionPedidoId ||
                esVentaMostrador ||
                (
                    clienteActual &&
                    clienteActual.id
                )
            );

        processButton.disabled =
            !puedeProcesar;

        console.log("======================================");
        console.log("🔵 UPDATE TOTALS");
        console.log("Subtotal:", subtotal);
        console.log("Carrito:", carrito.length);
        console.log("Tipo entrega:", tipoEntrega);
        console.log("Es mostrador:", esVentaMostrador);
        console.log("Cliente:", clienteActual);
        console.log("Procesando:", procesandoPedido);
        console.log("Puede procesar:", puedeProcesar);
        console.log("Botón disabled:", processButton.disabled);
        console.log("======================================");
    }

    if (medioPagoActual === "Efectivo") {

        actualizarVuelto();
    }
}


/* =========================================================
   LIMPIAR PEDIDO ACTUAL
   ========================================================= */

function limpiarPedidoActual() {

    console.log(
        "LIMPIANDO PEDIDO ACTUAL"
    );

    carrito = [];

    limpiarCliente();

    descuentoTipo = "MONTO";
    descuentoValor = 0;

    const discountValueInput = document.getElementById("discountValue");
    const discountTypeSelect = document.getElementById("discountType");

    if (discountValueInput) discountValueInput.value = "";
    if (discountTypeSelect) discountTypeSelect.value = "MONTO";

    const searchProduct =
        document.getElementById("productSearch");

    if (searchProduct) {

        searchProduct.value = "";
    }

    const direccionInput = document.getElementById("editDireccionInput");

    if (direccionInput) direccionInput.value = "";

    actualizarVisibilidadDireccion();

    categoriaActual =
        "Todos";

    renderCategories();
    renderProducts();
    renderCart();
    updateTotals();

    console.log(
        "PEDIDO ACTUAL LIMPIADO"
    );
}


/* =========================================================
   EDITAR PEDIDO EXISTENTE
   =========================================================

   Carga el pedido seleccionado en Pedidos Activos dentro
   del carrito, en "modo edición". Reusa toda la UI del
   carrito (incluido el selector de variedad) — al confirmar,
   procesarPedido() manda PUT en vez de POST.
   ========================================================= */

async function abrirEdicionPedido() {

    if (!pedidoActivoSeleccionado) {

        showToast("Seleccioná un pedido activo primero");

        return;
    }

    try {

        const respuesta = await fetch(
            `${API_URL}/pedidos/${pedidoActivoSeleccionado}`,
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

        const pedido = await respuesta.json();

        const items = obtenerItemsPedido(pedido);

        carrito = items.map(item => ({

            id: Number(
                item.producto_id ?? item.id
            ),

            nombre:
                item.nombre ||
                item.nombre_producto ||
                "Producto",

            precio: Number(
                item.precio_unitario ?? item.precio ?? 0
            ),

            cantidad: Number(item.cantidad || 1),

            opciones: Array.isArray(item.opciones)
                ? item.opciones.map(o => ({
                    componente_id: Number(
                        o.componente_id ?? o.producto_id
                    ),
                    nombre: o.nombre || "",
                    cantidad: Number(o.cantidad || 1)
                }))
                : [],

            cartLineId: cartLineIdCounter++

        }));

        modoEdicionPedidoId = pedidoActivoSeleccionado;

        renderCart();

        // ---------------------------------------------------
        // CLIENTE (o mostrador si no tenía)
        // ---------------------------------------------------

        const checkboxMostrador = document.getElementById("ventaMostrador");

        if (pedido.cliente) {

            if (checkboxMostrador) checkboxMostrador.checked = false;

            seleccionarCliente(pedido.cliente);

        } else {

            limpiarCliente();

            if (checkboxMostrador) checkboxMostrador.checked = true;
        }

        // ---------------------------------------------------
        // DIRECCIÓN — input editable puntual para este pedido
        // ---------------------------------------------------

        const direccionBox = document.getElementById("editDireccionBox");
        const direccionInput = document.getElementById("editDireccionInput");

        if (direccionBox) direccionBox.style.display = "block";

        if (direccionInput) {

            direccionInput.value =
                pedido.direccion_entrega ||
                pedido.cliente?.domicilio_fiscal ||
                "";
        }

        const boton = document.getElementById("chargeButton");

        if (boton) {

            boton.textContent = `Guardar cambios — Pedido #${modoEdicionPedidoId}`;
        }

        showToast(
            `Editando pedido #${modoEdicionPedidoId} — modificá lo que haga falta y guardá`
        );

    } catch (error) {

        console.error("ERROR ABRIENDO EDICIÓN DE PEDIDO:", error);

        showToast("No se pudo cargar el pedido para editar");
    }
}

function cancelarEdicionPedido() {

    modoEdicionPedidoId = null;

    const direccionBox = document.getElementById("editDireccionBox");

    if (direccionBox) direccionBox.style.display = "none";

    limpiarPedidoActual();

    showToast("Edición cancelada");
}

async function guardarEdicionPedido() {

    if (!carrito.length) {

        showToast("El pedido no puede quedar vacío");

        return;
    }

    if (procesandoPedido) {
        return;
    }

    procesandoPedido = true;

    const pedidoId = modoEdicionPedidoId;

    const direccionInput = document.getElementById("editDireccionInput");

    const checkboxMostrador = document.getElementById("ventaMostrador");

    const payload = {

        detalle: carrito.map(item => ({

            producto_id: Number(item.id),

            cantidad: Number(item.cantidad),

            opciones: Array.isArray(item.opciones)
                ? item.opciones.map(o => ({
                    componente_id: Number(o.componente_id),
                    cantidad: Number(o.cantidad),
                    observaciones: null
                }))
                : []
        })),

        cliente_id:
            (checkboxMostrador?.checked || !clienteActual?.id)
                ? null
                : Number(clienteActual.id),

        direccion_entrega:
            direccionInput?.value.trim() || null
    };

    try {

        const respuesta = await fetch(
            `${API_URL}/pedidos/${pedidoId}/detalle`,
            {
                method: "PUT",
                headers: authHeaders(),
                body: JSON.stringify(payload)
            }
        );

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) {
                return;
            }

            let detalle = "";

            try {

                const errorData = await respuesta.json();

                detalle = errorData?.detail || "";

            } catch {}

            throw new Error(detalle || `HTTP ${respuesta.status}`);
        }

        showToast(`Pedido #${pedidoId} actualizado`);

        modoEdicionPedidoId = null;

        const direccionBox = document.getElementById("editDireccionBox");

        if (direccionBox) direccionBox.style.display = "none";

        limpiarPedidoActual();

        await cargarPedidosActivos(true);

    } catch (error) {

        console.error("ERROR GUARDANDO EDICIÓN:", error);

        showToast(
            `No se pudo guardar: ${error.message}`
        );

    } finally {

        procesandoPedido = false;

        updateTotals();
    }
}


/* =========================================================
   PROCESAR PEDIDO
   ========================================================= */

async function procesarPedido() {

    console.log("======================================");
    console.log("🟢 CLICK / PROCESAR PEDIDO");
    console.log("======================================");

    // =====================================================
    // MODO EDICIÓN -> otro flujo (PUT, no POST)
    // =====================================================

    if (modoEdicionPedidoId) {

        await guardarEdicionPedido();

        return;
    }

    // =====================================================
    // DETECTAR TIPO DE VENTA
    // =====================================================

    const checkboxMostrador =
        document.getElementById("ventaMostrador");

    const esMostrador =
        checkboxMostrador?.checked === true;

    const tipoEntrega =
        obtenerTipoEntrega();

    console.log(
        "CHECKBOX #ventaMostrador:",
        checkboxMostrador
    );

    console.log(
        "CHECKED:",
        checkboxMostrador?.checked
    );

    console.log(
        "🟡 ES MOSTRADOR:",
        esMostrador
    );

    console.log(
        "🟡 TIPO ENTREGA:",
        tipoEntrega
    );

    console.log(
        "CLIENTE ACTUAL:",
        clienteActual
    );

    console.log(
        "CARRITO:",
        carrito
    );

    console.log(
        "PROCESANDO PEDIDO:",
        procesandoPedido
    );

    // =====================================================
    // SUBTOTAL
    // =====================================================

    const subtotal =
        getSubtotal();

    console.log(
        "SUBTOTAL:",
        subtotal
    );

    // =====================================================
    // EVITAR DOBLE CLICK
    // =====================================================

    if (procesandoPedido) {

        console.log(
            "🔴 BLOQUEADO: ya se está procesando un pedido"
        );

        return;
    }

    // =====================================================
    // VALIDAR CLIENTE
    // =====================================================

    if (
        !esMostrador &&
        (
            !clienteActual ||
            !clienteActual.id
        )
    ) {

        console.log(
            "🔴 BLOQUEADO: esta venta necesita cliente"
        );

        showToast(
            "Seleccioná un cliente"
        );

        return;
    }

    console.log(
        "🟢 VALIDACIÓN CLIENTE OK"
    );

    // =====================================================
    // VALIDAR CARRITO
    // =====================================================

    if (!carrito.length) {

        console.log(
            "🔴 BLOQUEADO: carrito vacío"
        );

        showToast(
            "Agregá productos al pedido"
        );

        return;
    }

    if (subtotal <= 0) {

        console.log(
            "🔴 BLOQUEADO: subtotal inválido"
        );

        showToast(
            "El total del pedido debe ser mayor a 0"
        );

        return;
    }

    console.log(
        "🟢 VALIDACIÓN CARRITO OK"
    );

    // =====================================================
    // CREAR PAYLOAD
    // =====================================================

    const pedido = {

        // MOSTRADOR = NULL
        // OTRA VENTA = CLIENTE
        cliente_id:
            esMostrador
                ? null
                : Number(clienteActual.id),

        medio_pago:
            medioPagoActual,

        tipo_entrega:
            tipoEntrega,

        direccion_entrega:
            document.getElementById("editDireccionInput")?.value.trim() || null,

        subtotal:
            Number(subtotal),

        descuento:
            calcularDescuento(subtotal),

        total:
            Number(subtotal) - calcularDescuento(subtotal),

        observaciones:
            null,

        detalle:
            carrito.map(item => {

                const precio =
                    Number(item.precio || 0);

                const cantidad =
                    Number(item.cantidad || 0);

                return {

                    producto_id:
                        Number(item.id),

                    cantidad:
                        cantidad,

                    precio_unitario:
                        precio,

                    subtotal:
                        precio * cantidad,

                    nombre_producto:
                        item.nombre || null,

                    precio_manual:
                        Boolean(item.editadoManualmente),

                    opciones:
                        Array.isArray(item.opciones)
                            ? item.opciones.map(o => ({
                                componente_id: Number(o.componente_id),
                                cantidad: Number(o.cantidad),
                                observaciones: null
                            }))
                            : []
                };
            })
    };

    // =====================================================
    // LOG FINAL DEL PEDIDO
    // =====================================================

    console.log("======================================");

    console.log(
        "🟢 JSON PEDIDO:"
    );

    console.log(
        JSON.stringify(
            pedido,
            null,
            2
        )
    );

    console.log("======================================");

    // =====================================================
    // BLOQUEAR BOTÓN
    // =====================================================

    procesandoPedido = true;

    updateTotals();

    try {

        // =================================================
        // POST API
        // =================================================

        const url =
            `${API_URL}/pedidos/pos`;

        console.log(
            "🟢 POST:",
            url
        );

        const respuesta =
            await fetch(
                url,
                {
                    method: "POST",

                    headers:
                        authHeaders(),

                    body:
                        JSON.stringify(pedido)
                }
            );

        console.log(
            "🟢 RESPUESTA HTTP:",
            respuesta.status
        );

        // =================================================
        // ERROR HTTP
        // =================================================

        if (!respuesta.ok) {

            console.log(
                "🔴 ERROR HTTP:",
                respuesta.status
            );

            if (
                manejarErrorAuth(
                    respuesta.status
                )
            ) {
                return;
            }

            let detalle = "";

            try {

                const errorData =
                    await respuesta.json();

                detalle =
                    errorData?.detail
                        ? JSON.stringify(
                            errorData.detail,
                            null,
                            2
                        )
                        : JSON.stringify(
                            errorData,
                            null,
                            2
                        );

            } catch {

                detalle =
                    await respuesta.text();
            }

            throw new Error(
                `HTTP ${respuesta.status} - ${detalle}`
            );
        }

        // =================================================
        // RESPUESTA API
        // =================================================

        const resultado =
            await respuesta.json();

        console.log(
            "🟢 RESPUESTA CREAR PEDIDO:",
            resultado
        );

        // =================================================
        // VALIDAR RESPUESTA
        // =================================================

        if (
            !resultado ||
            resultado.ok !== true
        ) {

            throw new Error(
                "La API no confirmó la creación del pedido"
            );
        }

        // =================================================
        // PEDIDO CREADO
        // =================================================

        const pedidoId =
            resultado.pedido_id;

        console.log(
            "🟢 PEDIDO CREADO:",
            pedidoId
        );

        showToast(
            pedidoId
                ? `Pedido #${pedidoId} creado`
                : "Pedido creado correctamente"
        );

        // =================================================
        // LIMPIAR
        // =================================================

        limpiarPedidoActual();

        // =================================================
        // RECARGAR ACTIVOS
        // =================================================

        await cargarPedidosActivos();

    } catch (error) {

        console.error(
            "🔴 ERROR CREANDO PEDIDO:",
            error
        );

        showToast(
            `No se pudo crear el pedido: ${error.message}`
        );

    } finally {

        procesandoPedido = false;

        updateTotals();
    }
}

/* =========================================================
   PEDIDOS ACTIVOS
   ========================================================= */
/* =========================================================
   DETECTAR CAMBIOS EN PEDIDOS ACTIVOS
   ========================================================= */

function pedidosTuvieronCambios(
    anteriores,
    actuales
) {

    if (!Array.isArray(anteriores)) {
        anteriores = [];
    }

    if (!Array.isArray(actuales)) {
        actuales = [];
    }

    /* =====================================================
       CANTIDAD
       ===================================================== */

    if (
        anteriores.length !==
        actuales.length
    ) {

        console.log(
            "🔄 CAMBIÓ LA CANTIDAD DE PEDIDOS"
        );

        return true;
    }


    /* =====================================================
       COMPARAR CADA PEDIDO
       ===================================================== */

    for (const actual of actuales) {

        const anterior =
            anteriores.find(
                pedido =>
                    Number(pedido.id) ===
                    Number(actual.id)
            );


        /* =================================================
           PEDIDO NUEVO
           ================================================= */

        if (!anterior) {

            console.log(
                "🟢 PEDIDO NUEVO:",
                actual.id
            );

            return true;
        }


        /* =================================================
           ESTADO
           ================================================= */

        const estadoActual =
            obtenerEstadoPedido(actual);

        const estadoAnterior =
            obtenerEstadoPedido(anterior);


        if (
            String(estadoActual).trim() !==
            String(estadoAnterior).trim()
        ) {

            console.log(
                "🔄 CAMBIO DE ESTADO",
                `Pedido #${actual.id}`,
                `${estadoAnterior} → ${estadoActual}`
            );

            return true;
        }


        /* =================================================
           SIGUIENTE ESTADO
           ================================================= */

        const siguienteActual =
            actual.siguiente_estado;

        const siguienteAnterior =
            anterior.siguiente_estado;


        const siguienteActualId =
            typeof siguienteActual === "object" &&
            siguienteActual !== null
                ? siguienteActual.id
                : siguienteActual;


        const siguienteAnteriorId =
            typeof siguienteAnterior === "object" &&
            siguienteAnterior !== null
                ? siguienteAnterior.id
                : siguienteAnterior;


        if (
            Number(siguienteActualId || 0) !==
            Number(siguienteAnteriorId || 0)
        ) {

            console.log(
                "🔄 CAMBIÓ SIGUIENTE ESTADO:",
                actual.id
            );

            return true;
        }


        /* =================================================
           TOTAL
           ================================================= */

        if (
            Number(actual.total || 0) !==
            Number(anterior.total || 0)
        ) {

            console.log(
                "🔄 CAMBIÓ TOTAL:",
                actual.id
            );

            return true;
        }


        /* =================================================
           MEDIO DE PAGO
           ================================================= */

        if (
            String(actual.medio_pago || "") !==
            String(anterior.medio_pago || "")
        ) {

            console.log(
                "🔄 CAMBIÓ MEDIO DE PAGO:",
                actual.id
            );

            return true;
        }
    }


    /* =====================================================
       PEDIDO QUE SALIÓ DE ACTIVOS
       ===================================================== */

    for (const anterior of anteriores) {

        const existe =
            actuales.some(
                actual =>
                    Number(actual.id) ===
                    Number(anterior.id)
            );

        if (!existe) {

            console.log(
                "🔴 PEDIDO SALIÓ DE ACTIVOS:",
                anterior.id
            );

            return true;
        }
    }


    return false;
}
/* =========================================================
   PEDIDOS ACTIVOS
   ========================================================= */

async function cargarPedidosActivos(
    forzarRender = false
) {

    /*
     * Evitamos que dos consultas se ejecuten
     * simultáneamente.
     */

    if (actualizandoPedidos) {

        console.log(
            "⏳ Ya hay una actualización de pedidos en curso"
        );

        return;
    }

    actualizandoPedidos = true;

    try {

        console.log(
            "🔄 CONSULTANDO PEDIDOS ACTIVOS..."
        );

        const inicioActivos =
            performance.now();

        const respuesta =
            await fetch(
                `${API_URL}/pedidos/activos`,
                {
                    method: "GET",
                    headers: authHeaders(),
                    cache: "no-store"
                }
            );

        const finActivos =
            performance.now();

        console.log(
            `⏱️ GET /pedidos/activos: ${
                (finActivos - inicioActivos).toFixed(0)
            } ms`
        );


        /* -------------------------------------------------
           ERROR
           ------------------------------------------------- */

        if (!respuesta.ok) {

            if (
                manejarErrorAuth(
                    respuesta.status
                )
            ) {
                return;
            }

            throw new Error(
                `HTTP ${respuesta.status}`
            );
        }


        /* -------------------------------------------------
           JSON
           ------------------------------------------------- */

        const data =
            await respuesta.json();


        /* -------------------------------------------------
           NORMALIZAR
           ------------------------------------------------- */

        let nuevosPedidos = [];

        if (Array.isArray(data)) {

            nuevosPedidos =
                data;

        } else if (
            Array.isArray(data?.pedidos)
        ) {

            nuevosPedidos =
                data.pedidos;

        } else {

            nuevosPedidos =
                [];
        }


        console.log(
            "PEDIDOS ACTIVOS API:",
            nuevosPedidos
        );


        /* -------------------------------------------------
           DETECTAR CAMBIOS
           ------------------------------------------------- */

        const huboCambios =
            pedidosTuvieronCambios(
                pedidosActivosAnterior,
                nuevosPedidos
            );


        /*
         * La primera carga SIEMPRE renderiza.
         */

        const primeraCarga =
            pedidosActivosAnterior.length === 0 &&
            nuevosPedidos.length > 0;


        /* -------------------------------------------------
           ACTUALIZAR ESTADO GLOBAL
           ------------------------------------------------- */

        pedidosActivos =
            nuevosPedidos;

        window.pedidosActivos =
            pedidosActivos;


        /* -------------------------------------------------
           RENDER SOLO SI CAMBIÓ
           ------------------------------------------------- */

        if (
            forzarRender ||
            huboCambios ||
            primeraCarga
        ) {

            console.log(
                "🎨 CAMBIARON LOS PEDIDOS → RENDER"
            );

            renderOrders(
                pedidosActivos
            );

        } else {

            console.log(
                "⏸️ SIN CAMBIOS → NO RENDERIZAMOS LISTA"
            );
        }


        /* -------------------------------------------------
           GUARDAR SNAPSHOT
           ------------------------------------------------- */

        pedidosActivosAnterior =
            structuredClone(
                pedidosActivos
            );


    } catch (error) {

        console.error(
            "ERROR CARGANDO PEDIDOS ACTIVOS:",
            error
        );

        /*
         * IMPORTANTE:
         *
         * Si la API falla momentáneamente,
         * NO borramos los pedidos que ya tenemos
         * en pantalla.
         */

    } finally {

        actualizandoPedidos = false;
    }
}
/* =========================================================
   INICIAR ACTUALIZACIÓN AUTOMÁTICA
   ========================================================= */

function iniciarActualizacionPedidos() {

    console.log(
        "🚀 INICIANDO ACTUALIZACIÓN AUTOMÁTICA DE PEDIDOS"
    );


    /* -----------------------------------------------------
       EVITAR DUPLICAR INTERVALOS
       ----------------------------------------------------- */

    if (intervaloPedidos) {

        clearInterval(
            intervaloPedidos
        );
    }


    if (intervaloRelojPedidos) {

        clearInterval(
            intervaloRelojPedidos
        );
    }


    /* -----------------------------------------------------
       CONSULTAR API CADA 3 SEGUNDOS
       ----------------------------------------------------- */

    intervaloPedidos =
        setInterval(
            () => {

                cargarPedidosActivos();

            },
            INTERVALO_PEDIDOS_MS
        );


    /* -----------------------------------------------------
       ACTUALIZAR TIEMPO VISUAL CADA SEGUNDO
       ----------------------------------------------------- */

    intervaloRelojPedidos =
        setInterval(
            () => {

                actualizarTiemposPedidos();

            },
            INTERVALO_RELOJ_MS
        );
}

/* =========================================================
   NORMALIZAR ESTADO
   ========================================================= */

function obtenerEstadoPedido(pedido) {

    if (!pedido) {
        return "SIN ESTADO";
    }

    if (typeof pedido.estado === "string") {
        return pedido.estado;
    }

    if (
        typeof pedido.estado_nombre === "string"
    ) {
        return pedido.estado_nombre;
    }

    if (
        typeof pedido.estado_cocina === "string"
    ) {
        return pedido.estado_cocina;
    }

    if (
        pedido.estado_cocina &&
        typeof pedido.estado_cocina.nombre === "string"
    ) {
        return pedido.estado_cocina.nombre;
    }

    if (
        typeof pedido.estado_cocina_nombre === "string"
    ) {
        return pedido.estado_cocina_nombre;
    }

    return "SIN ESTADO";
}


/* =========================================================
   NORMALIZAR CLIENTE
   ========================================================= */

function obtenerClientePedido(pedido) {

    if (pedido?.cliente) {

        return pedido.cliente;
    }

    return {

        nombre:
            pedido?.cliente_nombre ||
            pedido?.nombre_cliente ||
            "Mostrador",

        telefono:
            pedido?.cliente_telefono ||
            pedido?.telefono ||
            ""
    };
}


/* =========================================================
   NORMALIZAR ITEMS
   ========================================================= */

function obtenerItemsPedido(pedido) {

    if (
        Array.isArray(
            pedido?.items
        )
    ) {

        return pedido.items;
    }

    if (
        Array.isArray(
            pedido?.detalle
        )
    ) {

        return pedido.detalle;
    }

    return [];
}


/* =========================================================
   RENDER PEDIDOS ACTIVOS
   ========================================================= */

function renderOrders(pedidos) {

    const container =
        document.getElementById(
            "ordersList"
        );

    const counter =
        document.getElementById(
            "orderCounter"
        );

    if (!container) {
        return;
    }

    if (!Array.isArray(pedidos)) {

        pedidos = [];
    }

    if (counter) {

        counter.textContent =
            pedidos.length;
    }


    /* =====================================================
       SIN PEDIDOS
       ===================================================== */

    if (!pedidos.length) {

        container.innerHTML = `

            <div class="empty-orders">

                <div class="empty-orders-icon">
                    📋
                </div>

                <strong>
                    No hay pedidos activos
                </strong>

                <span>
                    Los pedidos nuevos aparecerán aquí.
                </span>

            </div>
        `;

        return;
    }


    /* =====================================================
       PEDIDOS
       ===================================================== */

    container.innerHTML =
        pedidos
            .map(pedido => {

                /* -----------------------------------------
                   CLIENTE
                   ----------------------------------------- */

                const cliente =
                    obtenerClientePedido(
                        pedido
                    );

                const nombreCliente =
                    cliente.nombre ||
                    "Sin cliente";

                const telefono =
                    cliente.telefono ||
                    "";


                /* -----------------------------------------
                   DIRECCIÓN
                   ----------------------------------------- */

                const direccion =
                    pedido.direccion_entrega ||
                    cliente.domicilio_fiscal ||
                    cliente.direccion ||
                    "";


                /* -----------------------------------------
                   ESTADO ACTUAL
                   ----------------------------------------- */

                const estadoOriginal =
                    obtenerEstadoPedido(
                        pedido
                    );

                const estado =
                    String(
                        estadoOriginal
                    )
                        .trim()
                        .toUpperCase();

                const estadoNormalizado =
                    estado
                        .normalize("NFD")
                        .replace(
                            /[\u0300-\u036f]/g,
                            ""
                        );


                /* -----------------------------------------
                   TOTAL
                   ----------------------------------------- */

                const total =
                    Number(
                        pedido.total || 0
                    );


                /* -----------------------------------------
                   MEDIO DE PAGO

                   SOLAMENTE SE MUESTRA SI
                   LA API LO DEVUELVE.
                   ----------------------------------------- */

                const medioPagoPedido =
                    pedido.medio_pago ||
                    "Sin pago";


                /* -----------------------------------------
                   TIPO DE ENTREGA
                   ----------------------------------------- */

                const tipoEntrega =
                    pedido.tipo_entrega ||
                    pedido.tipoEntrega ||
                    "LOCAL";


                /* -----------------------------------------
                   SIGUIENTE ESTADO
                   ----------------------------------------- */


                const siguienteEstado =
                    pedido.siguiente_estado ||
                    null;

                let siguienteNombre = "";

                let siguienteId = null;

                if (
                    typeof siguienteEstado === "object" &&
                    siguienteEstado !== null
                ) {

                    siguienteNombre =
                        siguienteEstado.nombre ||
                        "";

                    siguienteId =
                        Number(
                            siguienteEstado.id
                        );

                } else if (
                    siguienteEstado !== null &&
                    siguienteEstado !== undefined
                ) {

                    siguienteId =
                        Number(
                            siguienteEstado
                        );
                }


                /* -----------------------------------------
                   CLASE ESTADO
                   ----------------------------------------- */

                let estadoClase =
                    "estado-default";


                if (
                    estadoNormalizado.includes(
                        "PREPARACION"
                    ) ||
                    estadoNormalizado.includes(
                        "PREPARANDO"
                    )
                ) {

                    estadoClase =
                        "estado-preparacion";

                } else if (
                    estadoNormalizado.includes(
                        "LISTO"
                    )
                ) {

                    estadoClase =
                        "estado-listo";

                } else if (
                    estadoNormalizado.includes(
                        "EN DELIVERY"
                    ) ||
                    estadoNormalizado.includes(
                        "ENVIAR DELIVERY"
                    ) ||
                    estadoNormalizado.includes(
                        "ENVIAR"
                    )
                ) {

                    estadoClase =
                        "estado-enviar";
                }


                /* -----------------------------------------
                   TIEMPO
                   ----------------------------------------- */

                let tiempoTexto =
                    "0 min";

                const fechaPedido =
                    pedido.fecha ||
                    pedido.fecha_inicio ||
                    pedido.created_at ||
                    pedido.fecha_creacion;

                if (fechaPedido) {

                    const inicio =
                        new Date(
                            fechaPedido
                        );

                    if (
                        !isNaN(
                            inicio.getTime()
                        )
                    ) {

                        const ahora =
                            new Date();

                        const diferencia =
                            ahora.getTime() -
                            inicio.getTime();

                        const minutos =
                            Math.max(
                                0,
                                Math.floor(
                                    diferencia /
                                    60000
                                )
                            );

                        tiempoTexto =
                            `${minutos} min`;
                    }
                }


                /* -----------------------------------------
                   HTML
                   ----------------------------------------- */

                return `

                    <article
                        class="
                            order-row
                            ${estadoClase}
                            ${
                                Number(
                                    pedidoActivoSeleccionado
                                ) === Number(pedido.id)
                                    ? "selected"
                                    : ""
                            }
                        "
                        data-order-id="${escapeHtml(pedido.id)}"
                    >

                        <!-- PEDIDO -->

                        <div
                            class="
                                order-col
                                order-number-col
                            "
                        >

                            <strong
                                class="order-number"
                            >
                                #${escapeHtml(pedido.id)}
                            </strong>

                        </div>


                        <!-- CLIENTE -->

                        <div
                            class="
                                order-col
                                order-client-col
                            "
                        >

                            <strong
                                class="order-client-name"
                            >
                                ${escapeHtml(
                                    nombreCliente
                                )}
                            </strong>

                            ${
                                telefono
                                    ? `
                                        <span
                                            class="
                                                order-client-phone
                                            "
                                        >
                                            📞
                                            ${escapeHtml(
                                                telefono
                                            )}
                                        </span>
                                      `
                                    : ""
                            }

                            ${
                                direccion
                                    ? `
                                        <span
                                            class="
                                                order-client-address
                                            "
                                        >
                                            📍
                                            ${escapeHtml(
                                                direccion
                                            )}
                                        </span>
                                      `
                                    : ""
                            }

                            ${
                                pedido.fecha_programada
                                    ? `
                                        <span
                                            class="order-client-address"
                                            style="color:var(--primary); font-weight:800;"
                                        >
                                            ⏰ Para las ${new Date(pedido.fecha_programada).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                      `
                                    : ""
                            }

                        </div>


                        <!-- TOTAL -->

                        <div
                            class="
                                order-col
                                order-total-col
                            "
                        >

                            <strong
                                class="order-total"
                            >
                                ${money(total)}
                            </strong>

                        </div>


                        <!-- MEDIO DE PAGO -->

                        <div
                            class="
                                order-col
                                order-payment-col
                            "
                        >

                            <span
                                class="order-payment"
                            >
                                ${escapeHtml(
                                    medioPagoPedido
                                )}
                            </span>

                        </div>


                        <!-- TIEMPO -->

                        <div
                            class="
                                order-col
                                order-time-col
                            "
                        >

                            <span
                                class="order-time"
                            >
                                ${escapeHtml(
                                    tiempoTexto
                                )}
                            </span>

                        </div>


                        <!-- ESTADO + ACCIÓN -->

                        <div
                            class="
                                order-col
                                order-status-info
                            "
                        >

                            <span
                                class="order-status-badge"
                            >

                                <span
                                    class="status-dot"
                                ></span>

                                ${escapeHtml(
                                    estado
                                )}

                            </span>


                            <span
                                class="order-delivery-type"
                            >
                                ${escapeHtml(
                                    tipoEntrega
                                )}
                            </span>


                            ${
                                siguienteNombre
                                    ? `
                                        <button
                                            type="button"
                                            class="order-next-button"
                                            onclick="
                                                avanzarPedido(
                                                    ${Number(pedido.id)}
                                                )
                                            "
                                        >
                                            ${escapeHtml(
                                                siguienteNombre
                                            )}
                                        </button>
                                      `
                                    : ""
                            }

                        </div>

                    </article>
                `;
            })
            .join("");


    /* =====================================================
       SELECCIONAR PEDIDO
       ===================================================== */

    container
        .querySelectorAll(".order-row")
        .forEach(row => {

            row.addEventListener(
                "click",
                event => {

                    /*
                       Si hicieron click en el botón
                       de avanzar, no seleccionamos
                       nuevamente el pedido.
                    */

                    if (
                        event.target.closest(
                            ".order-next-button"
                        )
                    ) {
                        return;
                    }

                    const id =
                        Number(
                            row.dataset.orderId
                        );

                    seleccionarPedidoActivo(
                        id
                    );
                }
            );
        });
}

/* =========================================================
   ACTUALIZAR TIEMPOS VISUALES
   =========================================================

   NO consulta la API.

   Simplemente recalcula cuánto tiempo pasó
   desde la fecha de creación de cada pedido.
   ========================================================= */

function actualizarTiemposPedidos() {

    const ahora =
        Date.now();

    document
        .querySelectorAll(
            ".order-row"
        )
        .forEach(row => {

            const pedidoId =
                Number(
                    row.dataset.orderId
                );

            if (!pedidoId) {
                return;
            }

            const pedido =
                pedidosActivos.find(
                    item =>
                        Number(item.id) ===
                        pedidoId
                );

            if (!pedido) {
                return;
            }

            const fechaPedido =
                pedido.fecha ||
                pedido.fecha_inicio ||
                pedido.created_at ||
                pedido.fecha_creacion;

            if (!fechaPedido) {
                return;
            }

            const inicio =
                new Date(
                    fechaPedido
                );

            if (
                isNaN(
                    inicio.getTime()
                )
            ) {
                return;
            }

            const diferencia =
                ahora -
                inicio.getTime();

            const minutos =
                Math.max(
                    0,
                    Math.floor(
                        diferencia /
                        60000
                    )
                );

            const timeElement =
                row.querySelector(
                    ".order-time"
                );

            if (timeElement) {

                timeElement.textContent =
                    `${minutos} min`;
            }
        });
}


/* =========================================================
   ACTUALIZAR PEDIDOS AUTOMÁTICAMENTE
   ========================================================= */

async function actualizarPedidosAutomaticamente() {

    if (cargandoPedidosAutomaticamente) {
        return;
    }

    cargandoPedidosAutomaticamente = true;

    try {

        console.log(
            "🔄 CONSULTANDO PEDIDOS ACTIVOS..."
        );


        const respuesta =
            await fetch(
                `${API_URL}/pedidos/activos`,
                {
                    method: "GET",
                    headers: authHeaders(),
                    cache: "no-store"
                }
            );


        if (!respuesta.ok) {

            if (
                manejarErrorAuth(
                    respuesta.status
                )
            ) {
                return;
            }

            throw new Error(
                `HTTP ${respuesta.status}`
            );
        }


        const data =
            await respuesta.json();


        /* =================================================
           NORMALIZAR
           ================================================= */

        let nuevosPedidos = [];

        if (Array.isArray(data)) {

            nuevosPedidos = data;

        } else if (
            Array.isArray(data?.pedidos)
        ) {

            nuevosPedidos =
                data.pedidos;
        }


        console.log(
            "📦 PEDIDOS RECIBIDOS:",
            nuevosPedidos
        );


        /* =================================================
           DETECTAR CAMBIOS
           ================================================= */

        const huboCambios =
            pedidosTuvieronCambios(
                pedidosActivosAnterior,
                nuevosPedidos
            );


        /* =================================================
           DETECTAR NUEVOS
           ================================================= */

        const idsAnteriores =
            new Set(
                pedidosActivosAnterior.map(
                    pedido =>
                        Number(pedido.id)
                )
            );


        const hayPedidosNuevos =
            nuevosPedidos.some(
                pedido =>
                    !idsAnteriores.has(
                        Number(pedido.id)
                    )
            );


        /* =================================================
           ACTUALIZAR ESTADO GLOBAL
           ================================================= */

        pedidosActivos =
            nuevosPedidos;

        window.pedidosActivos =
            pedidosActivos;


        /* =================================================
           RENDERIZAR SI HUBO CAMBIOS
           ================================================= */

        if (huboCambios) {

            console.log(
                "🎨 CAMBIO DETECTADO → RENDERIZANDO PEDIDOS"
            );

            renderOrders(
                pedidosActivos
            );


            /* =============================================
               MENSAJE
               ============================================= */

            if (hayPedidosNuevos) {

                showToast(
                    "Nuevo pedido recibido"
                );

            } else {

                showToast(
                    "Pedido actualizado"
                );
            }
        }


        /* =================================================
           GUARDAR SNAPSHOT
           ================================================= */

        pedidosActivosAnterior =
            structuredClone(
                pedidosActivos
            );


    } catch (error) {

        console.error(
            "❌ ERROR ACTUALIZANDO PEDIDOS:",
            error
        );

        /*
         * No borramos los pedidos
         * que ya están en pantalla.
         */

    } finally {

        cargandoPedidosAutomaticamente =
            false;
    }
}


/* =========================================================
   INICIAR ACTUALIZACIÓN AUTOMÁTICA
   ========================================================= */

function iniciarActualizacionAutomaticaPedidos() {

    detenerActualizacionAutomaticaPedidos();


    /* =====================================================
       RELOJ VISUAL
       ===================================================== */

    intervaloRelojPedidos =
        setInterval(
            actualizarTiemposPedidos,
            INTERVALO_RELOJ_MS
        );


    /* =====================================================
       CONSULTA API
       ===================================================== */

    intervaloPedidosActivos =
        setInterval(
            actualizarPedidosAutomaticamente,
            INTERVALO_PEDIDOS_MS
        );


    console.log(
        "🟢 ACTUALIZACIÓN AUTOMÁTICA INICIADA"
    );

    console.log(
        `⏱️ Reloj: cada ${INTERVALO_RELOJ_MS} ms`
    );

    console.log(
        `🌐 API: cada ${INTERVALO_PEDIDOS_MS} ms`
    );
}


/* =========================================================
   DETENER ACTUALIZACIÓN AUTOMÁTICA
   ========================================================= */

function detenerActualizacionAutomaticaPedidos() {

    if (intervaloRelojPedidos) {

        clearInterval(
            intervaloRelojPedidos
        );

        intervaloRelojPedidos = null;
    }


    if (intervaloPedidosActivos) {

        clearInterval(
            intervaloPedidosActivos
        );

        intervaloPedidosActivos = null;
    }


    if (intervaloPedidos) {

        clearInterval(
            intervaloPedidos
        );

        intervaloPedidos = null;
    }
}
/* =========================================================
   AVANZAR PEDIDO
   ========================================================= */

async function avanzarPedido(pedidoId) {

    try {

        console.log(
            "======================================"
        );

        console.log(
            "AVANZANDO PEDIDO"
        );

        console.log(
            "Pedido:",
            pedidoId
        );

        console.log(
            "======================================"
        );


        const url =
            `${API_URL}/pedidos/${pedidoId}/avanzar-estado`;

        console.log(
            "PUT:",
            url
        );


        const respuesta =
            await fetch(
                url,
                {
                    method: "PUT",
                    headers: authHeaders()
                }
            );


        let data = null;

        try {

            data =
                await respuesta.json();

        } catch {

            data = null;
        }


        console.log(
            "RESPUESTA:",
            data
        );


        if (!respuesta.ok) {

            if (
                manejarErrorAuth(
                    respuesta.status
                )
            ) {
                return;
            }

            throw new Error(
                `HTTP ${respuesta.status} - ${
                    data?.detail
                        ? JSON.stringify(
                            data.detail
                        )
                        : "Error"
                }`
            );
        }


        console.log(
            "PEDIDO AVANZADO CORRECTAMENTE"
        );


        showToast(
            "Pedido actualizado"
        );


        await cargarPedidosActivos();

    } catch (error) {

        console.error(
            "ERROR AVANZANDO PEDIDO:",
            error
        );

        showToast(
            "No se pudo avanzar el pedido"
        );
    }
}


/* =========================================================
   SELECCIONAR PEDIDO ACTIVO
   ========================================================= */

function seleccionarPedidoActivo(pedidoId) {

    const pedido =
        pedidosActivos.find(
            item =>
                Number(item.id) ===
                Number(pedidoId)
        );

    if (!pedido) {

        console.warn(
            "Pedido activo no encontrado:",
            pedidoId
        );

        return;
    }

    // Si había una edición sin guardar de OTRO pedido, la
    // descartamos — si no, el carrito de ese pedido viejo
    // se queda pegado y se mezcla con el próximo cliente.

    if (
        modoEdicionPedidoId &&
        Number(modoEdicionPedidoId) !== Number(pedido.id)
    ) {

        modoEdicionPedidoId = null;

        const direccionBox = document.getElementById("editDireccionBox");

        if (direccionBox) direccionBox.style.display = "none";

        limpiarPedidoActual();

        showToast("Se descartó la edición anterior sin guardar");
    }

    pedidoActivoSeleccionado =
        Number(pedido.id);

    console.log(
        "PEDIDO ACTIVO SELECCIONADO:",
        pedido
    );


    /*
       POR AHORA NO COBRAMOS.

       Solamente seleccionamos el pedido.

       El próximo paso será abrir
       el panel/modal de COBRO.
    */

    renderOrders(
        pedidosActivos
    );

    showToast(
        `Pedido #${pedido.id} seleccionado`
    );
}


/* =========================================================
   BUSCADOR PRODUCTOS
   ========================================================= */

function inicializarBuscadorProductos() {

    const input =
        document.getElementById(
            "productSearch"
        );

    if (!input) {
        return;
    }

    input.addEventListener(
        "input",
        renderProducts
    );
}


/* =========================================================
   VACIAR CARRITO
   ========================================================= */

function inicializarBotonVaciar() {

    const button =
        document.getElementById(
            "clearCartButton"
        );

    if (!button) {
        return;
    }

    button.addEventListener(
        "click",
        () => {

            if (!carrito.length) {
                return;
            }

            carrito = [];

            if (modoEdicionPedidoId) {

                modoEdicionPedidoId = null;

                const direccionBox = document.getElementById("editDireccionBox");

                if (direccionBox) direccionBox.style.display = "none";

                showToast("Edición cancelada, carrito vacío");

            } else {

                showToast("Carrito vacío");
            }

            renderCart();
        }
    );
}


/* =========================================================
   REIMPRIMIR / CANCELAR / DETALLE
   =========================================================

   Los 4 botones del panel "OPERACIÓN" actúan sobre
   pedidoActivoSeleccionado (el que tocaste en la lista).
   ========================================================= */

function requierePedidoSeleccionado() {

    console.log(
        "🔍 CHEQUEO pedidoActivoSeleccionado:",
        pedidoActivoSeleccionado
    );

    if (!pedidoActivoSeleccionado) {

        showToast("Seleccioná un pedido activo primero");

        return false;
    }

    return true;
}

async function reimprimirPedidoSeleccionado() {

    if (!requierePedidoSeleccionado()) return;

    try {

        const respuesta = await fetch(
            `${API_URL}/pedidos/${pedidoActivoSeleccionado}/reimprimir`,
            {
                method: "POST",
                headers: authHeaders()
            }
        );

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) return;

            throw new Error(`HTTP ${respuesta.status}`);
        }

        showToast(`Ticket #${pedidoActivoSeleccionado} enviado a imprimir`);

    } catch (error) {

        console.error("ERROR REIMPRIMIENDO:", error);

        showToast("No se pudo reimprimir el ticket");
    }
}

async function cancelarPedidoSeleccionado() {

    if (!requierePedidoSeleccionado()) return;

    if (!confirm(`¿Cancelar el pedido #${pedidoActivoSeleccionado}? No se puede deshacer.`)) {
        return;
    }

    try {

        const respuesta = await fetch(
            `${API_URL}/pedidos/${pedidoActivoSeleccionado}/cancelar`,
            {
                method: "PUT",
                headers: authHeaders()
            }
        );

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) return;

            throw new Error(`HTTP ${respuesta.status}`);
        }

        showToast(`Pedido #${pedidoActivoSeleccionado} cancelado`);

        pedidoActivoSeleccionado = null;

        await cargarPedidosActivos(true);

    } catch (error) {

        console.error("ERROR CANCELANDO:", error);

        showToast("No se pudo cancelar el pedido");
    }
}

async function abrirDetallePedido() {

    if (!requierePedidoSeleccionado()) return;

    try {

        const respuesta = await fetch(
            `${API_URL}/pedidos/${pedidoActivoSeleccionado}`,
            {
                method: "GET",
                headers: authHeaders()
            }
        );

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) return;

            throw new Error(`HTTP ${respuesta.status}`);
        }

        const pedido = await respuesta.json();

        renderDetallePedido(pedido);

        document.getElementById("orderDetailModal").style.display = "flex";

    } catch (error) {

        console.error("ERROR CARGANDO DETALLE:", error);

        showToast("No se pudo cargar el detalle del pedido");
    }
}

function renderDetallePedido(pedido) {

    document.getElementById("orderDetailTitulo").textContent =
        `Pedido #${pedido.id}`;

    const items = obtenerItemsPedido(pedido);

    const body = document.getElementById("orderDetailBody");

    const cliente = obtenerClientePedido(pedido);

    const direccion =
        pedido.direccion_entrega ||
        cliente.domicilio_fiscal ||
        "";

    const tipoEntrega = String(
        pedido.tipo_entrega || "LOCAL"
    ).toUpperCase();

    body.innerHTML = `

        <div style="margin-bottom:14px; padding:10px 12px; background:var(--panel-soft); border:1px solid var(--border); border-radius:8px; font-size:12.5px;">

            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span style="color:var(--muted);">Cliente</span>
                <strong style="color:var(--text);">${escapeHtml(cliente.nombre || "Mostrador")}</strong>
            </div>

            ${
                cliente.telefono
                    ? `<div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="color:var(--muted);">Teléfono</span>
                        <strong style="color:var(--text);">${escapeHtml(cliente.telefono)}</strong>
                       </div>`
                    : ""
            }

            ${
                direccion
                    ? `<div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="color:var(--muted);">Dirección</span>
                        <strong style="color:var(--text); text-align:right; max-width:220px;">${escapeHtml(direccion)}</strong>
                       </div>`
                    : ""
            }

            ${
                pedido.fecha_programada
                    ? `<div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="color:var(--muted);">Programado para</span>
                        <strong style="color:var(--primary);">⏰ ${new Date(pedido.fecha_programada).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</strong>
                       </div>`
                    : ""
            }

            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span style="color:var(--muted);">Tipo de entrega</span>
                <strong style="color:var(--text);">${escapeHtml(tipoEntrega)}</strong>
            </div>

            <div style="display:flex; justify-content:space-between;">
                <span style="color:var(--muted);">Estado</span>
                <strong style="color:var(--text);">${escapeHtml(pedido.estado || "—")}</strong>
            </div>

            <div style="display:flex; justify-content:space-between; margin-top:4px;">
                <span style="color:var(--muted);">Medio de pago</span>
                <strong style="color:var(--text);">${escapeHtml(pedido.medio_pago || "—")}</strong>
            </div>

            ${
                pedido.observaciones
                    ? `<div style="margin-top:8px; padding-top:8px; border-top:1px dashed var(--border-light);">
                        <span style="color:var(--muted); display:block; margin-bottom:2px;">Observaciones</span>
                        <span style="color:var(--text);">${escapeHtml(pedido.observaciones)}</span>
                       </div>`
                    : ""
            }

        </div>

        ${items.map(item => `
            <div style="padding:8px 0; border-bottom:1px solid var(--border);">
                <div style="display:flex; justify-content:space-between; font-size:13px; color:var(--text); font-weight:700;">
                    <span>${item.cantidad}x ${escapeHtml(item.nombre)}</span>
                    <span>${money(item.subtotal)}</span>
                </div>
                ${
                    Array.isArray(item.opciones) && item.opciones.length
                        ? `<div style="margin-top:3px; padding-left:8px;">
                            ${item.opciones.map(o => `
                                <div style="font-size:11px; color:var(--muted);">
                                    + ${o.cantidad}x ${escapeHtml(o.nombre)}
                                </div>
                            `).join("")}
                           </div>`
                        : ""
                }
            </div>
        `).join("")}

        <div style="display:flex; justify-content:space-between; margin-top:12px; font-size:15px; font-weight:800; color:var(--text);">
            <span>Total</span>
            <span>${money(pedido.total)}</span>
        </div>
    `;
}

function cerrarDetallePedido() {

    document.getElementById("orderDetailModal").style.display = "none";
}


/* =========================================================
   EDITAR PEDIDO — BOTONES DEL PANEL "PEDIDOS ACTIVOS"
   ========================================================= */

function inicializarEditarPedido() {

    const editar = document.getElementById("editOrderButton");
    const reimprimir = document.getElementById("reprintOrderButton");
    const cancelar = document.getElementById("cancelOrderButton");
    const detalle = document.getElementById("detailOrderButton");
    const detalleModal = document.getElementById("orderDetailModal");
    const detalleCerrar = document.getElementById("orderDetailCerrar");
    const detalleCerrar2 = document.getElementById("orderDetailCerrar2");

    if (editar) {
        editar.addEventListener("click", abrirEdicionPedido);
    }

    if (reimprimir) {
        reimprimir.addEventListener("click", reimprimirPedidoSeleccionado);
    }

    if (cancelar) {
        cancelar.addEventListener("click", cancelarPedidoSeleccionado);
    }

    if (detalle) {
        detalle.addEventListener("click", abrirDetallePedido);
    }

    if (detalleCerrar) {
        detalleCerrar.addEventListener("click", cerrarDetallePedido);
    }

    if (detalleCerrar2) {
        detalleCerrar2.addEventListener("click", cerrarDetallePedido);
    }

    if (detalleModal) {

        detalleModal.addEventListener("click", event => {

            if (event.target === detalleModal) {
                cerrarDetallePedido();
            }
        });
    }
}


/* =========================================================
   CLIENTES - EVENTOS
   ========================================================= */

function inicializarClientes() {

    /* =====================================================
       BUSCAR CLIENTE
       ===================================================== */

    const searchButton =
        document.getElementById(
            "searchClientButton"
        );

    if (searchButton) {

        searchButton.addEventListener(
            "click",
            buscarClientes
        );
    }


    const searchInput =
        document.getElementById(
            "clientSearch"
        );

    if (searchInput) {

        searchInput.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter"
                ) {

                    event.preventDefault();

                    buscarClientes();
                }
            }
        );
    }


    /* =====================================================
       CERRAR SELECTOR
       ===================================================== */

    const closeSelector =
        document.getElementById(
            "closeClientSelector"
        );

    if (closeSelector) {

        closeSelector.addEventListener(
            "click",
            () => {

                const selector =
                    document.getElementById(
                        "clientSelector"
                    );

                if (selector) {

                    selector.style.display =
                        "none";
                }
            }
        );
    }


    /* =====================================================
       + NUEVO CLIENTE
       ===================================================== */

    const newClientButton =
        document.getElementById(
            "newClientButton"
        );

    if (newClientButton) {

        newClientButton.addEventListener(
            "click",
            () => {

                abrirModalCliente();

            }
        );
    }


    /* =====================================================
       EDITAR CLIENTE
       ===================================================== */

    const editClientButton =
        document.getElementById(
            "editClientButton"
        );

    if (editClientButton) {

        editClientButton.addEventListener(
            "click",
            () => {

                if (
                    !clienteActual ||
                    !clienteActual.id
                ) {

                    showToast(
                        "Seleccioná un cliente primero"
                    );

                    return;
                }

                abrirModalCliente(
                    clienteActual
                );
            }
        );
    }


    /* =====================================================
       MODAL
       ===================================================== */

    const modal =
        document.getElementById(
            "clientModal"
        );

    if (modal) {

        const closeButton =
            modal.querySelector(
                ".client-modal-close"
            );

        const cancelButton =
            modal.querySelector(
                ".client-modal-cancel"
            );

        const saveButton =
            modal.querySelector(
                ".client-modal-save"
            );


        if (closeButton) {

            closeButton.addEventListener(
                "click",
                cerrarModalCliente
            );
        }


        if (cancelButton) {

            cancelButton.addEventListener(
                "click",
                cerrarModalCliente
            );
        }


        if (saveButton) {

            saveButton.addEventListener(
                "click",
                guardarCliente
            );
        }


        /*
         * Cerrar haciendo click
         * fuera de la caja
         */

        modal.addEventListener(
            "click",
            event => {

                if (
                    event.target === modal
                ) {

                    cerrarModalCliente();
                }
            }
        );
    }
}

/* =========================================================
   VENTA MOSTRADOR
   ========================================================= */

function obtenerTipoEntrega() {

    const checkbox =
        document.getElementById(
            "ventaMostrador"
        );

    if (
        checkbox &&
        checkbox.checked
    ) {

        return "MOSTRADOR";
    }

    return "DELIVERY";
}


function actualizarVisibilidadDireccion() {

    const direccionBox = document.getElementById("editDireccionBox");

    if (!direccionBox) return;

    const esMostrador = obtenerTipoEntrega() === "MOSTRADOR";

    // En modo edición siempre se muestra (ya lo maneja
    // abrirEdicionPedido/cancelarEdicionPedido aparte).

    if (modoEdicionPedidoId) return;

    direccionBox.style.display = esMostrador ? "none" : "block";
}

function inicializarVentaMostrador() {

    const checkbox =
        document.getElementById(
            "ventaMostrador"
        );

    if (!checkbox) {

        console.warn(
            "No existe #ventaMostrador"
        );

        return;
    }

    actualizarVisibilidadDireccion();

    checkbox.addEventListener(
        "change",
        () => {

            const tipo =
                obtenerTipoEntrega();

            console.log(
                "TIPO DE ENTREGA:",
                tipo
            );

            actualizarVisibilidadDireccion();

            /*
             * Si es mostrador, ocultamos
             * datos de delivery si en el futuro
             * queremos hacerlo visualmente.
             */

            if (tipo === "MOSTRADOR") {

                showToast(
                    "Venta mostrador seleccionada"
                );

            } else {

                showToast(
                    "Venta delivery seleccionada"
                );
            }
        }
    );
}
/* =========================================================
   BOTÓN PROCESAR
   ========================================================= */

function inicializarProcesarPedido() {

    console.log("======================================");
    console.log("🔵 INICIALIZANDO BOTÓN COBRAR");
    console.log("======================================");

    const button =
        document.getElementById("chargeButton");

    console.log(
        "BOTÓN ENCONTRADO:",
        button
    );

    if (!button) {

        console.warn(
            "🔴 No existe #chargeButton"
        );

        return;
    }

    console.log(
        "🟢 BOTÓN COBRAR ENCONTRADO"
    );

    button.addEventListener(
        "click",
        function () {

            console.log(
                "🟢🟢🟢 CLICK DETECTADO EN COBRAR"
            );

            console.log(
                "CHECK MOSTRADOR:",
                document.getElementById(
                    "ventaMostrador"
                )?.checked
            );

            console.log(
                "CLIENTE ACTUAL:",
                clienteActual
            );

            console.log(
                "CARRITO:",
                carrito
            );

            procesarPedido();

        }
    );

    console.log(
        "🟢 EVENTO CLICK CONECTADO"
    );
}


/* =========================================================
   INICIALIZAR SELECTOR DE VARIEDAD
   ========================================================= */

function inicializarSelectorVariedad() {

    const cerrar = document.getElementById("variedadModalCerrar");
    const cancelar = document.getElementById("variedadModalCancelar");
    const confirmar = document.getElementById("variedadModalConfirmar");
    const modal = document.getElementById("variedadModal");

    if (cerrar) {
        cerrar.addEventListener("click", cerrarSelectorVariedad);
    }

    if (cancelar) {
        cancelar.addEventListener("click", cerrarSelectorVariedad);
    }

    if (confirmar) {
        confirmar.addEventListener("click", confirmarSelectorVariedad);
    }

    if (modal) {

        modal.addEventListener("click", event => {

            if (event.target === modal) {
                cerrarSelectorVariedad();
            }
        });
    }
}


/* =========================================================
   VERIFICAR CAJA ABIERTA
   =========================================================

   Si no hay ninguna caja abierta, tapa el workspace con un
   aviso y manda a la sección Cajas — el POS no debería
   vender sin turno abierto.
   ========================================================= */

async function verificarCajaAbierta() {

    try {

        const respuesta = await fetch(
            `${API_URL}/cajas/estado`,
            {
                method: "GET",
                headers: authHeaders()
            }
        );

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) {
                return;
            }

            // Si el endpoint todavía no existe (no se aplicó
            // el backend) no bloqueamos la venta por las dudas.

            return;
        }

        const estado = await respuesta.json();

        if (!estado.abierta) {

            mostrarBloqueoCajaCerrada();
        }

    } catch (error) {

        console.error("ERROR VERIFICANDO CAJA:", error);
    }
}

function mostrarBloqueoCajaCerrada() {

    if (document.getElementById("cajaCerradaOverlay")) {
        return;
    }

    const overlay = document.createElement("div");

    overlay.id = "cajaCerradaOverlay";

    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(10, 12, 16, .92);
        text-align: center;
    `;

    overlay.innerHTML = `
        <div style="max-width:360px;">
            <div style="font-size:40px; margin-bottom:14px;">🔒</div>
            <h2 style="color:var(--text); margin:0 0 8px; font-size:19px;">
                Caja cerrada
            </h2>
            <p style="color:var(--muted); font-size:13px; line-height:1.5; margin:0 0 20px;">
                No podés vender sin abrir la caja primero.
            </p>
            <button
                type="button"
                id="btnIrACajas"
                style="
                    height:44px; padding:0 22px; border:0;
                    border-radius:9px; background:var(--primary);
                    color:white; font-size:14px; font-weight:800;
                "
            >
                Ir a Caja
            </button>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById("btnIrACajas")
        .addEventListener("click", () => {

            overlay.remove();

            location.hash = "#/cajas";
        });
}


/* =========================================================
   PEDIDOS DE LA CARTA DIGITAL — pendientes de aprobar
   ========================================================= */

let intervaloPendientesCarta = null;
let idsPendientesCartaVistos = null;
let pendientesCartaReconocido = false;

function sonarAvisoPedidoWeb() {

    try {

        const ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Melodía ascendente de 3 notas, repetida 2 veces,
        // con notas más largas — para que se note bien
        // aunque haya ruido en el local.

        const frase = [
            { frecuencia: 784 },   // Sol5
            { frecuencia: 988 },   // Si5
            { frecuencia: 1319 },  // Mi6
        ];

        const duracionNota = 0.32;
        const espacioEntreNotas = 0.18;
        const espacioEntreFrases = 0.55;

        [0, 1].forEach(repeticion => {

            const inicioFrase =
                repeticion * (frase.length * espacioEntreNotas + espacioEntreFrases);

            frase.forEach(({ frecuencia }, indice) => {

                const inicio = inicioFrase + indice * espacioEntreNotas;

                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = "triangle";
                osc.frequency.value = frecuencia;

                gain.gain.setValueAtTime(0.0001, ctx.currentTime + inicio);
                gain.gain.exponentialRampToValueAtTime(0.32, ctx.currentTime + inicio + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + duracionNota);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(ctx.currentTime + inicio);
                osc.stop(ctx.currentTime + inicio + duracionNota + 0.02);
            });
        });

    } catch (error) {

        console.warn("No se pudo reproducir el sonido de aviso:", error);
    }
}

function mostrarAvisoPedidoWeb(pedido) {

    const contenedor = document.getElementById("avisosPedidoWebContenedor")
        || crearContenedorAvisosPedidoWeb();

    const aviso = document.createElement("div");

    aviso.className = "aviso-pedido-web";

    aviso.innerHTML = `
        <div class="aviso-pedido-web-icono">🌐</div>
        <div class="aviso-pedido-web-texto">
            <strong>Nuevo pedido web — #${escapeHtml(pedido.id)}</strong>
            <span>${escapeHtml(pedido.cliente_nombre || "Sin nombre")} · ${money(pedido.total)}</span>
        </div>
        <button type="button" class="aviso-pedido-web-cerrar">✕</button>
    `;

    aviso.querySelector(".aviso-pedido-web-cerrar").addEventListener("click", () => {
        aviso.remove();
    });

    aviso.addEventListener("click", event => {

        if (event.target.closest(".aviso-pedido-web-cerrar")) return;

        aviso.remove();

        const boton = document.getElementById("pendientesCartaButton");

        if (boton) boton.click();
    });

    contenedor.appendChild(aviso);

    setTimeout(() => {
        aviso.remove();
    }, 12000);
}

function crearContenedorAvisosPedidoWeb() {

    const contenedor = document.createElement("div");

    contenedor.id = "avisosPedidoWebContenedor";
    contenedor.className = "avisos-pedido-web-contenedor";

    document.body.appendChild(contenedor);

    return contenedor;
}

async function cargarPendientesCarta() {

    try {

        const respuesta = await fetch(`${API_URL}/pedidos/pendientes-aprobacion`, {
            method: "GET",
            headers: authHeaders()
        });

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) return;

            throw new Error(`HTTP ${respuesta.status}`);
        }

        const pendientes = await respuesta.json();

        // -----------------------------------------------------
        // DETECTAR PEDIDOS NUEVOS -> reactivan la alerta
        // (incluso si ya la habías "silenciado" abriendo el
        // panel antes)
        // -----------------------------------------------------

        if (idsPendientesCartaVistos !== null) {

            const nuevos = pendientes.filter(
                p => !idsPendientesCartaVistos.has(p.id)
            );

            if (nuevos.length > 0) {

                pendientesCartaReconocido = false;

                nuevos.forEach(p => {

                    mostrarAvisoPedidoWeb(p);
                });
            }

        } else if (pendientes.length > 0) {

            // Primera carga (recién entraste a Ventas) y ya
            // hay pedidos esperando de antes — también avisa,
            // no solo a los "nuevos desde que abriste".

            pendientesCartaReconocido = false;
        }

        idsPendientesCartaVistos = new Set(pendientes.map(p => p.id));

        // -----------------------------------------------------
        // SONIDO PERSISTENTE — suena en cada consulta (cada 15s)
        // mientras haya algo sin atender y no lo hayas "visto"
        // -----------------------------------------------------

        if (pendientes.length > 0 && !pendientesCartaReconocido) {

            sonarAvisoPedidoWeb();
        }

        const badge = document.getElementById("pendientesCartaBadge");

        if (badge) {

            if (pendientes.length > 0) {

                badge.textContent = pendientes.length;
                badge.style.display = "flex";

            } else {

                badge.style.display = "none";
            }
        }

        window._pendientesCartaCache = pendientes;

        const modal = document.getElementById("pendientesCartaModal");

        if (modal && modal.style.display !== "none") {

            renderPendientesCarta(pendientes);
        }

    } catch (error) {

        console.error("ERROR CARGANDO PEDIDOS PENDIENTES (CARTA):", error);
    }
}

function renderPendientesCarta(pendientes) {

    const body = document.getElementById("pendientesCartaBody");

    if (!body) return;

    if (!pendientes.length) {

        body.innerHTML = `
            <div style="text-align:center; padding:30px; color:var(--muted); font-size:13px;">
                No hay pedidos web esperando aprobación.
            </div>
        `;

        return;
    }

    body.innerHTML = pendientes.map(p => `
        <div style="margin-bottom:12px; padding:12px; background:var(--panel-soft); border:1px solid var(--border); border-radius:9px;">

            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                <strong style="color:var(--text); font-size:13px;">#${escapeHtml(p.id)} — ${escapeHtml(p.cliente_nombre)}</strong>
                <strong style="color:var(--text); font-size:13px;">${money(p.total)}</strong>
            </div>

            ${p.fecha_programada ? `
                <div style="display:inline-block; margin-bottom:6px; padding:3px 8px; border-radius:20px; background:var(--primary-soft); color:var(--primary); font-size:11px; font-weight:800;">
                    ⏰ Programado para las ${new Date(p.fecha_programada).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                </div>
            ` : ""}

            ${p.cliente_telefono ? `<div style="font-size:11.5px; color:var(--muted); margin-bottom:2px;">📞 ${escapeHtml(p.cliente_telefono)}</div>` : ""}

            ${p.direccion_entrega ? `<div style="font-size:11.5px; color:var(--muted); margin-bottom:6px;">📍 ${escapeHtml(p.direccion_entrega)}</div>` : ""}

            <div style="font-size:11px; color:var(--muted); margin-bottom:8px;">
                ${p.items.map(i => `${i.cantidad}x ${escapeHtml(i.nombre)}`).join(" · ")}
            </div>

            <div style="display:flex; gap:8px;">
                <button
                    type="button"
                    data-aceptar-carta="${p.id}"
                    style="flex:1; height:32px; border:1px solid var(--success); border-radius:7px; background:var(--success); color:white; font-size:11.5px; font-weight:800;"
                >
                    ✓ Aceptar
                </button>
                <button
                    type="button"
                    data-rechazar-carta="${p.id}"
                    style="flex:1; height:32px; border:1px solid var(--danger); border-radius:7px; background:transparent; color:var(--danger); font-size:11.5px; font-weight:800;"
                >
                    ✕ Rechazar
                </button>
            </div>

        </div>
    `).join("");

    body.querySelectorAll("[data-aceptar-carta]").forEach(btn => {

        btn.addEventListener("click", () => procesarPendienteCarta(btn.dataset.aceptarCarta, "aceptar"));
    });

    body.querySelectorAll("[data-rechazar-carta]").forEach(btn => {

        btn.addEventListener("click", () => procesarPendienteCarta(btn.dataset.rechazarCarta, "rechazar"));
    });
}

async function procesarPendienteCarta(pedidoId, accion) {

    if (accion === "rechazar" && !confirm(`¿Rechazar el pedido #${pedidoId}? El cliente va a ver que no se pudo confirmar.`)) {
        return;
    }

    try {

        const respuesta = await fetch(`${API_URL}/pedidos/${pedidoId}/${accion}`, {
            method: "PUT",
            headers: authHeaders()
        });

        if (!respuesta.ok) {

            if (manejarErrorAuth(respuesta.status)) return;

            throw new Error(`HTTP ${respuesta.status}`);
        }

        showToast(accion === "aceptar" ? `Pedido #${pedidoId} aceptado` : `Pedido #${pedidoId} rechazado`);

        await cargarPendientesCarta();

        renderPendientesCarta(window._pendientesCartaCache || []);

        if (accion === "aceptar") {

            await cargarPedidosActivos(true);
        }

    } catch (error) {

        console.error("ERROR PROCESANDO PEDIDO CARTA:", error);

        showToast("No se pudo procesar el pedido");
    }
}

function inicializarPendientesCarta() {

    const boton = document.getElementById("pendientesCartaButton");
    const modal = document.getElementById("pendientesCartaModal");
    const cerrar = document.getElementById("pendientesCartaCerrar");
    const cerrar2 = document.getElementById("pendientesCartaCerrar2");

    if (boton) {

        boton.addEventListener("click", () => {

            if (modal) modal.style.display = "flex";

            pendientesCartaReconocido = true;

            renderPendientesCarta(window._pendientesCartaCache || []);
        });
    }

    [cerrar, cerrar2].forEach(btn => {

        if (btn) {
            btn.addEventListener("click", () => {
                if (modal) modal.style.display = "none";
            });
        }
    });

    if (modal) {

        modal.addEventListener("click", event => {

            if (event.target === modal) modal.style.display = "none";
        });
    }

    cargarPendientesCarta();

    intervaloPendientesCarta = setInterval(cargarPendientesCarta, 15000);
}


/* =========================================================
   INICIALIZACIÓN
   ========================================================= */

async function inicializar() {

    console.log(
        "======================================"
    );

    console.log(
        "LIGHT POS - PEDIDOS"
    );

    console.log(
        "Inicializando..."
    );

    console.log(
        "API:",
        API_URL
    );

    console.log(
        "======================================"
    );


    /* -----------------------------------------------------
       EVENTOS

       NOTA: la sidebar y su botón de colapsar ahora
       viven en el shell (index.html / js/app.js),
       por eso ya no se inicializan acá.
       ----------------------------------------------------- */

    inicializarBuscadorProductos();
    inicializarBotonVaciar();
    inicializarClientes();
    inicializarVentaMostrador();
    inicializarProcesarPedido();
    inicializarMediosPago();
    inicializarDescuento();
    inicializarSelectorVariedad();
    inicializarEditarPedido();
    inicializarPendientesCarta();

    verificarCajaAbierta();


    /* -----------------------------------------------------
       RENDER INICIAL
       ----------------------------------------------------- */

    renderCategories();

    renderProducts();

    renderCart();

    renderOrders([]);

    updateTotals();


    /* -----------------------------------------------------
       CARGAS INICIALES
       ----------------------------------------------------- */

    await Promise.all([

        cargarProductos(),

        cargarClientes(),

        cargarPedidosActivos()

    ]);

    iniciarActualizacionAutomaticaPedidos();

    console.log(
        "======================================"
    );

    console.log(
        "LIGHT POS - PEDIDOS LISTO."
    );

    console.log(
        "======================================"
    );
}


/* =========================================================
   EXPORTAR AL SHELL
   =========================================================

   El router (js/app.js) llama a estas dos funciones
   al entrar y al salir de la sección "Ventas".
   ========================================================= */

window.avanzarPedido = avanzarPedido;

window.LightPOS = window.LightPOS || {};
window.LightPOS.ventas = {
    init: inicializar,
    destroy: function () {

        detenerActualizacionAutomaticaPedidos();

        if (intervaloPendientesCarta) {
            clearInterval(intervaloPendientesCarta);
            intervaloPendientesCarta = null;
        }

        const overlay = document.getElementById("cajaCerradaOverlay");

        if (overlay) {
            overlay.remove();
        }
    }
};

})();