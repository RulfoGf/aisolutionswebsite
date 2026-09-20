/* ============================================================
   Lógica de checkout: resumen de pedido + tokenización con
   Openpay.js + llamada a la función serverless que crea el cargo.
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
  document.querySelector("[data-resumen-total]").textContent = formatoMoneda(totalCarrito());

  // --- Configuración de Openpay ---
  const cfg = window.OPENPAY_CONFIG;
  OpenPay.setId(cfg.MERCHANT_ID);
  OpenPay.setApiKey(cfg.PUBLIC_KEY);
  OpenPay.setSandboxMode(cfg.SANDBOX);
  // deviceData.setup() DEVUELVE el device_session_id directamente (además
  // de escribirlo en un campo oculto) — lo guardamos aquí para no depender
  // de leer el DOM más tarde, por si acaso.
  const deviceSessionId = OpenPay.deviceData.setup("form-pago", "deviceIdHiddenFieldName");

  const form = document.getElementById("form-pago");
  const btnPagar = document.querySelector("[data-btn-pagar]");
  const cajaError = document.querySelector("[data-error]");

  function mostrarError(msg) {
    cajaError.textContent = msg;
    cajaError.classList.add("visible");
  }

  function limpiarError() {
    cajaError.classList.remove("visible");
    cajaError.textContent = "";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    limpiarError();
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
    btnPagar.textContent = "Pagar";
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
      btnPagar.textContent = "Pagar";
      return;
    }

    const pedido = {
      token_id: tokenId,
      device_session_id: dsid,
      items: leerCarrito().map((i) => ({ id: i.id, cantidad: i.cantidad })),
      cliente: {
        nombre: form.querySelector('[data-openpay-card="holder_name"]').value,
        email: document.getElementById("cliente-email").value,
        telefono: document.getElementById("cliente-telefono").value,
      },
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
        btnPagar.textContent = "Pagar";
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
      btnPagar.textContent = "Pagar";
    }
  }
})();
