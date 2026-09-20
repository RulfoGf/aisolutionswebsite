/* ============================================================
   POST /api/openpay/webhook
   Recibe las notificaciones de Openpay (charge.succeeded,
   charge.failed, charge.refunded, etc.). Vuelve a consultar el
   cargo por su id directamente en Openpay antes de confiar en el
   contenido del webhook (buena práctica: nunca fiarse solo del
   payload recibido).

   Configura esta URL como webhook en tu Dashboard de Openpay:
   Desarrollo > Webhooks > Agregar webhook
     URL: https://tu-sitio.info/api/openpay/webhook
     Usuario / Contraseña: los mismos que pongas en
       OPENPAY_WEBHOOK_USER / OPENPAY_WEBHOOK_PASSWORD

   Este endpoint no tiene base de datos propia: por ahora solo
   registra el evento en los logs de Vercel. Si más adelante
   quieres guardar pedidos o mandar un correo de confirmación,
   este es el lugar para conectarlo (ver README).
   ============================================================ */
const Openpay = require("openpay");

function autenticacionValida(req) {
  const usuario = process.env.OPENPAY_WEBHOOK_USER;
  const password = process.env.OPENPAY_WEBHOOK_PASSWORD;
  if (!usuario || !password) return true; // sin credenciales configuradas, no se exige

  const header = req.headers.authorization || "";
  const [tipo, credencial] = header.split(" ");
  if (tipo !== "Basic" || !credencial) return false;

  const [u, p] = Buffer.from(credencial, "base64").toString("utf8").split(":");
  return u === usuario && p === password;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  if (!autenticacionValida(req)) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const evento = req.body || {};
  const chargeId = evento.transaction && evento.transaction.id;

  console.log("Webhook de Openpay recibido:", evento.type, chargeId);

  if (chargeId) {
    const openpay = new Openpay(
      process.env.OPENPAY_MERCHANT_ID,
      process.env.OPENPAY_PRIVATE_KEY,
      "mx",
      process.env.OPENPAY_PRODUCTION === "true"
    );

    openpay.charges.get(chargeId, (error, body) => {
      if (error) {
        console.error("No se pudo confirmar el cargo del webhook:", error);
      } else {
        console.log(`Cargo ${body.id} confirmado con estado: ${body.status}`);
        // TODO: aquí puedes, por ejemplo, guardar el pedido en una
        // base de datos, actualizar inventario o enviar un correo.
      }
    });
  }

  // Responder rápido con 200 para que Openpay no reintente.
  res.status(200).json({ recibido: true });
};
