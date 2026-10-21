import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
app.use(express.json({ limit: "1mb" }));

const tickets = [
  { id: "T-1001", subject: "Order delivery delayed", status: "open" },
  { id: "T-1002", subject: "Product arrived damaged", status: "in_progress" },
  { id: "T-1003", subject: "Refund request", status: "closed" }
];

function createServer() {
  const server = new McpServer({
    name: "support-mcp",
    version: "1.0.0"
  });

  server.tool(
    "search_tickets",
    "Search demo support tickets by subject text or status.",
    {
      query: z.string().optional(),
      status: z.enum(["open", "in_progress", "closed"]).optional()
    },
    async ({ query, status }) => {
      const results = tickets.filter((ticket) =>
        (!query || ticket.subject.toLowerCase().includes(query.toLowerCase())) &&
        (!status || ticket.status === status)
      );

      return {
        content: [{ type: "text", text: JSON.stringify(results) }]
      };
    }
  );

  server.tool(
    "get_ticket",
    "Get a demo support ticket by its ID.",
    { id: z.string().min(1) },
    async ({ id }) => {
      const ticket = tickets.find(
        (entry) => entry.id.toLowerCase() === id.toLowerCase()
      );

      return {
        content: [{
          type: "text",
          text: ticket ? JSON.stringify(ticket) : `Ticket ${id} was not found.`
        }],
        isError: !ticket
      };
    }
  );

  server.tool(
    "update_ticket_status",
    "Update the status of a demo support ticket.",
    {
      id: z.string().min(1),
      status: z.enum(["open", "in_progress", "closed"])
    },
    async ({ id, status }) => {
      const ticket = tickets.find(
        (entry) => entry.id.toLowerCase() === id.toLowerCase()
      );

      if (!ticket) {
        return {
          content: [{ type: "text", text: `Ticket ${id} was not found.` }],
          isError: true
        };
      }

      ticket.status = status;

      return {
        content: [{ type: "text", text: JSON.stringify(ticket) }]
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
    console.error("Support MCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "MCP request failed" });
    }
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, "0.0.0.0", () => {
  console.log(`Support MCP listening on port ${port}`);
});
