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
  // El constructor de esta versión del SDK solo acepta (merchantId,
  // privateKey, isProductionReady) — sin parámetro de país. Usamos los
  // setters explícitos para no depender del orden de los argumentos.
  const openpay = new Openpay();
  openpay.setMerchantId(process.env.OPENPAY_MERCHANT_ID);
  openpay.setPrivateKey(process.env.OPENPAY_PRIVATE_KEY);
  openpay.setProductionReady(process.env.OPENPAY_PRODUCTION === "true");
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

    // Openpay exige device_session_id para cargos con tarjeta (antifraude).
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

    if (device_session_id) {
      chargeRequest.device_session_id = device_session_id;
    }

    const openpay = clienteOpenpay();

    openpay.charges.create(chargeRequest, (error, body) => {
      if (error) {
        // El SDK de Openpay entrega aquí el cuerpo de error "plano" de su
        // API (description, error_code, http_code, category) cuando la
        // respuesta no es 200/201/204, o un error de red/conexión si la
        // petición ni siquiera llegó a Openpay.
        console.error("Error al crear cargo en Openpay:", JSON.stringify(error));
        const mensaje =
          error.description || error.message || "No se pudo procesar el pago con Openpay.";
        res.status(error.http_code || 402).json({ error: mensaje, error_code: error.error_code });
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
