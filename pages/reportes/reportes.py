from fastapi import APIRouter, Depends
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from datetime import date

from api.database import obtener_conexion
from api.dependencies import obtener_usuario_actual


router = APIRouter(
    prefix="/reportes",
    tags=["Reportes"]
)


CENTAVOS = Decimal("0.01")


def dinero(valor):
    return Decimal(str(valor or 0)).quantize(CENTAVOS, rounding=ROUND_HALF_UP)


def decimal_a_float(valor):
    if valor is None:
        return 0.0
    return float(dinero(valor))


def rango_fechas(desde: Optional[str], hasta: Optional[str]):
    """
    Si no mandan desde/hasta, usa "hoy" para las dos.
    Devuelve strings YYYY-MM-DD listos para %s::date.
    """

    hoy = date.today().isoformat()

    return (desde or hoy), (hasta or hoy)


# ============================================================
# RESUMEN DE HOY (para la página de Inicio — sin cambios)
# ============================================================

@router.get("/resumen-hoy")
def resumen_hoy(usuario=Depends(obtener_usuario_actual)):

    comercio_id = usuario["comercio_id"]

    with obtener_conexion() as conexion:

        with conexion.cursor() as cursor:

            cursor.execute("""
                SELECT COUNT(*), COALESCE(SUM(p.total), 0)
                FROM pedidos p
                JOIN estados_pedido ep ON ep.id = p.estado_pedido_id
                WHERE p.comercio_id = %s
                  AND p.fecha >= CURRENT_DATE
                  AND UPPER(ep.codigo) NOT IN ('CANCELADO', 'RECHAZADO')
            """, (comercio_id,))

            cantidad_hoy, total_hoy = cursor.fetchone()

            cursor.execute("""
                SELECT
                    COALESCE(p.medio_pago, 'Sin especificar'),
                    COUNT(*), COALESCE(SUM(p.total), 0)
                FROM pedidos p
                JOIN estados_pedido ep ON ep.id = p.estado_pedido_id
                WHERE p.comercio_id = %s
                  AND p.fecha >= CURRENT_DATE
                  AND UPPER(ep.codigo) NOT IN ('CANCELADO', 'RECHAZADO')
                GROUP BY p.medio_pago
                ORDER BY 3 DESC
            """, (comercio_id,))

            por_medio = cursor.fetchall()

            cursor.execute("""
                SELECT COUNT(*)
                FROM pedidos p
                WHERE p.comercio_id = %s
                  AND p.estado_pedido_id IN (1, 6, 7, 8)
            """, (comercio_id,))

            pedidos_activos = cursor.fetchone()[0]

            cursor.execute("""
                SELECT COUNT(*) FROM clientes
                WHERE comercio_id = %s AND activo = TRUE
            """, (comercio_id,))

            clientes_total = cursor.fetchone()[0]

            cursor.execute("""
                SELECT COUNT(*) FROM productos
                WHERE comercio_id = %s AND activo = TRUE
            """, (comercio_id,))

            productos_total = cursor.fetchone()[0]

            cursor.execute("""
                SELECT ac.id, c.nombre, ac.monto_inicial, ac.fecha_apertura
                FROM aperturas_caja ac
                JOIN cajas c ON c.id = ac.caja_id
                WHERE c.comercio_id = %s AND ac.estado = 'ABIERTA'
                ORDER BY ac.fecha_apertura DESC
                LIMIT 1
            """, (comercio_id,))

            caja = cursor.fetchone()

            cursor.execute("""
                SELECT COALESCE(SUM(monto), 0) FROM gastos
                WHERE comercio_id = %s AND fecha >= CURRENT_DATE
            """, (comercio_id,))

            gastos_hoy = cursor.fetchone()[0]

    return {

        "ventas_hoy": {
            "cantidad": cantidad_hoy,
            "total": decimal_a_float(total_hoy)
        },

        "ventas_por_medio_hoy": [
            {"medio": f[0], "cantidad": f[1], "total": decimal_a_float(f[2])}
            for f in por_medio
        ],

        "pedidos_activos": pedidos_activos,
        "clientes_total": clientes_total,
        "productos_total": productos_total,
        "gastos_hoy": decimal_a_float(gastos_hoy),

        "caja_abierta": caja is not None,
        "caja_nombre": caja[1] if caja else None,
    }


# ============================================================
# VENTAS POR DÍA (gráfico) — ahora acepta desde/hasta
# ============================================================

@router.get("/ventas-por-dia")
def ventas_por_dia(
    dias: int = 7,
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    usuario=Depends(obtener_usuario_actual)
):

    comercio_id = usuario["comercio_id"]

    with obtener_conexion() as conexion:

        with conexion.cursor() as cursor:

            if desde and hasta:

                cursor.execute("""
                    SELECT DATE(p.fecha) AS dia, COUNT(*), COALESCE(SUM(p.total), 0)
                    FROM pedidos p
                    JOIN estados_pedido ep ON ep.id = p.estado_pedido_id
                    WHERE p.comercio_id = %s
                      AND p.fecha >= %s::date
                      AND p.fecha < (%s::date + INTERVAL '1 day')
                      AND UPPER(ep.codigo) NOT IN ('CANCELADO', 'RECHAZADO')
                    GROUP BY DATE(p.fecha)
                    ORDER BY dia
                """, (comercio_id, desde, hasta))

            else:

                cursor.execute("""
                    SELECT DATE(p.fecha) AS dia, COUNT(*), COALESCE(SUM(p.total), 0)
                    FROM pedidos p
                    JOIN estados_pedido ep ON ep.id = p.estado_pedido_id
                    WHERE p.comercio_id = %s
                      AND p.fecha >= CURRENT_DATE - (%s || ' days')::interval
                      AND UPPER(ep.codigo) NOT IN ('CANCELADO', 'RECHAZADO')
                    GROUP BY DATE(p.fecha)
                    ORDER BY dia
                """, (comercio_id, dias))

            filas = cursor.fetchall()

    return [
        {
            "fecha": fila[0].isoformat(),
            "cantidad": fila[1],
            "total": decimal_a_float(fila[2])
        }
        for fila in filas
    ]


# ============================================================
# TOP PRODUCTOS — ahora acepta desde/hasta
# ============================================================

@router.get("/top-productos")
def top_productos(
    dias: int = 30,
    limite: int = 6,
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    usuario=Depends(obtener_usuario_actual)
):

    comercio_id = usuario["comercio_id"]

    with obtener_conexion() as conexion:

        with conexion.cursor() as cursor:

            if desde and hasta:

                cursor.execute("""
                    SELECT pr.id, pr.nombre, SUM(pd.cantidad), SUM(pd.subtotal)
                    FROM pedidos_detalle pd
                    JOIN pedidos p ON p.id = pd.pedido_id
                    JOIN productos pr ON pr.id = pd.producto_id
                    JOIN estados_pedido ep ON ep.id = p.estado_pedido_id
                    WHERE p.comercio_id = %s
                      AND p.fecha >= %s::date
                      AND p.fecha < (%s::date + INTERVAL '1 day')
                      AND UPPER(ep.codigo) NOT IN ('CANCELADO', 'RECHAZADO')
                    GROUP BY pr.id, pr.nombre
                    ORDER BY SUM(pd.cantidad) DESC
                    LIMIT %s
                """, (comercio_id, desde, hasta, limite))

            else:

                cursor.execute("""
                    SELECT pr.id, pr.nombre, SUM(pd.cantidad), SUM(pd.subtotal)
                    FROM pedidos_detalle pd
                    JOIN pedidos p ON p.id = pd.pedido_id
                    JOIN productos pr ON pr.id = pd.producto_id
                    JOIN estados_pedido ep ON ep.id = p.estado_pedido_id
                    WHERE p.comercio_id = %s
                      AND p.fecha >= CURRENT_DATE - (%s || ' days')::interval
                      AND UPPER(ep.codigo) NOT IN ('CANCELADO', 'RECHAZADO')
                    GROUP BY pr.id, pr.nombre
                    ORDER BY SUM(pd.cantidad) DESC
                    LIMIT %s
                """, (comercio_id, dias, limite))

            filas = cursor.fetchall()

    return [
        {
            "producto_id": fila[0],
            "nombre": fila[1],
            "cantidad": float(fila[2]),
            "total": decimal_a_float(fila[3])
        }
        for fila in filas
    ]


# ============================================================
# VENTAS — tabla detallada, filtrable por rango de fechas
# ============================================================

@router.get("/ventas")
def listar_ventas(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    usuario=Depends(obtener_usuario_actual)
):

    comercio_id = usuario["comercio_id"]

    filtro_desde, filtro_hasta = rango_fechas(desde, hasta)

    with obtener_conexion() as conexion:

        with conexion.cursor() as cursor:

            cursor.execute("""
                SELECT
                    p.id, p.fecha, c.nombre, p.medio_pago,
                    p.tipo_entrega, p.total, p.estado
                FROM pedidos p
                LEFT JOIN clientes c ON c.id = p.cliente_id
                JOIN estados_pedido ep ON ep.id = p.estado_pedido_id
                WHERE p.comercio_id = %s
                  AND p.fecha >= %s::date
                  AND p.fecha < (%s::date + INTERVAL '1 day')
                  AND UPPER(ep.codigo) NOT IN ('CANCELADO', 'RECHAZADO')
                ORDER BY p.fecha DESC
            """, (comercio_id, filtro_desde, filtro_hasta))

            filas = cursor.fetchall()

    pedidos = [
        {
            "id": f[0],
            "fecha": f[1].isoformat(),
            "cliente": f[2] or "Mostrador",
            "medio_pago": f[3] or "—",
            "tipo_entrega": f[4] or "—",
            "total": decimal_a_float(f[5]),
            "estado": f[6],
        }
        for f in filas
    ]

    total = round(sum(p["total"] for p in pedidos), 2)
    cantidad = len(pedidos)
    promedio = round(total / cantidad, 2) if cantidad else 0

    return {
        "pedidos": pedidos,
        "resumen": {
            "total": total,
            "cantidad": cantidad,
            "promedio": promedio
        }
    }


# ============================================================
# GASTOS — detalle filtrable por rango de fechas
# ============================================================

@router.get("/gastos")
def listar_gastos_reporte(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    usuario=Depends(obtener_usuario_actual)
):

    comercio_id = usuario["comercio_id"]

    filtro_desde, filtro_hasta = rango_fechas(desde, hasta)

    with obtener_conexion() as conexion:

        with conexion.cursor() as cursor:

            cursor.execute("""
                SELECT g.id, g.tipo, g.detalle, g.monto, g.fecha, u.nombre
                FROM gastos g
                LEFT JOIN usuarios u ON u.id = g.usuario_id
                WHERE g.comercio_id = %s
                  AND g.fecha >= %s::date
                  AND g.fecha < (%s::date + INTERVAL '1 day')
                ORDER BY g.fecha DESC
            """, (comercio_id, filtro_desde, filtro_hasta))

            filas = cursor.fetchall()

    gastos = [
        {
            "id": f[0],
            "tipo": f[1],
            "detalle": f[2],
            "monto": decimal_a_float(f[3]),
            "fecha": f[4].isoformat(),
            "usuario": f[5] or "—"
        }
        for f in filas
    ]

    total = round(sum(g["monto"] for g in gastos), 2)

    return {"gastos": gastos, "total": total}


# ============================================================
# SEGMENTOS — por medio de pago, tipo de entrega y rubro
# ============================================================

@router.get("/segmentos")
def segmentos(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    usuario=Depends(obtener_usuario_actual)
):

    comercio_id = usuario["comercio_id"]

    filtro_desde, filtro_hasta = rango_fechas(desde, hasta)

    with obtener_conexion() as conexion:

        with conexion.cursor() as cursor:

            cursor.execute("""
                SELECT COALESCE(p.medio_pago, 'Sin especificar'), COUNT(*), COALESCE(SUM(p.total), 0)
                FROM pedidos p
                JOIN estados_pedido ep ON ep.id = p.estado_pedido_id
                WHERE p.comercio_id = %s
                  AND p.fecha >= %s::date
                  AND p.fecha < (%s::date + INTERVAL '1 day')
                  AND UPPER(ep.codigo) NOT IN ('CANCELADO', 'RECHAZADO')
                GROUP BY p.medio_pago
                ORDER BY 3 DESC
            """, (comercio_id, filtro_desde, filtro_hasta))

            por_medio = cursor.fetchall()

            cursor.execute("""
                SELECT COALESCE(p.tipo_entrega, 'Sin especificar'), COUNT(*), COALESCE(SUM(p.total), 0)
                FROM pedidos p
                JOIN estados_pedido ep ON ep.id = p.estado_pedido_id
                WHERE p.comercio_id = %s
                  AND p.fecha >= %s::date
                  AND p.fecha < (%s::date + INTERVAL '1 day')
                  AND UPPER(ep.codigo) NOT IN ('CANCELADO', 'RECHAZADO')
                GROUP BY p.tipo_entrega
                ORDER BY 3 DESC
            """, (comercio_id, filtro_desde, filtro_hasta))

            por_entrega = cursor.fetchall()

            cursor.execute("""
                SELECT COALESCE(r.nombre, 'Sin rubro'), COALESCE(SUM(pd.cantidad), 0), COALESCE(SUM(pd.subtotal), 0)
                FROM pedidos_detalle pd
                JOIN pedidos p ON p.id = pd.pedido_id
                JOIN productos pr ON pr.id = pd.producto_id
                LEFT JOIN rubros r ON r.id = pr.rubro_id
                JOIN estados_pedido ep ON ep.id = p.estado_pedido_id
                WHERE p.comercio_id = %s
                  AND p.fecha >= %s::date
                  AND p.fecha < (%s::date + INTERVAL '1 day')
                  AND UPPER(ep.codigo) NOT IN ('CANCELADO', 'RECHAZADO')
                GROUP BY r.nombre
                ORDER BY 3 DESC
            """, (comercio_id, filtro_desde, filtro_hasta))

            por_rubro = cursor.fetchall()

    return {

        "por_medio_pago": [
            {"nombre": f[0], "cantidad": f[1], "total": decimal_a_float(f[2])}
            for f in por_medio
        ],

        "por_tipo_entrega": [
            {"nombre": f[0], "cantidad": f[1], "total": decimal_a_float(f[2])}
            for f in por_entrega
        ],

        "por_rubro": [
            {"nombre": f[0], "cantidad": float(f[1] or 0), "total": decimal_a_float(f[2])}
            for f in por_rubro
        ],
    }
