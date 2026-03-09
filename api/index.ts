import type { IncomingMessage, ServerResponse } from "http";
import { app, initializeApp } from "../server/app.js";

const ready = initializeApp();

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  await ready;
  return app(req as any, res as any);
}