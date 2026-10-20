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
const { enviarCorreoReferenciaTienda, enviarCorreoTransferencia } = require("../../lib/email-tienda");

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

// Límite que Openpay impone a los cargos "en tienda" (Paynet): no acepta
// crear una referencia por más de este monto. El checkout también lo valida
// en el navegador, pero aquí es donde realmente se hace cumplir.
// https://documents.openpay.mx/docs/charge-store
const LIMITE_EFECTIVO_MXN = 29999.99;

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
    // "tarjeta" (por defecto, compatibilidad con clientes viejos), "efectivo"
    // o "transferencia".
    const metodoPagoSolicitado = req.body && req.body.metodo_pago;
    const metodoPago =
      metodoPagoSolicitado === "efectivo" || metodoPagoSolicitado === "transferencia"
        ? metodoPagoSolicitado
        : "tarjeta";

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
    if (metodoPago === "efectivo" && total > LIMITE_EFECTIVO_MXN) {
      res.status(400).json({
        error: `El pago en tienda tiene un límite de $${LIMITE_EFECTIVO_MXN.toFixed(2)} MXN por pedido. Paga con tarjeta o reduce la cantidad de productos.`,
      });
      return;
    }

    const { nombre, apellido } = partirNombre(cliente.nombre);
    const orderId = `orden-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const descripcion = `Pedido ${orderId} (subtotal ${subtotal} + IVA ${iva}) — ${detalle.map((d) => `${d.nombre} x${d.cantidad}`).join(", ")}`;

    let chargeRequest;
    if (metodoPago === "transferencia") {
      // Transferencia bancaria (SPEI/CIE): el cliente transfiere desde su
      // banco a la CLABE/convenio que Openpay genera. Igual que "efectivo",
      // no lleva tarjeta ni device_session_id. A diferencia de "tienda",
      // Openpay no documenta un monto máximo para este método.
      // https://www.openpay.mx/en/docs/bank-charge.html
      chargeRequest = {
        method: "bank_account",
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
    } else if (metodoPago === "efectivo") {
      // Cargo "en tienda": el cliente paga en efectivo en 7-Eleven u
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

    openpay.charges.create(chargeRequest, async (error, body) => {
      if (error) {
        // El SDK de Openpay entrega aquí el cuerpo de error "plano" de su
        // API (description, error_code, http_code, category) cuando la
        // respuesta no es 200/201/204, o un error de red/conexión si la
        // petición ni siquiera llegó a Openpay.
        console.error("Error al crear cargo en Openpay:", JSON.stringify(error));
        // Requisito de certificación de Openpay: para tarjeta reportada como
        // robada (3004) o con sospecha de fraude (3005) no se debe mostrar el
        // motivo real al cliente, solo un mensaje genérico.
        const MENSAJES_POR_CODIGO = {
          3004: "Error con tarjeta, comunícate con tu banco",
          3005: "Error con tarjeta, comunícate con tu banco",
        };
        const mensaje =
          MENSAJES_POR_CODIGO[error.error_code] ||
          error.description ||
          error.message ||
          "No se pudo procesar el pago con Openpay.";
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
        // Correo de confirmación con la referencia/código de barras, para
        // que el cliente la tenga a la mano aunque cierre la página de
        // "gracias". Si falla (p.ej. RESEND_API_KEY no configurada todavía
        // o un problema de red), no debe tumbar el checkout: solo se deja
        // registrado en los logs y el cliente igual ve la referencia en
        // pantalla.
        try {
          await enviarCorreoReferenciaTienda({
            to: cliente.email,
            referencia: body.payment_method.reference,
            barcodeUrl: body.payment_method.barcode_url,
            total,
            descripcionItems: detalle.map((d) => `${d.nombre} x${d.cantidad}`).join(", "),
            ordenId: orderId,
          });
        } catch (mailErr) {
          console.error("No se pudo enviar el correo de referencia de pago:", mailErr);
        }

        res.status(200).json({
          requiere_efectivo: true,
          charge_id: body.id,
          status: body.status,
          referencia: body.payment_method.reference,
          barcode_url: body.payment_method.barcode_url,
        });
        return;
      }

      if (body.payment_method && body.payment_method.type === "bank_transfer") {
        // Mismo correo de confirmación que en "tienda", adaptado a los
        // datos bancarios (CLABE/convenio/referencia en vez de código de
        // barras). Igual de no bloqueante si falla.
        try {
          await enviarCorreoTransferencia({
            to: cliente.email,
            banco: body.payment_method.bank,
            clabe: body.payment_method.clabe,
            convenio: body.payment_method.agreement,
            referencia: body.payment_method.name,
            chargeId: body.id,
            total,
            descripcionItems: detalle.map((d) => `${d.nombre} x${d.cantidad}`).join(", "),
            ordenId: orderId,
          });
        } catch (mailErr) {
          console.error("No se pudo enviar el correo de datos de transferencia:", mailErr);
        }

        res.status(200).json({
          requiere_transferencia: true,
          charge_id: body.id,
          status: body.status,
          banco: body.payment_method.bank,
          clabe: body.payment_method.clabe,
          convenio: body.payment_method.agreement,
          referencia: body.payment_method.name,
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
