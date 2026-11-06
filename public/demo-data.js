// Datos de ejemplo. Solo se usan al abrir la pantalla fuera de Journey Builder.
window.DEMO = (() => {
  const E = "Event.DEAudience-PromoOtono.";
  const journey = [
    ["DeviceToken", "DeviceToken", ["dQ3f-android-lucia", "7b1c-ios-mateo", "invalid-token", "a44e-ios-ana"]],
    ["Plataforma", "Plataforma", ["Android", "iOS", "Android", "iOS"]],
    ["Nombre", "FirstName", ["Lucía", "Mateo", "", "Ana"]],
    ["Descuento", "Descuento", ["20%", "15%", "20%", "10%"]],
    ["ID de promo", "PromoId", ["OTONO20", "OTONO15", "OTONO20", "OTONO10"]],
    ["Código de cupón", "Cupon", ["LUCIA20", "MATEO15", "", "ANA10"]],
    ["Producto recomendado", "ProductoRecomendado", ["Zapatillas Trail", "Auriculares X2", "", "Cafetera Duo"]]
  ];
  const contact = {
    "Contact.Attribute.Perfil.Ciudad": ["Córdoba", "Rosario", "", "Mendoza"],
    "Contact.Attribute.Perfil.Segmento": ["Frecuente", "Nuevo", "Inactivo", "Frecuente"],
    "Contact.Attribute.Fidelidad.Puntos": ["1.250", "320", "0", "890"],
    "Contact.Attribute.Fidelidad.Nivel": ["Oro", "Inicial", "", "Plata"]
  };
  const names = ["Lucía Paz", "Mateo Ríos", "Contacto sin nombre", "Ana Soler"];
  const dataFor = (i) => ({
    ...Object.fromEntries(journey.map(([, key, values]) => [E + key, values[i]])),
    ...Object.fromEntries(Object.entries(contact).map(([path, values]) => [path, values[i]]))
  });
  return {
    schema: journey.map(([name, key]) => ({ key: E + key, name })),
    contacts: names.map((name, i) => ({ name, platform: dataFor(i)[E + "Plataforma"], data: dataFor(i) })),
    start: {
      title: `{{${E}FirstName}}, tu descuento te espera`,
      body: `Usá tu {{${E}Descuento}} OFF en {{Contact.Attribute.Perfil.Ciudad}} hasta el domingo.`,
      imgmode: "none",
      action: "DEEP_LINK",
      link: `miapp://promo/{{${E}PromoId}}`,
      fallbacks: { [E + "FirstName"]: "Hola", "Contact.Attribute.Perfil.Ciudad": "tu sucursal" }
    }
  };
})();
