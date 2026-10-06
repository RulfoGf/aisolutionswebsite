/* ============================================================
   Lógica de checkout: resumen de pedido + selector de método de
   pago (tarjeta vía Openpay.js, o efectivo en tienda vía Openpay
   "store") + llamada a la función serverless que crea el cargo.
   ============================================================ */
(function () {
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
    return metodoPagoActual() === "efectivo" ? "Generar referencia de pago" : "Pagar";
  }

  // --- Alternar entre el formulario de tarjeta y el aviso de pago en
  // efectivo. Esto NO depende de Openpay.js (el pago en efectivo tampoco
  // lo necesita), así que queda cableado desde el inicio, sin esperar a
  // que termine de configurarse el SDK de tarjetas más abajo.
  document.querySelectorAll('input[name="metodoPago"]').forEach((input) => {
    input.addEventListener("change", () => {
      const esEfectivo = metodoPagoActual() === "efectivo";
      camposTarjeta.style.display = esEfectivo ? "none" : "";
      avisoEfectivo.style.display = esEfectivo ? "" : "none";
      candadoTarjeta.style.display = esEfectivo ? "none" : "";
      btnPagar.textContent = textoBotonPago();
    });
  });

  function datosCliente() {
    return {
      nombre: form.querySelector('[data-openpay-card="holder_name"]').value,
      email: document.getElementById("cliente-email").value,
      telefono: document.getElementById("cliente-telefono").value,
    };
  }

  async function pagarEnEfectivo() {
    const cliente = datosCliente();
    if (!cliente.nombre || !cliente.email || !cliente.telefono) {
      mostrarError("Completa nombre, correo y teléfono para generar tu referencia de pago.");
      btnPagar.disabled = false;
      btnPagar.textContent = textoBotonPago();
      return;
    }

    const pedido = {
      metodo_pago: "efectivo",
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
        mostrarError(data.error || "No se pudo generar la referencia de pago.");
        btnPagar.disabled = false;
        btnPagar.textContent = textoBotonPago();
        return;
      }

      // El pedido queda "en proceso" hasta que el cliente pague en tienda;
      // no se vacía el carrito todavía (gracias.html muestra la referencia).
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

    if (metodoPagoActual() === "efectivo") {
      btnPagar.disabled = true;
      btnPagar.textContent = "Generando referencia…";
      pagarEnEfectivo();
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
