/* ============================================================
   Carrito de compras — almacenado en localStorage del navegador.
   Compartido entre tienda/index.html y tienda/checkout.html.
   ============================================================ */
const CARRITO_KEY = "aisolutions_carrito";
const IVA_RATE = 0.16;

function leerCarrito() {
  try {
    const raw = localStorage.getItem(CARRITO_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn("No se pudo leer el carrito:", e);
    return [];
  }
}

function guardarCarrito(items) {
  localStorage.setItem(CARRITO_KEY, JSON.stringify(items));
  actualizarContadorCarrito();
}

function agregarAlCarrito(producto, cantidad = 1) {
  const items = leerCarrito();
  const existente = items.find((i) => i.id === producto.id);
  if (existente) {
    existente.cantidad += cantidad;
  } else {
    items.push({
      id: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      ivaIncluido: producto.ivaIncluido === true,
      imagen: producto.imagen,
      cantidad,
    });
  }
  guardarCarrito(items);
}

function actualizarCantidad(id, delta) {
  const items = leerCarrito();
  const item = items.find((i) => i.id === id);
  if (!item) return;
  item.cantidad += delta;
  const nuevos = item.cantidad <= 0 ? items.filter((i) => i.id !== id) : items;
  guardarCarrito(nuevos);
  renderizarCarrito();
}

function quitarDelCarrito(id) {
  const items = leerCarrito().filter((i) => i.id !== id);
  guardarCarrito(items);
  renderizarCarrito();
}

// Cada producto indica si su precio en productos.json ya incluye el IVA
// (ivaIncluido: true) o no (ivaIncluido: false / ausente). El desglose se
// calcula por línea y luego se suma, para poder mezclar en el mismo
// carrito productos con y sin IVA incluido.
function desgloseItem(item) {
  const cantidad = item.cantidad;
  if (item.ivaIncluido) {
    const total = Math.round(item.precio * cantidad * 100) / 100;
    const subtotal = Math.round((total / (1 + IVA_RATE)) * 100) / 100;
    const iva = Math.round((total - subtotal) * 100) / 100;
    return { subtotal, iva, total };
  }
  const subtotal = Math.round(item.precio * cantidad * 100) / 100;
  const iva = Math.round(subtotal * IVA_RATE * 100) / 100;
  const total = Math.round((subtotal + iva) * 100) / 100;
  return { subtotal, iva, total };
}

function subtotalCarrito() {
  return Math.round(leerCarrito().reduce((acc, i) => acc + desgloseItem(i).subtotal, 0) * 100) / 100;
}

function ivaCarrito() {
  return Math.round(leerCarrito().reduce((acc, i) => acc + desgloseItem(i).iva, 0) * 100) / 100;
}

function totalCarrito() {
  return Math.round(leerCarrito().reduce((acc, i) => acc + desgloseItem(i).total, 0) * 100) / 100;
}

function formatoMoneda(valor) {
  return valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function actualizarContadorCarrito() {
  const el = document.querySelector("[data-contador-carrito]");
  if (!el) return;
  const total = leerCarrito().reduce((acc, i) => acc + i.cantidad, 0);
  el.textContent = total;
  el.style.display = total > 0 ? "inline-flex" : "none";
}

/* ---- Panel lateral (usado en tienda/index.html) ---- */
function abrirCarrito() {
  document.querySelector(".carrito-overlay")?.classList.add("abierto");
  document.querySelector(".carrito-panel")?.classList.add("abierto");
  renderizarCarrito();
}

function cerrarCarrito() {
  document.querySelector(".carrito-overlay")?.classList.remove("abierto");
  document.querySelector(".carrito-panel")?.classList.remove("abierto");
}

function renderizarCarrito() {
  const cont = document.querySelector("[data-items-carrito]");
  if (!cont) return;
  const items = leerCarrito();

  if (items.length === 0) {
    cont.innerHTML = '<p class="vacio">Tu carrito está vacío.</p>';
  } else {
    cont.innerHTML = items
      .map(
        (i) => `
      <div class="item-carrito">
        <img src="${i.imagen}" alt="${i.nombre}">
        <div class="detalle">
          <h4>${i.nombre}</h4>
          <div>${formatoMoneda(i.precio)}</div>
          <div class="cantidad">
            <button onclick="actualizarCantidad('${i.id}', -1)">−</button>
            <span>${i.cantidad}</span>
            <button onclick="actualizarCantidad('${i.id}', 1)">+</button>
          </div>
        </div>
        <button class="quitar" onclick="quitarDelCarrito('${i.id}')">Quitar</button>
      </div>`
      )
      .join("");
  }

  const subtotalEl = document.querySelector("[data-subtotal-carrito]");
  if (subtotalEl) subtotalEl.textContent = formatoMoneda(subtotalCarrito());

  const ivaEl = document.querySelector("[data-iva-carrito]");
  if (ivaEl) ivaEl.textContent = formatoMoneda(ivaCarrito());

  const totalEl = document.querySelector("[data-total-carrito]");
  if (totalEl) totalEl.textContent = formatoMoneda(totalCarrito());

  const btnPagar = document.querySelector("[data-ir-checkout]");
  if (btnPagar) btnPagar.disabled = items.length === 0;

  actualizarContadorCarrito();
}

document.addEventListener("DOMContentLoaded", actualizarContadorCarrito);
