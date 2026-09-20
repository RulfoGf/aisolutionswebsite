/* ============================================================
   Carrito de compras — almacenado en localStorage del navegador.
   Compartido entre tienda/index.html y tienda/checkout.html.
   ============================================================ */
const CARRITO_KEY = "aisolutions_carrito";

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

function totalCarrito() {
  return leerCarrito().reduce((acc, i) => acc + i.precio * i.cantidad, 0);
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
  if (subtotalEl) subtotalEl.textContent = formatoMoneda(totalCarrito());

  const btnPagar = document.querySelector("[data-ir-checkout]");
  if (btnPagar) btnPagar.disabled = items.length === 0;

  actualizarContadorCarrito();
}

document.addEventListener("DOMContentLoaded", actualizarContadorCarrito);
