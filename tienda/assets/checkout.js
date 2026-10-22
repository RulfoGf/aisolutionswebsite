/* ============================================================
   Lógica de checkout: resumen de pedido + selector de método de
   pago (tarjeta vía Openpay.js, o efectivo en tienda vía Openpay
   "store") + llamada a la función serverless que crea el cargo.
   ============================================================ */
(async function () {
  // Límite que Openpay impone a los cargos "en tienda" (Paynet): no se
  // pueden crear referencias por más de este monto. Ver:
  // https://documents.openpay.mx/docs/charge-store
  const LIMITE_EFECTIVO_MXN = 29999.99;

  // --- Link "comprar ahora" (?producto=id) --------------------------
  // Usado por los botones del carrusel de respond.io: cada botón manda
  // directo a checkout.html?producto=<id>, y aquí reemplazamos el
  // carrito por ese único producto (cantidad 1) antes de renderizar el
  // resumen. Si el id no existe en productos.json, o no viene el
  // parámetro, no se toca el carrito (se usa el que ya hubiera en
  // localStorage, igual que antes).
  async function precargarProductoDesdeURL() {
    const params = new URLSearchParams(window.location.search);
    const productoId = params.get("producto");
    if (!productoId) return;

    try {
      const res = await fetch("/data/productos.json");
      const productos = await res.json();
      const producto = productos.find((p) => p.id === productoId);
      if (!producto) {
        console.warn(`Link de compra directa: no existe el producto "${productoId}".`);
        return;
      }
      guardarCarrito([
        {
          id: producto.id,
          nombre: producto.nombre,
          precio: producto.precio,
          ivaIncluido: producto.ivaIncluido === true,
          imagen: producto.imagen,
          cantidad: 1,
        },
      ]);
    } catch (e) {
      console.warn("No se pudo precargar el producto desde el link de compra directa:", e);
    }
  }

  await precargarProductoDesdeURL();

  const items = leerCarrito();

  if (items.length === 0) {
    window.location.href = "/tienda/";
    return;
  }

  // --- Resumen del pedido ---
  const contItems = document.querySelector("[data-resumen-items]");
  contItems.innerHTML = items
    .map(
      (i) => `
    <div class="resumen-item">
      <span>${i.nombre} × ${i.cantidad}</span>
      <span>${formatoMoneda(i.precio * i.cantidad)}</span>
    </div>`
    )
    .join("");
  document.querySelector("[data-resumen-subtotal]").textContent = formatoMoneda(subtotalCarrito());
  document.querySelector("[data-resumen-iva]").textContent = formatoMoneda(ivaCarrito());
  document.querySelector("[data-resumen-total]").textContent = formatoMoneda(totalCarrito());

  const form = document.getElementById("form-pago");
  const btnPagar = document.querySelector("[data-btn-pagar]");
  const cajaError = document.querySelector("[data-error]");
  const camposTarjeta = document.querySelector("[data-campos-tarjeta]");
  const avisoEfectivo = document.querySelector("[data-aviso-efectivo]");
  const avisoTransferencia = document.querySelector("[data-aviso-transferencia]");
  const candadoTarjeta = document.querySelector("[data-candado-tarjeta]");

  function mostrarError(msg) {
    cajaError.textContent = msg;
    cajaError.classList.add("visible");
  }

  function limpiarError() {
    cajaError.classList.remove("visible");
    cajaError.textContent = "";
  }

  function metodoPagoActual() {
    // El selector de método de pago vive fuera de <form id="form-pago">
    // (es un control independiente, no un campo que se tokeniza), así que
    // se busca en todo el documento, no dentro del form.
    const sel = document.querySelector('input[name="metodoPago"]:checked');
    return sel ? sel.value : "tarjeta";
  }

  function textoBotonPago() {
    const metodo = metodoPagoActual();
    if (metodo === "efectivo") return "Generar referencia de pago";
    if (metodo === "transferencia") return "Generar datos de transferencia";
    return "Pagar";
  }

  // Muestra/oculta los bloques del formulario según el método elegido.
  // Centralizado aquí porque se usa tanto en el cambio de selector como al
  // revertir una selección que no pasa la validación del límite.
  function aplicarVistaMetodo(metodo) {
    camposTarjeta.style.display = metodo === "tarjeta" ? "" : "none";
    avisoEfectivo.style.display = metodo === "efectivo" ? "" : "none";
    avisoTransferencia.style.display = metodo === "transferencia" ? "" : "none";
    candadoTarjeta.style.display = metodo === "tarjeta" ? "" : "none";
    btnPagar.textContent = textoBotonPago();
  }

  // --- Alternar entre el formulario de tarjeta y los avisos de efectivo/
  // transferencia. Esto NO depende de Openpay.js (ninguno de los otros dos
  // métodos lo necesita), así que queda cableado desde el inicio, sin
  // esperar a que termine de configurarse el SDK de tarjetas más abajo.
  document.querySelectorAll('input[name="metodoPago"]').forEach((input) => {
    input.addEventListener("change", () => {
      const metodo = metodoPagoActual();

      if (metodo === "efectivo" && totalCarrito() > LIMITE_EFECTIVO_MXN) {
        mostrarError(
          `El pago en tienda tiene un límite de ${formatoMoneda(LIMITE_EFECTIVO_MXN)} MXN por pedido (lo define Openpay). Tu pedido es de ${formatoMoneda(totalCarrito())}. Paga con tarjeta, transferencia, o reduce la cantidad de productos.`
        );
        document.querySelector('input[name="metodoPago"][value="tarjeta"]').checked = true;
        aplicarVistaMetodo("tarjeta");
        return;
      }

      limpiarError();
      aplicarVistaMetodo(metodo);
    });
  });

  function datosCliente() {
    return {
      nombre: form.querySelector('[data-openpay-card="holder_name"]').value,
      email: document.getElementById("cliente-email").value,
      telefono: document.getElementById("cliente-telefono").value,
    };
  }

  // Pago en efectivo (tienda) y transferencia (SPEI) comparten el mismo
  // flujo: no se tokeniza nada en el navegador, se le pide a create-charge
  // los datos para pagar (referencia+código de barras, o CLABE/banco) y se
  // redirige a gracias.html a mostrarlos (y Openpay también los manda por
  // correo). Solo cambia el "metodo_pago" que se envía y el mensaje de error
  // por defecto.
  async function pagarSinTokenizar(metodoPago) {
    if (metodoPago === "efectivo" && totalCarrito() > LIMITE_EFECTIVO_MXN) {
      // Defensa adicional por si el límite de arriba se brincó de alguna
      // forma (el servidor también lo valida, pero así se evita la llamada).
      mostrarError(
        `El pago en tienda tiene un límite de ${formatoMoneda(LIMITE_EFECTIVO_MXN)} MXN por pedido. Paga con tarjeta, transferencia, o reduce la cantidad de productos.`
      );
      btnPagar.disabled = false;
      btnPagar.textContent = textoBotonPago();
      return;
    }

    const cliente = datosCliente();
    if (!cliente.nombre || !cliente.email || !cliente.telefono) {
      mostrarError(
        metodoPago === "transferencia"
          ? "Completa nombre, correo y teléfono para generar los datos de tu transferencia."
          : "Completa nombre, correo y teléfono para generar tu referencia de pago."
      );
      btnPagar.disabled = false;
      btnPagar.textContent = textoBotonPago();
      return;
    }

    const pedido = {
      metodo_pago: metodoPago,
      items: leerCarrito().map((i) => ({ id: i.id, cantidad: i.cantidad })),
      cliente,
    };

    try {
      const res = await fetch("/api/openpay/create-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pedido),
      });
      const data = await res.json();

      if (!res.ok) {
        mostrarError(
          data.error ||
            (metodoPago === "transferencia"
              ? "No se pudieron generar los datos de la transferencia."
              : "No se pudo generar la referencia de pago.")
        );
        btnPagar.disabled = false;
        btnPagar.textContent = textoBotonPago();
        return;
      }

      // El pedido queda "en proceso" hasta que se registre el pago (en
      // tienda o por transferencia); no se vacía el carrito todavía
      // (gracias.html muestra la referencia/datos bancarios).
      localStorage.setItem("ultimo_cargo_id", data.charge_id);
      window.location.href = `/tienda/gracias.html?orden=${encodeURIComponent(data.charge_id)}`;
    } catch (err) {
      console.error(err);
      mostrarError("Ocurrió un error de conexión. Intenta de nuevo.");
      btnPagar.disabled = false;
      btnPagar.textContent = textoBotonPago();
    }
  }

  // --- Configuración de Openpay (solo necesaria para el pago con
  // tarjeta). Si por algo falla cargar Openpay.js (CDN caído, bloqueado,
  // etc.) no queremos que se rompa el resto de la página: el pago en
  // efectivo debe seguir funcionando igual.
  let deviceSessionId = null;
  let openpayListo = false;
  try {
    const cfg = window.OPENPAY_CONFIG;
    OpenPay.setId(cfg.MERCHANT_ID);
    OpenPay.setApiKey(cfg.PUBLIC_KEY);
    OpenPay.setSandboxMode(cfg.SANDBOX);
    // deviceData.setup() DEVUELVE el device_session_id directamente (además
    // de escribirlo en un campo oculto) — lo guardamos aquí para no
    // depender de leer el DOM más tarde, por si acaso.
    deviceSessionId = OpenPay.deviceData.setup("form-pago", "deviceIdHiddenFieldName");
    openpayListo = true;
  } catch (err) {
    console.error("No se pudo inicializar Openpay.js:", err);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    limpiarError();

    const metodo = metodoPagoActual();
    if (metodo === "efectivo" || metodo === "transferencia") {
      btnPagar.disabled = true;
      btnPagar.textContent = metodo === "transferencia" ? "Generando datos…" : "Generando referencia…";
      pagarSinTokenizar(metodo);
      return;
    }

    if (!openpayListo) {
      mostrarError("No se pudo cargar el sistema de pago seguro. Recarga la página e intenta de nuevo.");
      return;
    }

    btnPagar.disabled = true;
    btnPagar.textContent = "Procesando…";
    OpenPay.token.extractFormAndCreate(
      "form-pago",
      onTokenExito,
      onTokenError
    );
  });

  function onTokenError(respuesta) {
    const msg =
      (respuesta && respuesta.data && respuesta.data.description) ||
      "No se pudo validar la tarjeta. Revisa los datos e intenta de nuevo.";
    mostrarError(msg);
    btnPagar.disabled = false;
    btnPagar.textContent = textoBotonPago();
  }

  async function onTokenExito(respuesta) {
    const tokenId = respuesta.data.id;
    // Preferimos el valor devuelto por deviceData.setup(); si por algo
    // viniera vacío, intentamos leer el campo oculto como respaldo.
    const dsid =
      deviceSessionId ||
      (document.getElementById("deviceIdHiddenFieldName") || {}).value;

    if (!dsid) {
      mostrarError(
        "No se pudo preparar el pago de forma segura (falta información del dispositivo). Recarga la página e intenta de nuevo."
      );
      btnPagar.disabled = false;
      btnPagar.textContent = textoBotonPago();
      return;
    }

    const pedido = {
      metodo_pago: "tarjeta",
      token_id: tokenId,
      device_session_id: dsid,
      items: leerCarrito().map((i) => ({ id: i.id, cantidad: i.cantidad })),
      cliente: datosCliente(),
    };

    try {
      const res = await fetch("/api/openpay/create-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pedido),
      });
      const data = await res.json();

      if (!res.ok) {
        mostrarError(data.error || "No se pudo procesar el pago.");
        btnPagar.disabled = false;
        btnPagar.textContent = textoBotonPago();
        return;
      }

      if (data.requiere_3ds && data.redirect_url) {
        // El banco requiere verificación adicional (3D Secure).
        // Guardamos el id del cargo para poder consultarlo al regresar
        // (localStorage sobrevive la ida y vuelta al banco).
        localStorage.setItem("ultimo_cargo_id", data.charge_id);
        window.location.href = data.redirect_url;
        return;
      }

      // Pago aprobado de inmediato.
      localStorage.removeItem(CARRITO_KEY);
      window.location.href = `/tienda/gracias.html?estado=aprobado&orden=${encodeURIComponent(data.charge_id)}`;
    } catch (err) {
      console.error(err);
      mostrarError("Ocurrió un error de conexión. Intenta de nuevo.");
      btnPagar.disabled = false;
      btnPagar.textContent = textoBotonPago();
    }
  }
})();
