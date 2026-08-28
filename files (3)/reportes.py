from fastapi import APIRouter, Depends
from datetime import date, timedelta

from api.database import obtener_conexion
from api.dependencies import obtener_usuario_actual


router = APIRouter(
    prefix="/reportes",
    tags=["Reportes"]
)


# ============================================================
# RESUMEN DE HOY (usa la pantalla de Inicio)
# ============================================================

@router.get("/resumen-hoy")
def resumen_hoy(
    usuario=Depends(obtener_usuario_actual)
):

    comercio_id = usuario["comercio_id"]

    hoy = date.today()

    with obtener_conexion() as conexion:

        with conexion.cursor() as cursor:

            # ------------------------------------------
            # VENTAS DE HOY (excluye canceladas)
            # ------------------------------------------

            cursor.execute("""
                SELECT
                    COUNT(*),
                    COALESCE(SUM(p.total), 0)
                FROM pedidos p
                JOIN estados_pedido ep ON ep.id = p.estado_pedido_id
                WHERE p.comercio_id = %s
                  AND p.fecha::date = %s
                  AND UPPER(ep.codigo) NOT IN ('CANCELADO', 'RECHAZADO')
            """, (comercio_id, hoy))

            cantidad_ventas, total_ventas = cursor.fetchone()

            # ------------------------------------------
            # PEDIDOS ACTIVOS AHORA
            # ------------------------------------------

            cursor.execute("""
                SELECT COUNT(*)
                FROM pedidos
                WHERE comercio_id = %s
                  AND estado_pedido_id IN (1, 6, 7, 8)
            """, (comercio_id,))

            pedidos_activos = cursor.fetchone()[0]

            # ------------------------------------------
            # ESTADO DE CAJA
            # ------------------------------------------

            cursor.execute("""
                SELECT c.nombre
                FROM aperturas_caja ac
                JOIN cajas c ON c.id = ac.caja_id
                WHERE c.comercio_id = %s
                  AND ac.estado = 'ABIERTA'
                ORDER BY ac.fecha_apertura DESC
                LIMIT 1
            """, (comercio_id,))

            caja_fila = cursor.fetchone()

            # ------------------------------------------
            # GASTOS DE HOY
            # ------------------------------------------

            cursor.execute("""
                SELECT COALESCE(SUM(monto), 0)
                FROM gastos
                WHERE comercio_id = %s
                  AND fecha::date = %s
            """, (comercio_id, hoy))

            gastos_hoy = cursor.fetchone()[0]

            # ------------------------------------------
            # PRODUCTOS / CLIENTES ACTIVOS
            # ------------------------------------------

            cursor.execute("""
                SELECT COUNT(*) FROM productos
                WHERE comercio_id = %s AND activo = TRUE
            """, (comercio_id,))

            productos_total = cursor.fetchone()[0]

            cursor.execute("""
                SELECT COUNT(*) FROM clientes
                WHERE comercio_id = %s AND activo = TRUE
            """, (comercio_id,))

            clientes_total = cursor.fetchone()[0]

            # ------------------------------------------
            # VENTAS POR MEDIO DE PAGO (HOY)
            # ------------------------------------------

            cursor.execute("""
                SELECT
                    COALESCE(p.medio_pago, 'Sin especificar'),
                    COUNT(*),
                    COALESCE(SUM(p.total), 0)
                FROM pedidos p
                JOIN estados_pedido ep ON ep.id = p.estado_pedido_id
                WHERE p.comercio_id = %s
                  AND p.fecha::date = %s
                  AND UPPER(ep.codigo) NOT IN ('CANCELADO', 'RECHAZADO')
                GROUP BY p.medio_pago
                ORDER BY SUM(p.total) DESC
            """, (comercio_id, hoy))

            ventas_por_medio = cursor.fetchall()

    return {

        "ventas_hoy": {
            "total": float(total_ventas),
            "cantidad": cantidad_ventas
        },

        "pedidos_activos": pedidos_activos,

        "caja_abierta": caja_fila is not None,
        "caja_nombre": caja_fila[0] if caja_fila else None,

        "gastos_hoy": float(gastos_hoy),

        "productos_total": productos_total,
        "clientes_total": clientes_total,

        "ventas_por_medio_hoy": [
            {"medio": fila[0], "cantidad": fila[1], "total": float(fila[2])}
            for fila in ventas_por_medio
        ],

    }


# ============================================================
# RESUMEN POR RANGO DE DÍAS (usa la pantalla de Reportes)
# ============================================================

@router.get("/resumen")
def resumen(
    dias: int = 7,
    usuario=Depends(obtener_usuario_actual)
):

    comercio_id = usuario["comercio_id"]

    dias = max(1, min(dias, 365))

    desde = date.today() - timedelta(days=dias - 1)

    with obtener_conexion() as conexion:

        with conexion.cursor() as cursor:

            cursor.execute("""
                SELECT
                    COUNT(*),
                    COALESCE(SUM(p.total), 0)
                FROM pedidos p
                JOIN estados_pedido ep ON ep.id = p.estado_pedido_id
                WHERE p.comercio_id = %s
                  AND p.fecha::date >= %s
                  AND UPPER(ep.codigo) NOT IN ('CANCELADO', 'RECHAZADO')
            """, (comercio_id, desde))

            cantidad_ventas, total_ventas = cursor.fetchone()

            ticket_promedio = (
                float(total_ventas) / cantidad_ventas
                if cantidad_ventas else 0
            )

            cursor.execute("""
                SELECT
                    COALESCE(p.medio_pago, 'Sin especificar'),
                    COUNT(*),
                    COALESCE(SUM(p.total), 0)
                FROM pedidos p
                JOIN estados_pedido ep ON ep.id = p.estado_pedido_id
                WHERE p.comercio_id = %s
                  AND p.fecha::date >= %s
                  AND UPPER(ep.codigo) NOT IN ('CANCELADO', 'RECHAZADO')
                GROUP BY p.medio_pago
                ORDER BY SUM(p.total) DESC
            """, (comercio_id, desde))

            ventas_por_medio = cursor.fetchall()

            cursor.execute("""
                SELECT
                    pr.nombre,
                    SUM(pd.cantidad) AS cantidad,
                    SUM(pd.subtotal) AS total
                FROM pedidos_detalle pd
                JOIN pedidos p ON p.id = pd.pedido_id
                JOIN productos pr ON pr.id = pd.producto_id
                JOIN estados_pedido ep ON ep.id = p.estado_pedido_id
                WHERE p.comercio_id = %s
                  AND p.fecha::date >= %s
                  AND UPPER(ep.codigo) NOT IN ('CANCELADO', 'RECHAZADO')
                GROUP BY pr.nombre
                ORDER BY cantidad DESC
                LIMIT 8
            """, (comercio_id, desde))

            top_productos = cursor.fetchall()

            cursor.execute("""
                SELECT
                    p.fecha::date AS dia,
                    COALESCE(SUM(p.total), 0)
                FROM pedidos p
                JOIN estados_pedido ep ON ep.id = p.estado_pedido_id
                WHERE p.comercio_id = %s
                  AND p.fecha::date >= %s
                  AND UPPER(ep.codigo) NOT IN ('CANCELADO', 'RECHAZADO')
                GROUP BY p.fecha::date
                ORDER BY p.fecha::date
            """, (comercio_id, desde))

            ventas_por_dia = cursor.fetchall()

            cursor.execute("""
                SELECT COALESCE(SUM(monto), 0)
                FROM gastos
                WHERE comercio_id = %s
                  AND fecha::date >= %s
            """, (comercio_id, desde))

            gastos_periodo = cursor.fetchone()[0]

    return {

        "dias": dias,
        "cantidad_ventas": cantidad_ventas,
        "total_ventas": float(total_ventas),
        "ticket_promedio": round(ticket_promedio, 2),
        "gastos_periodo": float(gastos_periodo),

        "ventas_por_medio": [
            {"medio": fila[0], "cantidad": fila[1], "total": float(fila[2])}
            for fila in ventas_por_medio
        ],

        "top_productos": [
            {"nombre": fila[0], "cantidad": float(fila[1]), "total": float(fila[2])}
            for fila in top_productos
        ],

        "ventas_por_dia": [
            {"fecha": fila[0].isoformat(), "total": float(fila[1])}
            for fila in ventas_por_dia
        ],

    }
