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

// Cada producto en productos.json indica si su precio ya incluye el IVA
// (ivaIncluido: true) o no (ivaIncluido: false / ausente). Igual que en el
// cliente (carrito.js), aquí se vuelve a calcular el desglose por línea y
// el total a partir de data/productos.json — nunca se confía en ningún
// monto que venga del navegador. El cálculo debe ser idéntico al de
// carrito.js para que lo que el cliente ve coincida con lo que se le cobra.
const IVA_RATE = 0.16;

function desgloseLinea(producto, cantidad) {
  if (producto.ivaIncluido) {
    const total = Math.round(producto.precio * cantidad * 100) / 100;
    const subtotal = Math.round((total / (1 + IVA_RATE)) * 100) / 100;
    const iva = Math.round((total - subtotal) * 100) / 100;
    return { subtotal, iva, total };
  }
  const subtotal = Math.round(producto.precio * cantidad * 100) / 100;
  const iva = Math.round(subtotal * IVA_RATE * 100) / 100;
  const total = Math.round((subtotal + iva) * 100) / 100;
  return { subtotal, iva, total };
}

function calcularTotal(itemsCarrito) {
  let subtotal = 0;
  let iva = 0;
  let total = 0;
  const detalle = [];
  for (const linea of itemsCarrito) {
    const producto = productos.find((p) => p.id === linea.id);
    if (!producto) throw new Error(`Producto no encontrado: ${linea.id}`);
    const cantidad = Math.max(1, parseInt(linea.cantidad, 10) || 1);
    const desglose = desgloseLinea(producto, cantidad);
    subtotal += desglose.subtotal;
    iva += desglose.iva;
    total += desglose.total;
    detalle.push({ ...producto, cantidad });
  }
  subtotal = Math.round(subtotal * 100) / 100;
  iva = Math.round(iva * 100) / 100;
  total = Math.round(total * 100) / 100;
  return { subtotal, iva, total, detalle };
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
    // "tarjeta" (por defecto, compatibilidad con clientes viejos) o "efectivo".
    const metodoPago = req.body && req.body.metodo_pago === "efectivo" ? "efectivo" : "tarjeta";

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "Solicitud incompleta." });
      return;
    }
    if (!cliente || !cliente.email || !cliente.nombre) {
      res.status(400).json({ error: "Faltan datos del cliente." });
      return;
    }
    // Openpay exige token_id + device_session_id para cargos con tarjeta
    // (antifraude). Un cargo en efectivo ("store") no usa tarjeta: no hay
    // token que tokenizar ni dispositivo que verificar.
    if (metodoPago === "tarjeta" && (!token_id || !device_session_id)) {
      res.status(400).json({ error: "Solicitud incompleta." });
      return;
    }

    const { subtotal, iva, total, detalle } = calcularTotal(items);
    if (total <= 0) {
      res.status(400).json({ error: "El total del pedido no es válido." });
      return;
    }

    const { nombre, apellido } = partirNombre(cliente.nombre);
    const orderId = `orden-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const descripcion = `Pedido ${orderId} (subtotal ${subtotal} + IVA ${iva}) — ${detalle.map((d) => `${d.nombre} x${d.cantidad}`).join(", ")}`;

    let chargeRequest;
    if (metodoPago === "efectivo") {
      // Cargo "en tienda": el cliente paga en efectivo en OXXO, 7-Eleven u
      // otra tienda participante de Openpay, usando la referencia/código de
      // barras que Openpay genera. No lleva tarjeta ni device_session_id.
      chargeRequest = {
        method: "store",
        amount: total,
        currency: detalle[0].moneda || "MXN",
        description: descripcion,
        order_id: orderId,
        customer: {
          name: nombre,
          last_name: apellido,
          email: cliente.email,
          phone_number: cliente.telefono || undefined,
        },
      };
    } else {
      chargeRequest = {
        method: "card",
        source_id: token_id,
        amount: total,
        currency: detalle[0].moneda || "MXN",
        description: descripcion,
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

      if (body.payment_method && body.payment_method.type === "store") {
        res.status(200).json({
          requiere_efectivo: true,
          charge_id: body.id,
          status: body.status,
          referencia: body.payment_method.reference,
          barcode_url: body.payment_method.barcode_url,
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
