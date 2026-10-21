import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
app.use(express.json({ limit: "1mb" }));

const inventory = [
  { sku: "SKU-100", name: "Demo T-Shirt", stock: 25 },
  { sku: "SKU-200", name: "Demo Mug", stock: 12 }
];

function createServer() {
  const server = new McpServer({
    name: "inventory-mcp",
    version: "1.0.0"
  });

  // Intentionally shares the WooCommerce list_products tool name.
  // The gateway should expose it as inventory__list_products.
  server.tool(
    "list_products",
    "List demo inventory products and their available stock.",
    {},
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(inventory)
      }]
    })
  );

  server.tool(
    "get_stock",
    "Get stock quantity for a SKU.",
    { sku: z.string().min(1) },
    async ({ sku }) => {
      const item = inventory.find(
        (entry) => entry.sku.toLowerCase() === sku.toLowerCase()
      );

      return {
        content: [{
          type: "text",
          text: item ? JSON.stringify(item) : `No inventory item found for SKU ${sku}`
        }],
        isError: !item
      };
    }
  );

  server.tool(
    "adjust_stock",
    "Adjust demo inventory stock by a positive or negative quantity.",
    {
      sku: z.string().min(1),
      change: z.number().int()
    },
    async ({ sku, change }) => {
      const item = inventory.find(
        (entry) => entry.sku.toLowerCase() === sku.toLowerCase()
      );

      if (!item) {
        return {
          content: [{ type: "text", text: `No inventory item found for SKU ${sku}` }],
          isError: true
        };
      }

      if (item.stock + change < 0) {
        return {
          content: [{ type: "text", text: "Stock cannot become negative." }],
          isError: true
        };
      }

      item.stock += change;

      return {
        content: [{ type: "text", text: JSON.stringify(item) }]
      };
    }
  );

  return server;
}

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

app.post("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  res.on("close", () => {
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Inventory MCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "MCP request failed" });
    }
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, "0.0.0.0", () => {
  console.log(`Inventory MCP listening on port ${port}`);
});
