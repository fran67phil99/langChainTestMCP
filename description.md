✦ This system has a modern, decoupled architecture with a clear separation between the frontend and backend. Here
  are the main components:


  1. Frontend: Angular Application


   * Location: langgraph-frontend/
   * Purpose: Provides the user interface for managing and interacting with the system.
   * Key Features:
       * MCP Manager: A user-friendly interface to add, edit, remove, and test servers.
       * Real-time Updates: Uses WebSockets (Socket.IO) to receive and display real-time logs and status updates
         from the backend.
       * Dynamic Configuration: Allows users to change server modes and configurations without restarting the
         system.


  2. Backend: Node.js API Server


   * Location: mcp-api-server.js and src/
   * Purpose: Acts as the central brain of the system, handling business logic, configuration, and communication
     with external services.
   * Key Features:
       * REST API: Exposes a comprehensive set of REST endpoints (e.g., /api/mcp/...) for the frontend to manage
         server configurations.
       * MCP Protocol Handling: Implements the Mauden Context Protocol (MCP) for communicating with compliant
         servers, including the proper initialize -> tools/list sequence. It also has a fallback to standard REST
         for legacy servers.
       * Multi-Server Management: Can manage and test multiple servers, both HTTP-based and STDIO-based, as defined
         in a central configuration file.
       * Real-time Logging: Uses a centralized logger (progressLogger.js) to push structured log messages to the
         frontend via Socket.IO, providing a clear, real-time view of the system's operations.


  3. Configuration Layer


   * Location: mcp_servers_standard.json
   * Purpose: A centralized JSON file that defines all the servers (both HTTP and STDIO/MCP) that the system can
     connect to.
   * - Dynamic Management: This file is read and written to by the backend API, allowing for dynamic configuration
     changes through the frontend UI or the provided CLI (mcp-config-cli.js).

  4. Communication and Protocols


   * HTTP/REST: Used for the primary API between the frontend and backend, and for communicating with legacy
     servers.
   * MCP (Mauden Context Protocol): A JSON-RPC 2.0 based protocol for modern, standardized communication with
     compliant servers. The system is designed to prioritize MCP but can fall back to REST.
   * WebSockets (Socket.IO): Provides a real-time, bidirectional communication channel between the backend and
     frontend, primarily used for the live logging feature.

  5. Agents and Orchestration (Core Logic)


   * Location: src/agents/
   * Purpose: These are specialized modules responsible for specific tasks (e.g., DataExplorerAgent, SQLSchemaAgent,
     OrchestratorAgent).
   * Workflow:
       1. An initial request is handled by the OrchestratorAgent.
       2. The orchestrator then delegates tasks to the appropriate specialized agent based on the request.
       3. Each agent performs its function, and through the progressLogger, sends real-time status updates back to
          the user.

  In summary, it's a three-tier architecture:


   * Presentation Tier: The Angular frontend.
   * Logic/Application Tier: The Node.js backend, including the API server and the various agents.
   * Data/Configuration Tier: The mcp_servers_standard.json file and the external services/servers it connects to.


  The use of real-time logging and a decoupled frontend/backend makes the system transparent, scalable, and easy
  to manage.

  mcp server: cd C:\Users\fran6\Documents\Mauden\mcpServerSQL\mauden-mcp-server ; node dist/cli.js server start --transport http --port 5009