
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { wooRequest } from "./woocommerce.js";

const app = express();
app.use(express.json());

function createMcpServer() {
  const server = new McpServer({
    name: "woocommerce-mcp",
    version: "1.0.0",
  });

  // Tool 1: List products
  server.registerTool(
    "list_products",
    {
      title: "List WooCommerce products",
      description: "List products with their IDs, names, prices, and stock status.",
      inputSchema: {
        search: z.string().optional(),
        per_page: z.number().int().min(1).max(100).default(10),
      },
    },
    async ({ search, per_page }) => {
      try {
        const query = new URLSearchParams({
          per_page: String(per_page),
        });
        if (search) query.set("search", search);

        const products = await wooRequest<
          Array<{
            id: number;
            name: string;
            price: string;
            stock_status: string;
          }>
        >(`/products?${query.toString()}`);

        return {
          content: [{ type: "text", text: JSON.stringify(products, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: error instanceof Error ? error.message : "WooCommerce API error",
          }],
        };
      }
    }
  );

  // Tool 2: Create product
  server.registerTool(
    "create_product",
    {
      title: "Create WooCommerce product",
      description: "Create a simple product with a name, price, and optional description.",
      inputSchema: {
        name: z.string().min(1),
        regular_price: z.string().regex(/^\d+(\.\d{1,2})?$/),
        description: z.string().optional(),
      },
    },
    async ({ name, regular_price, description }) => {
      try {
        const product = await wooRequest<{
          id: number;
          name: string;
          price: string;
        }>("/products", {
          method: "POST",
          body: {
            name,
            regular_price,
            ...(description ? { description } : {}),
          },
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              message: "Product created successfully",
              id: product.id,
              name: product.name,
              price: product.price,
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: error instanceof Error ? error.message : "WooCommerce API error",
          }],
        };
      }
    }
  );

  // Tool 3: List orders
  server.registerTool(
    "list_orders",
    {
      title: "List WooCommerce orders",
      description: "List recent orders with their IDs, statuses, totals, currencies, and dates.",
      inputSchema: {
        per_page: z.number().int().min(1).max(100).default(10),
        status: z.string().optional(),
      },
    },
    async ({ per_page, status }) => {
      try {
        const query = new URLSearchParams({
          per_page: String(per_page),
        });
        if (status) query.set("status", status);

        const orders = await wooRequest<
          Array<{
            id: number;
            status: string;
            total: string;
            currency: string;
            date_created: string;
          }>
        >(`/orders?${query.toString()}`);

        return {
          content: [{ type: "text", text: JSON.stringify(orders, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: error instanceof Error ? error.message : "WooCommerce API error",
          }],
        };
      }
    }
  );

  // Tool 4: Get one order
  server.registerTool(
    "get_order",
    {
      title: "Get WooCommerce order",
      description: "Retrieve a specific order by its WooCommerce order ID.",
      inputSchema: {
        order_id: z.number().int().positive(),
      },
    },
    async ({ order_id }) => {
      try {
        const order = await wooRequest<{
          id: number;
          status: string;
          total: string;
          currency: string;
          date_created: string;
          customer_id: number;
          line_items: Array<{
            name: string;
            quantity: number;
            total: string;
          }>;
        }>(`/orders/${order_id}`);

        return {
          content: [{ type: "text", text: JSON.stringify(order, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: error instanceof Error ? error.message : "WooCommerce API error",
          }],
        };
      }
    }
  );

  // Tool 5: Update order status
  server.registerTool(
    "update_order_status",
    {
      title: "Update WooCommerce order status",
      description: "Change an existing order's status.",
      inputSchema: {
        order_id: z.number().int().positive(),
        status: z.enum([
          "pending",
          "processing",
          "on-hold",
          "completed",
          "cancelled",
          "refunded",
          "failed",
        ]),
      },
    },
    async ({ order_id, status }) => {
      try {
        const order = await wooRequest<{
          id: number;
          status: string;
          total: string;
        }>(`/orders/${order_id}`, {
          method: "PUT",
          body: { status },
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              message: "Order status updated successfully",
              id: order.id,
              status: order.status,
              total: order.total,
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: error instanceof Error ? error.message : "WooCommerce API error",
          }],
        };
      }
    }
  );

  return server;
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "woocommerce-mcp" });
});

app.post("/mcp", async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal MCP server error" });
    }
  }
});

const port = Number(process.env.PORT ?? 3000);

app.listen(port, "0.0.0.0", () => {
  console.log(`WooCommerce MCP server listening on port ${port}`);
});
