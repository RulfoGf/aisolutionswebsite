/* ============================================================
   Configuración pública de Openpay (no secreta).
   Reemplaza estos valores por los de tu cuenta en el
   Dashboard de Openpay > Llaves API.
   La llave PRIVADA nunca va aquí: solo en las variables de
   entorno del servidor (ver .env.example).
   ============================================================ */
window.OPENPAY_CONFIG = {
  MERCHANT_ID: "mg8t5zvoe9e1yc6ldoqm",
  PUBLIC_KEY: "pk_effab24ef1b344f2a34ad48e642f961c",
  SANDBOX: false, // producción desde 21/oct/2026
};
