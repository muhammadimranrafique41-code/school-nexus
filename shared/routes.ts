import { z } from 'zod';
import { 
  insertUserSchema, insertAttendanceSchema, insertResultSchema, insertFeeSchema, 
  users, attendance, results, fees,
  type User, type AttendanceWithStudent, type ResultWithStudent, type FeeWithStudent
} from './schema';

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  unauthorized: z.object({ message: z.string() }),
};

export const api = {
  auth: {
    login: {
      method: 'POST' as const,
      path: '/api/login' as const,
      input: z.object({ email: z.string().email(), password: z.string() }),
      responses: {
        200: z.custom<User>(),
        401: errorSchemas.unauthorized,
      }
    },
    logout: {
      method: 'POST' as const,
      path: '/api/logout' as const,
      responses: {
        200: z.object({ success: z.boolean() })
      }
    },
    me: {
      method: 'GET' as const,
      path: '/api/me' as const,
      responses: {
        200: z.custom<User>(),
        401: errorSchemas.unauthorized,
      }
    }
  },
  users: {
    list: {
      method: 'GET' as const,
      path: '/api/users' as const,
      responses: { 200: z.array(z.custom<User>()) }
    },
    create: {
      method: 'POST' as const,
      path: '/api/users' as const,
      input: insertUserSchema,
      responses: { 201: z.custom<User>(), 400: errorSchemas.validation }
    }
  },
  attendance: {
    list: {
      method: 'GET' as const,
      path: '/api/attendance' as const,
      responses: { 200: z.array(z.custom<AttendanceWithStudent>()) }
    },
    create: {
      method: 'POST' as const,
      path: '/api/attendance' as const,
      input: insertAttendanceSchema,
      responses: { 201: z.custom<typeof attendance.$inferSelect>(), 400: errorSchemas.validation }
    }
  },
  results: {
    list: {
      method: 'GET' as const,
      path: '/api/results' as const,
      responses: { 200: z.array(z.custom<ResultWithStudent>()) }
    },
    create: {
      method: 'POST' as const,
      path: '/api/results' as const,
      input: insertResultSchema,
      responses: { 201: z.custom<typeof results.$inferSelect>(), 400: errorSchemas.validation }
    }
  },
  fees: {
    list: {
      method: 'GET' as const,
      path: '/api/fees' as const,
      responses: { 200: z.array(z.custom<FeeWithStudent>()) }
    },
    create: {
      method: 'POST' as const,
      path: '/api/fees' as const,
      input: insertFeeSchema,
      responses: { 201: z.custom<typeof fees.$inferSelect>(), 400: errorSchemas.validation }
    },
    update: {
      method: 'PUT' as const,
      path: '/api/fees/:id' as const,
      input: insertFeeSchema.partial(),
      responses: { 200: z.custom<typeof fees.$inferSelect>(), 400: errorSchemas.validation }
    }
  },
  dashboard: {
    adminStats: {
      method: 'GET' as const,
      path: '/api/dashboard/admin' as const,
      responses: {
        200: z.object({
          totalStudents: z.number(),
          totalTeachers: z.number(),
          feesCollected: z.number(),
          activeClasses: z.number()
        })
      }
    },
    studentStats: {
      method: 'GET' as const,
      path: '/api/dashboard/student/:id' as const,
      responses: {
        200: z.object({
          attendanceRate: z.number(),
          unpaidFees: z.number()
        })
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
