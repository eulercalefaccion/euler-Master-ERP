export const fetchDolarVenta = async () => {
  try {
    const response = await fetch('https://dolarapi.com/v1/dolares/oficial');
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    // dolares/oficial returns { compra: ..., venta: ..., ... }
    return data.venta || 0;
  } catch (error) {
    console.error("Error fetching Dolar:", error);
    return null;
  }
};
