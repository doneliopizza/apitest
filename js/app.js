/* =========================================================
   LIGHT POS — SHELL / ROUTER

   index.html es el shell fijo (sidebar).
   Cada módulo (Ventas, Clientes, Productos...) se monta
   dentro de #viewRoot sin recargar la página.

   Solo "ventas" tiene implementación real por ahora.
   El resto muestra un placeholder hasta que se construya.
   ========================================================= */

const TOKEN = localStorage.getItem("lightpos_token");

if (!TOKEN) {
    window.location.href = "login.html";
}

const DEFAULT_ROUTE = "home";


/* =========================================================
   ÁRBOL DE NAVEGACIÓN
   ========================================================= */

const NAV = [
    { route: "home", label: "Inicio", icon: "🏠" },
    { route: "ventas", label: "Ventas (POS)", icon: "🛒" },
    { route: "kds", label: "KDS · Cocina", icon: "🍳" },
    { route: "clientes", label: "Clientes", icon: "👥" },
    { route: "productos", label: "Productos", icon: "📦" },
    { route: "cajas", label: "Cajas", icon: "💰" },
    { route: "colaboradores", label: "Colaboradores", icon: "🧑‍🤝‍🧑" },
    {
        label: "Compras", icon: "🧾",
        children: [
            { route: "compras/inventario", label: "Inventario" },
            { route: "compras/stock", label: "Stock" },
            { route: "compras/costos", label: "Costos" }
        ]
    },
    { route: "reportes", label: "Reportes", icon: "📊" },
    { route: "configuracion", label: "Configuración", icon: "⚙️" }
];


/* =========================================================
   REGISTRO DE RUTAS
   ========================================================= */

const ROUTES = {};

(function buildRoutes(items) {

    items.forEach(item => {

        if (item.children) {

            item.children.forEach(child => {

                ROUTES[child.route] = {
                    title: `${item.label} · ${child.label}`,
                    group: item.label
                };
            });

            return;
        }

        ROUTES[item.route] = {
            title: item.label,
            group: null
        };
    });

})(NAV);

// Módulos con implementación real por ahora
ROUTES["ventas"].load = loadVentas;
ROUTES["ventas"].group = "Operación";

ROUTES["configuracion"].load = loadConfiguracion;

ROUTES["clientes"].load = loadClientes;

ROUTES["productos"].load = loadProductos;

ROUTES["kds"].load = loadKds;

ROUTES["cajas"].load = loadCajas;

ROUTES["home"].load = loadHome;

ROUTES["reportes"].load = loadReportes;


/* =========================================================
   ESTADO
   ========================================================= */

let currentModule = null;


/* =========================================================
   SIDEBAR — RENDER
   ========================================================= */

function renderMenu() {

    const menu = document.getElementById("mainMenu");

    if (!menu) {
        return;
    }

    const items = NAV
        .map(item => {

            if (item.children) {

                const children = item.children
                    .map(child => `
                        <a
                            href="#/${child.route}"
                            class="menu-item"
                            data-route="${child.route}"
                        >
                            <span></span>
                            <b>${child.label}</b>
                        </a>
                    `)
                    .join("");

                return `
                    <details class="menu-group" data-group="${item.label}">
                        <summary class="menu-item">
                            <span class="menu-item-main">
                                <span>${item.icon}</span>
                                <b>${item.label}</b>
                            </span>
                            <span class="menu-chevron">▸</span>
                        </summary>
                        <div class="submenu">
                            ${children}
                        </div>
                    </details>
                `;
            }

            return `
                <a
                    href="#/${item.route}"
                    class="menu-item"
                    data-route="${item.route}"
                >
                    <span>${item.icon}</span>
                    <b>${item.label}</b>
                </a>
            `;
        })
        .join("");

    // Cerrar sesión: último ítem, al final de todos los módulos
    const logout = `
        <button
            type="button"
            class="menu-item menu-logout"
            id="sidebarLogoutBtn"
        >
            <span>⏻</span>
            <b>Cerrar sesión</b>
        </button>
    `;

    menu.innerHTML = items + logout;
}


function marcarActivo(route) {

    document
        .querySelectorAll("#mainMenu .menu-item")
        .forEach(el => {

            el.classList.toggle(
                "active",
                el.dataset.route === route
            );
        });

    const info = ROUTES[route];

    if (info && info.group) {

        const group = document.querySelector(
            `.menu-group[data-group="${info.group}"]`
        );

        if (group) {
            group.open = true;
        }
    }
}


/* =========================================================
   LOGOUT
   ========================================================= */

function inicializarLogout() {

    const btn = document.getElementById("sidebarLogoutBtn");

    if (!btn) {
        return;
    }

    btn.addEventListener("click", () => {

        localStorage.removeItem("lightpos_token");
        localStorage.removeItem("lightpos_usuario");

        window.location.href = "login.html";
    });
}


/* =========================================================
   SIDEBAR — COLLAPSE / MOBILE
   ========================================================= */

function inicializarSidebarShell() {

    const sidebar = document.getElementById("sidebar");
    const toggle = document.getElementById("sidebarToggle");
    const btnMobile = document.getElementById("btnMenuMobile");

    if (!sidebar) {
        return;
    }

    sidebar.classList.add("collapsed");

    if (toggle) {

        toggle.addEventListener("click", () => {
            sidebar.classList.toggle("collapsed");
        });
    }

    if (btnMobile) {

        btnMobile.addEventListener("click", () => {
            sidebar.classList.toggle("open");
        });
    }

    // Cerrar el menú mobile al elegir una sección
    sidebar.addEventListener("click", event => {

        if (
            event.target.closest(".menu-item") &&
            window.innerWidth <= 900
        ) {
            sidebar.classList.remove("open");
        }
    });
}


/* =========================================================
   PLACEHOLDER
   ========================================================= */

function renderPlaceholder(route) {

    const info = ROUTES[route];
    const viewRoot = document.getElementById("viewRoot");

    viewRoot.innerHTML = `
        <div class="module-placeholder">
            <div class="module-placeholder-icon">🚧</div>
            <h2>${info.title}</h2>
            <p>
                Este módulo todavía está en desarrollo.
                Pronto vas a poder gestionar
                ${info.title.toLowerCase()} desde acá.
            </p>
        </div>
    `;
}


/* =========================================================
   MÓDULO: VENTAS
   ========================================================= */

async function loadVentas(viewRoot) {

    const respuesta = await fetch("pages/ventas/ventas.html");

    if (!respuesta.ok) {
        throw new Error(
            `No se encontró pages/ventas/ventas.html (HTTP ${respuesta.status})`
        );
    }

    const html = await respuesta.text();

    viewRoot.innerHTML = html;

    const script = document.createElement("script");

    script.src = `pages/ventas/ventas.js?v=${Date.now()}`;

    const cargado = new Promise(resolve => {
        script.onload = resolve;
    });

    document.body.appendChild(script);

    await cargado;

    if (window.LightPOS?.ventas?.init) {
        window.LightPOS.ventas.init();
    }

    return {
        destroy() {

            if (window.LightPOS?.ventas?.destroy) {
                window.LightPOS.ventas.destroy();
            }

            script.remove();

            delete window.LightPOS?.ventas;
        }
    };
}


/* =========================================================
   MÓDULO: CONFIGURACIÓN
   ========================================================= */

async function loadConfiguracion(viewRoot) {

    const respuesta = await fetch("pages/configuracion/configuracion.html");

    if (!respuesta.ok) {
        throw new Error(
            `No se encontró pages/configuracion/configuracion.html (HTTP ${respuesta.status})`
        );
    }

    const html = await respuesta.text();

    viewRoot.innerHTML = html;

    const script = document.createElement("script");

    script.src = `pages/configuracion/configuracion.js?v=${Date.now()}`;

    const cargado = new Promise(resolve => {
        script.onload = resolve;
    });

    document.body.appendChild(script);

    await cargado;

    if (window.LightPOS?.configuracion?.init) {
        window.LightPOS.configuracion.init();
    }

    return {
        destroy() {

            if (window.LightPOS?.configuracion?.destroy) {
                window.LightPOS.configuracion.destroy();
            }

            script.remove();

            delete window.LightPOS?.configuracion;
        }
    };
}


/* =========================================================
   MÓDULO: CLIENTES
   ========================================================= */

async function loadClientes(viewRoot) {

    const respuesta = await fetch("pages/clientes/clientes.html");

    if (!respuesta.ok) {
        throw new Error(
            `No se encontró pages/clientes/clientes.html (HTTP ${respuesta.status})`
        );
    }

    const html = await respuesta.text();

    viewRoot.innerHTML = html;

    const script = document.createElement("script");

    script.src = `pages/clientes/clientes.js?v=${Date.now()}`;

    const cargado = new Promise(resolve => {
        script.onload = resolve;
    });

    document.body.appendChild(script);

    await cargado;

    if (window.LightPOS?.clientes?.init) {
        window.LightPOS.clientes.init();
    }

    return {
        destroy() {

            if (window.LightPOS?.clientes?.destroy) {
                window.LightPOS.clientes.destroy();
            }

            script.remove();

            delete window.LightPOS?.clientes;
        }
    };
}


/* =========================================================
   MÓDULO: PRODUCTOS
   ========================================================= */

async function loadProductos(viewRoot) {

    const respuesta = await fetch("pages/productos/productos.html");

    if (!respuesta.ok) {
        throw new Error(
            `No se encontró pages/productos/productos.html (HTTP ${respuesta.status})`
        );
    }

    const html = await respuesta.text();

    viewRoot.innerHTML = html;

    const script = document.createElement("script");

    script.src = `pages/productos/productos.js?v=${Date.now()}`;

    const cargado = new Promise(resolve => {
        script.onload = resolve;
    });

    document.body.appendChild(script);

    await cargado;

    if (window.LightPOS?.productos?.init) {
        window.LightPOS.productos.init();
    }

    return {
        destroy() {

            if (window.LightPOS?.productos?.destroy) {
                window.LightPOS.productos.destroy();
            }

            script.remove();

            delete window.LightPOS?.productos;
        }
    };
}


/* =========================================================
   MÓDULO: KDS (MONITOR DE COCINA)
   ========================================================= */

async function loadKds(viewRoot) {

    const respuesta = await fetch("pages/kds/kds.html");

    if (!respuesta.ok) {
        throw new Error(
            `No se encontró pages/kds/kds.html (HTTP ${respuesta.status})`
        );
    }

    const html = await respuesta.text();

    viewRoot.innerHTML = html;

    const script = document.createElement("script");

    script.src = `pages/kds/kds.js?v=${Date.now()}`;

    const cargado = new Promise(resolve => {
        script.onload = resolve;
    });

    document.body.appendChild(script);

    await cargado;

    if (window.LightPOS?.kds?.init) {
        window.LightPOS.kds.init();
    }

    return {
        destroy() {

            if (window.LightPOS?.kds?.destroy) {
                window.LightPOS.kds.destroy();
            }

            script.remove();

            delete window.LightPOS?.kds;
        }
    };
}


/* =========================================================
   MÓDULO: CAJAS
   ========================================================= */

async function loadCajas(viewRoot) {

    const respuesta = await fetch("pages/cajas/cajas.html");

    if (!respuesta.ok) {
        throw new Error(
            `No se encontró pages/cajas/cajas.html (HTTP ${respuesta.status})`
        );
    }

    const html = await respuesta.text();

    viewRoot.innerHTML = html;

    const script = document.createElement("script");

    script.src = `pages/cajas/cajas.js?v=${Date.now()}`;

    const cargado = new Promise(resolve => {
        script.onload = resolve;
    });

    document.body.appendChild(script);

    await cargado;

    if (window.LightPOS?.cajas?.init) {
        window.LightPOS.cajas.init();
    }

    return {
        destroy() {

            if (window.LightPOS?.cajas?.destroy) {
                window.LightPOS.cajas.destroy();
            }

            script.remove();

            delete window.LightPOS?.cajas;
        }
    };
}


/* =========================================================
   MÓDULO: INICIO
   ========================================================= */

async function loadHome(viewRoot) {

    const respuesta = await fetch("pages/home/home.html");

    if (!respuesta.ok) {
        throw new Error(
            `No se encontró pages/home/home.html (HTTP ${respuesta.status})`
        );
    }

    const html = await respuesta.text();

    viewRoot.innerHTML = html;

    const script = document.createElement("script");

    script.src = `pages/home/home.js?v=${Date.now()}`;

    const cargado = new Promise(resolve => {
        script.onload = resolve;
    });

    document.body.appendChild(script);

    await cargado;

    if (window.LightPOS?.home?.init) {
        window.LightPOS.home.init();
    }

    return {
        destroy() {

            if (window.LightPOS?.home?.destroy) {
                window.LightPOS.home.destroy();
            }

            script.remove();

            delete window.LightPOS?.home;
        }
    };
}


/* =========================================================
   MÓDULO: REPORTES
   ========================================================= */

async function loadReportes(viewRoot) {

    const respuesta = await fetch("pages/reportes/reportes.html");

    if (!respuesta.ok) {
        throw new Error(
            `No se encontró pages/reportes/reportes.html (HTTP ${respuesta.status})`
        );
    }

    const html = await respuesta.text();

    viewRoot.innerHTML = html;

    const script = document.createElement("script");

    script.src = `pages/reportes/reportes.js?v=${Date.now()}`;

    const cargado = new Promise(resolve => {
        script.onload = resolve;
    });

    document.body.appendChild(script);

    await cargado;

    if (window.LightPOS?.reportes?.init) {
        window.LightPOS.reportes.init();
    }

    return {
        destroy() {

            if (window.LightPOS?.reportes?.destroy) {
                window.LightPOS.reportes.destroy();
            }

            script.remove();

            delete window.LightPOS?.reportes;
        }
    };
}


/* =========================================================
   NAVEGACIÓN
   ========================================================= */

async function navigate() {

    let route = location.hash.replace(/^#\//, "") || DEFAULT_ROUTE;

    if (!ROUTES[route]) {
        route = DEFAULT_ROUTE;
    }

    if (currentModule?.destroy) {

        currentModule.destroy();
        currentModule = null;
    }

    marcarActivo(route);

    localStorage.setItem("lightpos_last_route", route);

    const viewRoot = document.getElementById("viewRoot");

    viewRoot.innerHTML = `<div class="view-loading">Cargando…</div>`;

    const info = ROUTES[route];

    if (info.load) {

        try {

            currentModule = await info.load(viewRoot);

        } catch (error) {

            console.error("Error cargando módulo:", route, error);

            viewRoot.innerHTML = `
                <div class="module-placeholder">
                    <div class="module-placeholder-icon">⚠️</div>
                    <h2>No se pudo cargar ${info.title}</h2>
                    <p>${error.message}</p>
                </div>
            `;
        }

        return;
    }

    renderPlaceholder(route);
}


/* =========================================================
   INICIALIZACIÓN
   ========================================================= */

/* =========================================================
   TEMA — claro / oscuro
   ========================================================= */

function inicializarThemeToggle() {

    const boton = document.getElementById("themeToggleBtn");
    const icono = document.getElementById("themeToggleIcono");
    const texto = document.getElementById("themeToggleTexto");

    if (!boton) {
        return;
    }

    function aplicarEstadoBoton(tema) {

        if (icono) {
            icono.textContent = tema === "light" ? "☀️" : "🌙";
        }

        if (texto) {
            texto.textContent = tema === "light" ? "Modo claro" : "Modo oscuro";
        }
    }

    const temaActual = localStorage.getItem("lightpos_tema") || "dark";

    aplicarEstadoBoton(temaActual);

    boton.addEventListener("click", () => {

        const esClaroAhora =
            document.documentElement.getAttribute("data-theme") === "light";

        const nuevoTema = esClaroAhora ? "dark" : "light";

        if (nuevoTema === "light") {
            document.documentElement.setAttribute("data-theme", "light");
        } else {
            document.documentElement.removeAttribute("data-theme");
        }

        localStorage.setItem("lightpos_tema", nuevoTema);

        aplicarEstadoBoton(nuevoTema);
    });
}


function inicializarShell() {

    renderMenu();
    inicializarSidebarShell();
    inicializarLogout();
    inicializarThemeToggle();

    window.addEventListener("hashchange", navigate);

    if (!location.hash) {

        const ultima = localStorage.getItem("lightpos_last_route");

        location.hash = `#/${
            ultima && ROUTES[ultima] ? ultima : DEFAULT_ROUTE
        }`;

        return;
    }

    navigate();
}

document.addEventListener("DOMContentLoaded", inicializarShell);