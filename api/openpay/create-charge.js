/* ============================================================
   POST /api/openpay/create-charge
   Recibe el token de la tarjeta (generado en el navegador con
   Openpay.js) + el carrito, calcula el total en el SERVIDOR
   (nunca confiar en el precio que mande el cliente) y crea el
   cargo con la librería oficial de Openpay para Node.js.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const Openpay = require("openpay");

const productos = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data", "productos.json"), "utf8")
);

function clienteOpenpay() {
  const openpay = new Openpay(
    process.env.OPENPAY_MERCHANT_ID,
    process.env.OPENPAY_PRIVATE_KEY,
    "mx",
    process.env.OPENPAY_PRODUCTION === "true"
  );
  return openpay;
}

function calcularTotal(itemsCarrito) {
  let total = 0;
  const detalle = [];
  for (const linea of itemsCarrito) {
    const producto = productos.find((p) => p.id === linea.id);
    if (!producto) throw new Error(`Producto no encontrado: ${linea.id}`);
    const cantidad = Math.max(1, parseInt(linea.cantidad, 10) || 1);
    total += producto.precio * cantidad;
    detalle.push({ ...producto, cantidad });
  }
  return { total: Math.round(total * 100) / 100, detalle };
}

function partirNombre(nombreCompleto) {
  const partes = String(nombreCompleto || "").trim().split(/\s+/);
  const nombre = partes.shift() || "Cliente";
  const apellido = partes.join(" ") || "Sitio";
  return { nombre, apellido };
}

function urlBase(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  try {
    const { token_id, device_session_id, items, cliente } = req.body || {};

    if (!token_id || !device_session_id || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "Solicitud incompleta." });
      return;
    }
    if (!cliente || !cliente.email || !cliente.nombre) {
      res.status(400).json({ error: "Faltan datos del cliente." });
      return;
    }

    const { total, detalle } = calcularTotal(items);
    if (total <= 0) {
      res.status(400).json({ error: "El total del pedido no es válido." });
      return;
    }

    const { nombre, apellido } = partirNombre(cliente.nombre);
    const orderId = `orden-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const chargeRequest = {
      method: "card",
      source_id: token_id,
      amount: total,
      currency: detalle[0].moneda || "MXN",
      description: `Pedido ${orderId} — ${detalle.map((d) => `${d.nombre} x${d.cantidad}`).join(", ")}`,
      device_session_id,
      order_id: orderId,
      use_3d_secure: true,
      redirect_url: `${urlBase(req)}/tienda/gracias.html`,
      customer: {
        name: nombre,
        last_name: apellido,
        email: cliente.email,
        phone_number: cliente.telefono || undefined,
      },
    };

    const openpay = clienteOpenpay();

    openpay.charges.create(chargeRequest, (error, body) => {
      if (error) {
        console.error("Error al crear cargo en Openpay:", error);
        const mensaje =
          (error.data && error.data.description) ||
          error.message ||
          "No se pudo procesar el pago con Openpay.";
        res.status(error.status || 402).json({ error: mensaje });
        return;
      }

      if (body.payment_method && body.payment_method.type === "redirect") {
        res.status(200).json({
          requiere_3ds: true,
          redirect_url: body.payment_method.url,
          charge_id: body.id,
        });
        return;
      }

      res.status(200).json({
        requiere_3ds: false,
        charge_id: body.id,
        status: body.status,
      });
    });
  } catch (err) {
    console.error("Error inesperado en create-charge:", err);
    res.status(400).json({ error: err.message || "Solicitud inválida." });
  }
};
