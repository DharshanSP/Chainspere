import { SignalingServer } from "./transports/websocket";

const port = Number(process.env.SIGNALING_PORT ?? 8081);

const server = new SignalingServer({ port, log: (m) => console.log(m) });

server.start().catch((e) => {
  console.error("[signaling] failed to start:", e);
  process.exit(1);
});

const shutdown = () => {
  void server.stop().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
