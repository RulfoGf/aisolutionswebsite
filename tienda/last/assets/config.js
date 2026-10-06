/* ============================================================
   Configuración pública de Openpay (no secreta).
   Reemplaza estos valores por los de tu cuenta en el
   Dashboard de Openpay > Llaves API.
   La llave PRIVADA nunca va aquí: solo en las variables de
   entorno del servidor (ver .env.example).
   ============================================================ */
window.OPENPAY_CONFIG = {
  MERCHANT_ID: "TU_MERCHANT_ID",
  PUBLIC_KEY: "TU_LLAVE_PUBLICA",
  SANDBOX: true, // cambia a false cuando pases a producción
};
