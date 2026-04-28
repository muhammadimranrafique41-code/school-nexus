import { httpServer, initializeApp, log } from "./app";

initializeApp()
  .then(() => {
    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || "5000", 10);
    const host = "0.0.0.0";

    httpServer.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        log(
          `Port ${port} is already in use on ${host}. ` +
            `Stop the process bound to that port (Windows: \`netstat -ano | findstr :${port}\` then \`taskkill /PID <pid> /F\`) ` +
            `or set a different PORT in your environment before starting the dev server.`,
          "startup",
        );
      } else if (err.code === "EACCES") {
        log(`Insufficient privileges to bind to port ${port} on ${host}.`, "startup");
      } else {
        log(`Failed to start HTTP server: ${err.message}`, "startup");
      }
      process.exit(1);
    });

    httpServer.listen(
      {
        port,
        host,
      },
      () => {
        log(`serving on port ${port}`);
      },
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
