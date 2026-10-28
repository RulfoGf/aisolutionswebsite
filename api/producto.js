// Link para compartir un producto: /p/<id>  (rewrite en vercel.json)
//
// WhatsApp, Facebook, etc. no ejecutan JavaScript: arman la vista previa
// leyendo las etiquetas Open Graph del HTML. checkout.html tiene las mismas
// etiquetas para todos los productos, así que este endpoint genera una
// página mínima con la foto, nombre y precio del producto pedido (tomados
// de data/productos.json, siempre al día) y manda a la persona al checkout
// con ese producto ya cargado.
const fs = require("fs");
const path = require("path");

const SITIO = "https://www.ai-solutions4you.info";

const productos = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data", "productos.json"), "utf8")
);

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function precioConIva(p) {
  const total = p.ivaIncluido ? p.precio : Math.round(p.precio * 1.16 * 100) / 100;
  return total.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// /tienda/assets/img/producto-3.png -> /tienda/assets/img/og/producto-3.jpg
// (versión 1200x630 ligera, generada para vistas previas de WhatsApp)
function imagenOg(p) {
  if (p.imagenOg) return p.imagenOg;
  const base = path.posix.basename(p.imagen).replace(/\.[^.]+$/, "");
  return `/tienda/assets/img/og/${base}.jpg`;
}

module.exports = (req, res) => {
  const id = String((req.query && req.query.id) || "");
  const p = productos.find((x) => x.id === id);

  if (!p) {
    res.statusCode = 302;
    res.setHeader("Location", "/tienda/");
    return res.end();
  }

  const destino = `/tienda/checkout.html?producto=${encodeURIComponent(p.id)}`;
  const titulo = `${p.nombre} — $${precioConIva(p)} MXN`;
  const descripcion = `IVA incluido. Compra segura con Openpay: tarjeta, transferencia SPEI o pago en tienda.`;
  const img = SITIO + imagenOg(p);
  const urlPropia = `${SITIO}/p/${encodeURIComponent(p.id)}`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="AI Solutions4You">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:secure_url" content="${esc(img)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(urlPropia)}">
<meta property="product:price:amount" content="${esc(precioConIva(p).replace(/,/g, ""))}">
<meta property="product:price:currency" content="MXN">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descripcion)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="canonical" href="${esc(urlPropia)}">
<script>location.replace(${JSON.stringify(destino)});</script>
</head>
<body style="font-family:sans-serif;background:#0e1116;color:#fff;text-align:center;padding:40px">
<p>Abriendo el pago seguro de <strong>${esc(p.nombre)}</strong>…</p>
<p><a style="color:#F35BFD" href="${esc(destino)}">Continuar al pago</a></p>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
  res.statusCode = 200;
  res.end(html);
};
