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

  const openpay = new Openpay(
    process.env.OPENPAY_MERCHANT_ID,
    process.env.OPENPAY_PRIVATE_KEY,
    "mx",
    process.env.OPENPAY_PRODUCTION === "true"
  );

  openpay.charges.get(chargeId, (error, body) => {
    if (error) {
      console.error("Error al consultar cargo:", error);
      res.status(error.status || 404).json({ error: "No se encontró el cargo." });
      return;
    }
    res.status(200).json({ id: body.id, status: body.status });
  });
};
