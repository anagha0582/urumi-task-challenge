import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
const WooCommerceClient = WooCommerceRestApi.default ?? WooCommerceRestApi;

const api = new WooCommerceClient({
  url: "http://store.localhost",
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET,
  version: "wc/v3"
});

try {
  const response = await api.get("products", { per_page: 1 });
  console.log("HTTP status:", response.status);
  console.log("Products:", JSON.stringify(
    response.data.map(p => ({ id: p.id, name: p.name })),
    null,
    2
  ));
} catch (error) {
  console.log("HTTP status:", error.response?.status ?? "No HTTP response");
  console.log("Error:", JSON.stringify(
    error.response?.data ?? { message: error.message },
    null,
    2
  ));
}

