/* ============================================================
   Configuración pública de Openpay (no secreta).
   Reemplaza estos valores por los de tu cuenta en el
   Dashboard de Openpay > Llaves API.
   La llave PRIVADA nunca va aquí: solo en las variables de
   entorno del servidor (ver .env.example).
   ============================================================ */
window.OPENPAY_CONFIG = {
  MERCHANT_ID: "mg8t5zvoe9e1yc6ldoqm",
  PUBLIC_KEY: "pk_ac7cb2caf2ed4f6d92d5d0351717adaf",
  SANDBOX: true, // cambia a false cuando pases a producción
};
