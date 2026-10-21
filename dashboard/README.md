# Urumi Gateway Dashboard

A React control plane for authenticating to the Urumi MCP Gateway, inspecting upstream servers, managing gateway users and API keys, and reviewing recent audit activity.

## Stack

- React 19 and TypeScript
- Vite
- Lucide React
- CSS; no UI framework or additional runtime dependencies

## Prerequisites

- Node.js 20.19+ or 22.12+
- npm
- A running Urumi Gateway

## Run locally

From PowerShell, install the dashboard dependencies once:

```powershell
Set-Location 'C:\Users\anagh\Desktop\urumi task\urumi-mcp\dashboard'
npm install
```

If the gateway is not already forwarded to localhost port 8081, open a separate terminal and run the existing Kubernetes service port-forward from the repository root. Replace `<release-name>` and `<namespace>` with the Helm release and namespace in your cluster:

```powershell
kubectl port-forward service/<release-name>-gateway 8081:8080 -n <namespace>
```

Then start the dashboard:

```powershell
Set-Location 'C:\Users\anagh\Desktop\urumi task\urumi-mcp\dashboard'
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`) and sign in with an existing gateway API key. The Vite development server proxies relative `/api` requests to `http://localhost:8081`; the frontend does not need CORS changes or a hardcoded API origin.

## Authentication and access

The dashboard validates the entered key against `GET /api/me` using the gateway's `Authorization: Bearer <key>` header. On success, it stores the API key in `sessionStorage` for this browser tab and verifies it again when the page is reloaded. Sign out removes the saved key. The user and role come from the gateway response; the backend remains authoritative for authorization.

Administrators can access Overview, MCP Servers, Users & API Keys, Audit Logs, and their own API Keys. Members see Overview and My API Keys only. A newly generated key is displayed in memory once, with a copy action; it is never stored in browser storage.

## Available pages

- **Overview:** Server health, tool cache counts, user count, and recent audit events for administrators. Members get an account-scoped overview without admin API calls.
- **MCP Servers (admin):** List, register, edit, enable/disable, and delete upstream servers. The credential itself is never returned or displayed.
- **Users & API Keys (admin):** Create users and keys, inspect key metadata, and revoke keys.
- **My API Keys:** List, create, copy, and revoke the authenticated user's keys.
- **Audit Logs (admin):** Search the most recent audit events returned by the gateway.

## Checks and production output

```powershell
npm run build
npm run lint
```

The production frontend bundle is emitted under `dashboard/dist`. This dashboard-only implementation does not add a Docker/Nginx image or modify Helm/Kubernetes manifests. To deploy it, host the built SPA with an SPA fallback and proxy `/api/` to the existing gateway service, preserving the `Authorization` header. Connecting a dashboard container to a specific in-cluster gateway service requires the release name and namespace and corresponding deployment configuration outside this dashboard directory.

## Backend contract limitations

- `GET /api/servers` includes cached tool names and descriptions, but the gateway API has no tool refresh operation and does not include tool input schemas in the dashboard response. An empty tool list can therefore mean no current cached information.
- Server, user, and audit administration endpoints are admin-only. The dashboard does not call them for members.
- The audit endpoint returns up to 200 recent events and provides no server-side search or pagination; the search field filters only those returned events.
