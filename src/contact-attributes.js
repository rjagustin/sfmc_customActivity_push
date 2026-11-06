// Atributos de Contact Builder que ofrece el buscador. Reemplazar por los de la cuenta del cliente.
// Si un grupo o campo tiene espacios, la ruta va entre comillas:
//   Contact.Attribute."Datos Personales"."Ciudad de residencia"
const group = (name, fields) => ({
  group: `Contact Builder · ${name}`,
  source: "contact",
  items: Object.entries(fields).map(([label, field]) => ({ label, path: `Contact.Attribute.${name}.${field}` }))
});

export const CONTACT_ATTRIBUTES = [
  group("Perfil", {
    Ciudad: "Ciudad", Provincia: "Provincia", Segmento: "Segmento", Idioma: "Idioma",
    "Cumpleaños": "Cumpleanos", "Fecha de alta": "FechaAlta", Email: "Email"
  }),
  group("Compras", {
    "Última compra": "UltimaCompra", "Último producto": "UltimoProducto", "Tienda habitual": "Tienda",
    "Cantidad de compras": "Cantidad", "Ticket promedio": "TicketPromedio"
  }),
  group("Fidelidad", {
    Puntos: "Puntos", Nivel: "Nivel", "Puntos por vencer": "PuntosPorVencer", "Vencimiento de puntos": "PuntosVencen"
  })
];
