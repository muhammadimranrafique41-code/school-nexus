import type { Server as HttpServer } from "http";
import { Server as IOServer } from "socket.io";

let ioInstance: IOServer | null = null;

export function attachSocketServer(httpServer: HttpServer): IOServer {
  if (ioInstance) return ioInstance;

  const io = new IOServer(httpServer, {
    path: "/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  const teacherNamespace = io.of("/teacher");

  teacherNamespace.on("connection", (socket) => {
    socket.on("join", (teacherId: string | number) => {
      const room = `teacher:${teacherId}`;
      socket.join(room);
    });
  });

  ioInstance = io;
  return io;
}

export function getSocketServer(): IOServer | null {
  return ioInstance;
}

export function notifyTeacher(teacherId: string | number, event: string, payload?: Record<string, unknown>) {
  if (!ioInstance) return;
  const room = `teacher:${teacherId}`;
  ioInstance.to(room).emit(event, payload ?? {});
}

