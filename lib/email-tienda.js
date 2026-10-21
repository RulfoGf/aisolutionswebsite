/* ============================================================
   Correos de confirmación para los métodos de pago que no se
   resuelven al instante: "pago en tienda" (efectivo/Paynet) y
   "transferencia bancaria" (SPEI). Se disparan desde
   api/openpay/create-charge.js justo después de que Openpay
   devuelve los datos para pagar, para que el cliente los tenga a
   la mano aunque cierre la página de "gracias".

   Usa la API REST de Resend directamente con fetch (sin instalar
   el paquete "resend"), para no agregar dependencias al proyecto.
   Si RESEND_API_KEY no está configurada todavía, no intenta
   enviar nada (solo deja un aviso en los logs) — así el checkout
   sigue funcionando normal mientras se termina de configurar.
   ============================================================ */

// Lista oficial de cadenas afiliadas a Paynet, confirmada directamente en
// https://www.paynet.com.mx/ (su propio localizador de tiendas) — no en el
// paquete de logos, que solo trae 17 de las 18. "City Club" no tiene logo
// en el paquete oficial, por eso no aparece en la imagen, solo en este
// texto. Se usa como texto alternativo de la imagen y como respaldo cuando
// el cliente de correo bloquea imágenes.
const TIENDAS_PARTICIPANTES = [
  "7-Eleven",
  "Walmart",
  "Walmart Express",
  "Bodega Aurrera",
  "Sam's Club",
  "Soriana",
  "Circle K",
  "Farmacias del Ahorro",
  "Farmacias Guadalajara",
  "Waldo's",
  "Extra",
  "Kiosko",
  "Más Bodega",
  "MercaDía",
  "SYS Tienda",
  "Pagaqui",
  "Eleczion",
  "City Club",
];

const LOGOS_TIENDAS_URL = "https://www.ai-solutions4you.info/tienda/assets/img/pagos/tiendas-paynet.png";
const LOCALIZADOR_TIENDAS_URL = "https://www.paynet.com.mx/";
const SPEI_LOGO_URL = "https://www.ai-solutions4you.info/tienda/assets/img/pagos/spei.png";

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

function fechaHoraActual() {
  return new Date().toLocaleString("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  });
}

// Openpay genera un recibo PDF oficial a partir del merchant id + un
// identificador — no hace falta construir uno propio. El identificador
// cambia según el método: para "tienda" (Paynet) es la referencia de
// pago, para transferencia (SPEI) es el id del cargo. Ver:
// https://documents.openpay.mx/docs/charge-store
// https://www.openpay.mx/en/docs/bank-charge.html
function urlReciboOficial(tipo, identificador) {
  const merchantId = process.env.OPENPAY_MERCHANT_ID;
  if (!merchantId || !identificador) return null;
  const dashboard =
    process.env.OPENPAY_PRODUCTION === "true"
      ? "https://dashboard.openpay.mx"
      : "https://sandbox-dashboard.openpay.mx";
  const ruta = tipo === "bank" ? "spei-pdf" : "paynet-pdf";
  return `${dashboard}/${ruta}/${encodeURIComponent(merchantId)}/${encodeURIComponent(identificador)}`;
}

// Envuelve el contenido particular de cada correo (código de barras o
// datos bancarios) en el mismo encabezado/pie, para que ambos correos se
// vean como parte del mismo sitio.
function envolverCorreo({ tituloPagina, subtitulo, cuerpoHtml }) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(tituloPagina)}</title>
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
                    <td align="right" style="font:13px Arial,Helvetica,sans-serif;color:#6b7280">${escapeHtml(subtitulo)}</td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr><td style="border-top:1px solid #e5e7eb"></td></tr>

            ${cuerpoHtml}

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

function bloqueSaludo(texto) {
  return `
    <tr>
      <td style="padding:24px 28px 0 28px">
        <div style="font:14px Arial,Helvetica,sans-serif;color:#18191b;line-height:1.5">${texto}</div>
      </td>
    </tr>`;
}

function bloqueTotal(total) {
  return `
    <tr>
      <td style="padding:24px 28px 0 28px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#14213d;border-radius:8px">
          <tr>
            <td style="padding:20px 24px">
              <div style="font:14px Arial,Helvetica,sans-serif;color:#c7d0e0">Total a pagar</div>
              <div style="font:bold 32px Arial,Helvetica,sans-serif;color:#ffffff;padding:4px 0 6px 0">${formatoMoneda(total)} <span style="font-size:14px;font-weight:normal;color:#c7d0e0">MXN</span></div>
              <div style="font:12px Arial,Helvetica,sans-serif;color:#c7d0e0">La comisión por recepción del pago, si aplica, la define cada banco/tienda.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function bloqueDetalles({ ordenId, descripcionItems }) {
  return `
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
            <td style="padding:10px 12px">${escapeHtml(fechaHoraActual())}</td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function botonRecibo(reciboUrl) {
  if (!reciboUrl) return "";
  return `
    <div style="padding-top:18px">
      <a href="${reciboUrl}" style="display:inline-block;background:#14213d;color:#ffffff;font:14px Arial,Helvetica,sans-serif;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:6px">Descargar recibo de pago (PDF oficial de Openpay)</a>
    </div>`;
}

function pieSoporte(textoExtra) {
  return `
    <div style="font:12px Arial,Helvetica,sans-serif;color:#6b7280;padding-top:10px">
      ${textoExtra}
      Para cualquier duda, escríbenos a <a href="mailto:${SOPORTE_EMAIL}" style="color:#14213d">${SOPORTE_EMAIL}</a> o al ${SOPORTE_TEL}.
    </div>`;
}

/* ------------------------- Pago en tienda (Paynet) ------------------------- */

function htmlCorreoReferenciaTienda({ referencia, barcodeUrl, total, descripcionItems, ordenId }) {
  const reciboUrl = urlReciboOficial("store", referencia);
  const tiendasAltText = `Tiendas participantes: ${TIENDAS_PARTICIPANTES.join(", ")}`;

  const cuerpoHtml = `
    ${bloqueSaludo("Hola, gracias por tu compra en AI Solutions4You. Aquí tienes los datos para completar tu pago en tienda y el seguimiento de tu pedido.")}
    ${bloqueTotal(total)}

    <!-- Código de barras -->
    <tr>
      <td style="padding:24px 28px 0 28px;text-align:center">
        <div style="font:16px Arial,Helvetica,sans-serif;font-weight:bold;color:#18191b;text-align:left;padding-bottom:8px">Tu código de pago</div>
        ${barcodeUrl ? `<img src="${barcodeUrl}" alt="Código de barras ${escapeHtml(referencia)}" style="display:block;margin:0 auto;max-width:100%;height:auto">` : ""}
        <div style="font:18px 'Courier New',monospace;letter-spacing:1px;color:#18191b;padding-top:8px">${escapeHtml(referencia)}</div>
        <div style="font:12px Arial,Helvetica,sans-serif;color:#6b7280;padding-top:6px">Si el cajero no puede escanearlo, puede teclear este número de referencia.</div>
        ${botonRecibo(reciboUrl)}
      </td>
    </tr>

    ${bloqueDetalles({ ordenId, descripcionItems })}

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
        ${pieSoporte("Tu pedido queda en proceso hasta que el pago se registre; te avisaremos por correo en cuanto se confirme.")}
      </td>
    </tr>

    <!-- Tiendas participantes -->
    <tr>
      <td style="padding:24px 28px 28px 28px">
        <div style="font:13px Arial,Helvetica,sans-serif;color:#6b7280;padding-bottom:10px">Tiendas participantes:</div>
        <img src="${LOGOS_TIENDAS_URL}" alt="${escapeHtml(tiendasAltText)}" width="544" style="display:block;width:100%;max-width:544px;height:auto;border:1px solid #e5e7eb;border-radius:6px">
        <div style="font:11px Arial,Helvetica,sans-serif;color:#9ca3af;padding-top:8px">${escapeHtml(TIENDAS_PARTICIPANTES.join(" · "))}</div>
        <div style="padding-top:12px"><a href="${LOCALIZADOR_TIENDAS_URL}" style="font:13px Arial,Helvetica,sans-serif;font-weight:bold;color:#14213d;text-decoration:none">📍 Encuentra tu tienda más cercana</a></div>
      </td>
    </tr>`;

  return envolverCorreo({
    tituloPagina: "Referencia de pago",
    subtitulo: "Pago en tienda vía Openpay",
    cuerpoHtml,
  });
}

async function enviarCorreoReferenciaTienda({ to, referencia, barcodeUrl, total, descripcionItems, ordenId }) {
  const html = htmlCorreoReferenciaTienda({ referencia, barcodeUrl, total, descripcionItems, ordenId });
  return enviarCorreo({ to, subject: `Tu referencia de pago — pedido ${ordenId}`, html });
}

/* ------------------------- Transferencia bancaria (SPEI) ------------------------- */

function htmlCorreoTransferencia({ banco, clabe, convenio, referencia, chargeId, total, descripcionItems, ordenId }) {
  const reciboUrl = urlReciboOficial("bank", chargeId);

  const filaDato = (etiqueta, valor) => (
    valor
      ? `<tr>
          <td style="padding:10px 12px;width:38%;color:#6b7280;font:13px Arial,Helvetica,sans-serif">${escapeHtml(etiqueta)}</td>
          <td style="padding:10px 12px;font:16px 'Courier New',monospace;letter-spacing:0.5px;color:#18191b">${escapeHtml(valor)}</td>
        </tr>`
      : ""
  );

  const cuerpoHtml = `
    ${bloqueSaludo("Hola, gracias por tu compra en AI Solutions4You. Aquí tienes los datos para completar tu transferencia SPEI y el seguimiento de tu pedido.")}
    ${bloqueTotal(total)}

    <!-- Datos para transferir -->
    <tr>
      <td style="padding:24px 28px 0 28px">
        <img src="${SPEI_LOGO_URL}" alt="SPEI — Sistema de Pagos Electrónicos Interbancarios" height="24" style="display:block;margin-bottom:10px">
        <div style="font:16px Arial,Helvetica,sans-serif;font-weight:bold;color:#18191b;padding-bottom:10px">Datos para tu transferencia SPEI</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;border-radius:6px">
          ${filaDato("Banco", banco)}
          ${filaDato("CLABE", clabe)}
          ${filaDato("Convenio (BBVA)", convenio)}
          ${filaDato("Referencia / concepto", referencia)}
        </table>
        ${botonRecibo(reciboUrl)}
      </td>
    </tr>

    ${bloqueDetalles({ ordenId, descripcionItems })}

    <!-- Cómo pagar -->
    <tr>
      <td style="padding:28px 28px 0 28px">
        <div style="font:16px Arial,Helvetica,sans-serif;font-weight:bold;color:#18191b;padding-bottom:10px">Cómo realizar tu transferencia</div>
        <ol style="margin:0;padding-left:18px;font:13px Arial,Helvetica,sans-serif;color:#18191b;line-height:1.6">
          <li>Si tu banco es BBVA: entra a banca en línea → "Pagar" → "De servicios", captura el número de convenio y en la referencia el monto exacto y la descripción del pago.</li>
          <li>Si tu banco es otro: registra la cuenta destino (CLABE de arriba, a nombre de AI Solutions4You) en "Transferencias a terceros", y en el campo de referencia/concepto escribe el número de referencia de este correo.</li>
          <li>Transfiere exactamente el total indicado arriba.</li>
          <li>Conserva tu comprobante de transferencia por si necesitas alguna aclaración.</li>
        </ol>
        ${pieSoporte("Tu pedido queda en proceso hasta que el banco confirme la transferencia (normalmente el mismo día hábil); te avisaremos por correo en cuanto se registre.")}
      </td>
    </tr>`;

  return envolverCorreo({
    tituloPagina: "Datos para tu transferencia",
    subtitulo: "Transferencia SPEI vía Openpay",
    cuerpoHtml,
  });
}

async function enviarCorreoTransferencia({ to, banco, clabe, convenio, referencia, chargeId, total, descripcionItems, ordenId }) {
  const html = htmlCorreoTransferencia({ banco, clabe, convenio, referencia, chargeId, total, descripcionItems, ordenId });
  return enviarCorreo({ to, subject: `Datos para tu transferencia SPEI — pedido ${ordenId}`, html });
}

/* ------------------------- Envío (Resend) ------------------------- */

async function enviarCorreo({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY no configurada: se omite el envío de correo.");
    return { enviado: false, motivo: "sin_api_key" };
  }
  const from = process.env.RESEND_FROM || "AI Solutions4You <pagos@ai-solutions4you.info>";

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  if (!resp.ok) {
    const texto = await resp.text().catch(() => "");
    throw new Error(`Resend respondió ${resp.status}: ${texto}`);
  }

  return { enviado: true };
}

module.exports = {
  enviarCorreoReferenciaTienda,
  htmlCorreoReferenciaTienda,
  enviarCorreoTransferencia,
  htmlCorreoTransferencia,
};
