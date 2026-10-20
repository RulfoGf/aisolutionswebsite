/* ============================================================
   Correo de confirmación de "pago en tienda" (efectivo).

   Se dispara desde api/openpay/create-charge.js justo después de
   que Openpay devuelve la referencia/código de barras de un cargo
   tipo "store", para que el cliente tenga la referencia aunque
   cierre la página de "gracias".

   Usa la API REST de Resend directamente con fetch (sin instalar
   el paquete "resend"), para no agregar dependencias al proyecto.
   Si RESEND_API_KEY no está configurada todavía, no intenta
   enviar nada (solo deja un aviso en los logs) — así el checkout
   sigue funcionando normal mientras se termina de configurar.
   ============================================================ */

const TIENDAS_PARTICIPANTES = [
  "7-Eleven",
  "Circle K",
  "Farmacias del Ahorro",
  "Farmacias Benavides",
  "Walmart",
  "Walmart Express",
  "Sam's Club",
  "Bodega Aurrera",
];

const LOGO_URL = "https://www.ai-solutions4you.info/images-event/logo.png";
const SOPORTE_EMAIL = "contact@ai-solutions4you.com";
const SOPORTE_TEL = "+52 55 8581 6187";

function formatoMoneda(valor) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(valor);
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Openpay genera un recibo PDF oficial (con los logos reales de las
// tiendas afiliadas) a partir del merchant id + la referencia — no hace
// falta construir uno propio. Ver "Recibo de pago (Paso 3)" en:
// https://documents.openpay.mx/docs/charge-store
function urlReciboOficial(referencia) {
  const merchantId = process.env.OPENPAY_MERCHANT_ID;
  if (!merchantId || !referencia) return null;
  const dashboard =
    process.env.OPENPAY_PRODUCTION === "true"
      ? "https://dashboard.openpay.mx"
      : "https://sandbox-dashboard.openpay.mx";
  return `${dashboard}/paynet-pdf/${encodeURIComponent(merchantId)}/${encodeURIComponent(referencia)}`;
}

function htmlCorreoReferenciaTienda({ nombreCliente, referencia, barcodeUrl, total, descripcionItems, ordenId }) {
  const reciboUrl = urlReciboOficial(referencia);
  const fechaHora = new Date().toLocaleString("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  });

  const filasTiendas = [];
  for (let i = 0; i < TIENDAS_PARTICIPANTES.length; i += 4) {
    filasTiendas.push(TIENDAS_PARTICIPANTES.slice(i, i + 4));
  }
  const tiendasHtml = filasTiendas
    .map(
      (fila) => `
      <tr>
        ${fila
          .map(
            (t) => `<td style="padding:6px 10px;font:13px Arial,Helvetica,sans-serif;color:#18191b;background:#f4f4f6;border-radius:4px;text-align:center" width="25%">${escapeHtml(t)}</td>`
          )
          .join('<td width="8"></td>')}
      </tr>`
    )
    .join('<tr><td colspan="7" height="8"></td></tr>');

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Referencia de pago</title>
  </head>
  <body style="margin:0;padding:0;background:#eceef1;font-family:Arial,Helvetica,sans-serif;color:#18191b">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceef1;padding:24px 0">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%">

            <!-- Encabezado -->
            <tr>
              <td style="padding:24px 28px 16px 28px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td><img src="${LOGO_URL}" alt="AI Solutions4You" height="36" style="display:block"></td>
                    <td align="right" style="font:13px Arial,Helvetica,sans-serif;color:#6b7280">Pago en tienda vía Openpay</td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr><td style="border-top:1px solid #e5e7eb"></td></tr>

            <!-- Total a pagar -->
            <tr>
              <td style="padding:24px 28px 0 28px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#14213d;border-radius:8px">
                  <tr>
                    <td style="padding:20px 24px">
                      <div style="font:14px Arial,Helvetica,sans-serif;color:#c7d0e0">Total a pagar</div>
                      <div style="font:bold 32px Arial,Helvetica,sans-serif;color:#ffffff;padding:4px 0 6px 0">${formatoMoneda(total)} <span style="font-size:14px;font-weight:normal;color:#c7d0e0">MXN</span></div>
                      <div style="font:12px Arial,Helvetica,sans-serif;color:#c7d0e0">La comisión por recepción del pago, si aplica, la define cada tienda.</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Código de barras -->
            <tr>
              <td style="padding:24px 28px 0 28px;text-align:center">
                <div style="font:16px Arial,Helvetica,sans-serif;font-weight:bold;color:#18191b;text-align:left;padding-bottom:8px">Tu código de pago</div>
                ${barcodeUrl ? `<img src="${barcodeUrl}" alt="Código de barras ${escapeHtml(referencia)}" style="display:block;margin:0 auto;max-width:100%;height:auto">` : ""}
                <div style="font:18px 'Courier New',monospace;letter-spacing:1px;color:#18191b;padding-top:8px">${escapeHtml(referencia)}</div>
                <div style="font:12px Arial,Helvetica,sans-serif;color:#6b7280;padding-top:6px">Si el cajero no puede escanearlo, puede teclear este número de referencia.</div>
                ${reciboUrl ? `
                <div style="padding-top:18px">
                  <a href="${reciboUrl}" style="display:inline-block;background:#14213d;color:#ffffff;font:14px Arial,Helvetica,sans-serif;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:6px">Descargar recibo de pago (PDF oficial de Openpay)</a>
                </div>` : ""}
              </td>
            </tr>

            <!-- Detalles de la compra -->
            <tr>
              <td style="padding:28px 28px 0 28px">
                <div style="font:16px Arial,Helvetica,sans-serif;font-weight:bold;color:#18191b;padding-bottom:10px">Detalles de tu compra</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font:13px Arial,Helvetica,sans-serif;color:#18191b">
                  <tr style="background:#f4f4f6">
                    <td style="padding:10px 12px;width:38%;color:#6b7280">Pedido</td>
                    <td style="padding:10px 12px">${escapeHtml(ordenId)}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;color:#6b7280">Productos</td>
                    <td style="padding:10px 12px">${escapeHtml(descripcionItems)}</td>
                  </tr>
                  <tr style="background:#f4f4f6">
                    <td style="padding:10px 12px;color:#6b7280">Fecha y hora</td>
                    <td style="padding:10px 12px">${escapeHtml(fechaHora)}</td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Cómo pagar -->
            <tr>
              <td style="padding:28px 28px 0 28px">
                <div style="font:16px Arial,Helvetica,sans-serif;font-weight:bold;color:#18191b;padding-bottom:10px">Cómo realizar el pago</div>
                <ol style="margin:0;padding-left:18px;font:13px Arial,Helvetica,sans-serif;color:#18191b;line-height:1.6">
                  <li>Acude a cualquier tienda participante (ve la lista abajo).</li>
                  <li>Muestra al cajero el código de barras de este correo, o dicta la referencia.</li>
                  <li>Realiza el pago en efectivo por el total indicado.</li>
                  <li>Conserva tu ticket por si necesitas alguna aclaración.</li>
                </ol>
                <div style="font:12px Arial,Helvetica,sans-serif;color:#6b7280;padding-top:10px">
                  Tu pedido queda en proceso hasta que el pago se registre; te avisaremos por correo en cuanto se confirme.
                  Para cualquier duda, escríbenos a <a href="mailto:${SOPORTE_EMAIL}" style="color:#14213d">${SOPORTE_EMAIL}</a> o al ${SOPORTE_TEL}.
                </div>
              </td>
            </tr>

            <!-- Tiendas participantes -->
            <tr>
              <td style="padding:24px 28px 28px 28px">
                <div style="font:13px Arial,Helvetica,sans-serif;color:#6b7280;padding-bottom:10px">Tiendas participantes:</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${tiendasHtml}
                </table>
              </td>
            </tr>

            <tr><td style="border-top:1px solid #e5e7eb"></td></tr>

            <!-- Pie -->
            <tr>
              <td style="padding:18px 28px;text-align:center">
                <div style="font:12px Arial,Helvetica,sans-serif;color:#9ca3af">AI Solutions4You · <a href="https://www.ai-solutions4you.info/terminos.html" style="color:#9ca3af">Términos y condiciones de compra</a></div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function enviarCorreoReferenciaTienda({ to, referencia, barcodeUrl, total, descripcionItems, ordenId }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY no configurada: se omite el correo de referencia de pago.");
    return { enviado: false, motivo: "sin_api_key" };
  }
  const from = process.env.RESEND_FROM || "AI Solutions4You <pagos@ai-solutions4you.info>";

  const html = htmlCorreoReferenciaTienda({ referencia, barcodeUrl, total, descripcionItems, ordenId });

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Tu referencia de pago — pedido ${ordenId}`,
      html,
    }),
  });

  if (!resp.ok) {
    const texto = await resp.text().catch(() => "");
    throw new Error(`Resend respondió ${resp.status}: ${texto}`);
  }

  return { enviado: true };
}

module.exports = { enviarCorreoReferenciaTienda, htmlCorreoReferenciaTienda };
