import { useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

let diarySocket: Socket | null = null;

export function useHomeworkDiarySocket(classId?: number) {
  const subscribe = useCallback(() => {
    if (!diarySocket) {
      diarySocket = io('/homework-diary', {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });
    }

    if (classId) {
      diarySocket.emit('subscribe-class', classId);
    }

    return diarySocket;
  }, [classId]);

  const unsubscribe = useCallback(() => {
    if (diarySocket) {
      diarySocket.disconnect();
      diarySocket = null;
    }
  }, []);

  return { subscribe, unsubscribe, socket: diarySocket };
}

export function useHomeworkDiaryPublishListener(
  classId: number | null | undefined,
  onPublish: (data: any) => void,
) {
  useEffect(() => {
    if (!classId) return;

    const socket = io('/homework-diary', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socket.emit('subscribe-class', classId);

    socket.on('diary-published', (data) => {
      onPublish(data);
    });

    return () => {
      socket.disconnect();
    };
  }, [classId, onPublish]);
}

export function useAdminHomeworkDiaryListener(
  adminId: number | null | undefined,
  onPublishComplete: (data: any) => void,
) {
  useEffect(() => {
    if (!adminId) return;

    const socket = io('/homework-diary', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socket.emit('admin-subscribe', adminId);

    socket.on('publish-complete', (data) => {
      onPublishComplete(data);
    });

    return () => {
      socket.disconnect();
    };
  }, [adminId, onPublishComplete]);
}
