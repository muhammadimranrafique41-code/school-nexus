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

  // Homework Diary Namespace
  const homeworkDiaryNamespace = io.of("/homework-diary");

  homeworkDiaryNamespace.on("connection", (socket) => {
    // Students join their class diary room
    socket.on("subscribe-class", (classId: string | number) => {
      const room = `class-diary:${classId}`;
      socket.join(room);
      socket.emit("subscribed", { classId, room });
    });

    // Admin listens for publish confirmations
    socket.on("admin-subscribe", (adminId: string | number) => {
      const room = `admin:${adminId}`;
      socket.join(room);
      socket.emit("admin-subscribed", { adminId });
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

export function broadcastHomeworkDiaryPublish(classId: number, diaryData: {
  id: number;
  classId: number;
  date: string;
  entries: Array<{ subject: string; topic: string; note?: string }>;
  status: string;
}) {
  if (!ioInstance) return;
  const io = ioInstance.of("/homework-diary");
  const room = `class-diary:${classId}`;
  io.to(room).emit("diary-published", diaryData);
}

export function notifyAdminPublishComplete(adminId: string | number, diaryId: number, success: boolean) {
  if (!ioInstance) return;
  const io = ioInstance.of("/homework-diary");
  const room = `admin:${adminId}`;
  io.to(room).emit("publish-complete", { diaryId, success });
}

export function broadcastDailyDiaryPublish(classId: number, diaryData: {
  id: number;
  templateId: number;
  classId: number;
  date: string;
  content: Array<{ questionId: string; answer: string }>;
  status: string;
}) {
  if (!ioInstance) return;
  const io = ioInstance.of("/daily-diary");
  const room = `class-diary:${classId}`;
  io.to(room).emit("diary-published", diaryData);
}

export function notifyAdminDailyDiaryPublishComplete(adminId: string | number, diaryId: number, success: boolean) {
  if (!ioInstance) return;
  const io = ioInstance.of("/daily-diary");
  const room = `admin:${adminId}`;
  io.to(room).emit("publish-complete", { diaryId, success });
}

