/* ============================================================
   GET /api/openpay/check-charge?id=<charge_id>
   Consulta el estado real de un cargo directamente en Openpay
   (nunca confiar solo en lo que venga por la URL del navegador).
   Usada por tienda/gracias.html.
   ============================================================ */
const Openpay = require("openpay");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const chargeId = req.query.id;
  if (!chargeId) {
    res.status(400).json({ error: "Falta el id del cargo." });
    return;
  }

  const openpay = new Openpay();
  openpay.setMerchantId(process.env.OPENPAY_MERCHANT_ID);
  openpay.setPrivateKey(process.env.OPENPAY_PRIVATE_KEY);
  openpay.setProductionReady(process.env.OPENPAY_PRODUCTION === "true");

  openpay.charges.get(chargeId, (error, body) => {
    if (error) {
      console.error("Error al consultar cargo:", JSON.stringify(error));
      res.status(error.http_code || 404).json({ error: "No se encontró el cargo." });
      return;
    }
    res.status(200).json({
      id: body.id,
      status: body.status,
      payment_method: body.payment_method
        ? {
            type: body.payment_method.type,
            reference: body.payment_method.reference,
            barcode_url: body.payment_method.barcode_url,
          }
        : null,
    });
  });
};
