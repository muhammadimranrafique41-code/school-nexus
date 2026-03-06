import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Mock authentication - In a real app, use passport/sessions
  // For demo purposes, we will return a default admin user if requested,
  // or allow the frontend to specify the role they want to test.
  
  // A simple endpoint to get the current user. Since we don't have real auth yet,
  // we'll return a stub user or 401 based on a custom header.
  app.get(api.auth.me.path, async (req, res) => {
    // For demo, just return an admin user by default if no users exist
    const users = await storage.getUsers();
    if (users.length === 0) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    // Simulate finding a logged in user (in reality, from session)
    // We'll just return the first admin
    const admin = users.find(u => u.role === 'admin') || users[0];
    res.json(admin);
  });

  app.post(api.auth.login.path, async (req, res) => {
    try {
      const input = api.auth.login.input.parse(req.body);
      const user = await storage.getUserByEmail(input.email);
      if (!user || user.password !== input.password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      res.json(user);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.auth.logout.path, (req, res) => {
    res.json({ success: true });
  });

  // Users
  app.get(api.users.list.path, async (req, res) => {
    const users = await storage.getUsers();
    res.json(users);
  });

  app.post(api.users.create.path, async (req, res) => {
    try {
      const input = api.users.create.input.parse(req.body);
      const user = await storage.createUser(input);
      res.status(201).json(user);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Attendance
  app.get(api.attendance.list.path, async (req, res) => {
    // In a real app, if student, filter by studentId
    const records = await storage.getAttendance();
    res.json(records);
  });

  app.post(api.attendance.create.path, async (req, res) => {
    try {
      const input = api.attendance.create.input.parse(req.body);
      const record = await storage.createAttendance(input);
      res.status(201).json(record);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Results
  app.get(api.results.list.path, async (req, res) => {
    const records = await storage.getResults();
    res.json(records);
  });

  app.post(api.results.create.path, async (req, res) => {
    try {
      const input = api.results.create.input.parse(req.body);
      const record = await storage.createResult(input);
      res.status(201).json(record);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Fees
  app.get(api.fees.list.path, async (req, res) => {
    const records = await storage.getFees();
    res.json(records);
  });

  app.post(api.fees.create.path, async (req, res) => {
    try {
      const input = api.fees.create.input.parse(req.body);
      const record = await storage.createFee(input);
      res.status(201).json(record);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.fees.update.path, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const input = api.fees.update.input.parse(req.body);
      const record = await storage.updateFee(id, input);
      res.json(record);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Dashboard Stats
  app.get(api.dashboard.adminStats.path, async (req, res) => {
    const students = await storage.getStudents();
    const teachers = await storage.getTeachers();
    const feesData = await storage.getFees();
    
    const feesCollected = feesData
      .filter(f => f.status === 'Paid')
      .reduce((sum, f) => sum + f.amount, 0);

    const activeClasses = new Set(students.map(s => s.className).filter(Boolean)).size;

    res.json({
      totalStudents: students.length,
      totalTeachers: teachers.length,
      feesCollected,
      activeClasses
    });
  });

  app.get(api.dashboard.studentStats.path, async (req, res) => {
    const studentId = parseInt(req.params.id);
    const attendance = await storage.getAttendanceByStudent(studentId);
    const feesData = await storage.getFeesByStudent(studentId);

    const presentDays = attendance.filter(a => a.status === 'Present').length;
    const attendanceRate = attendance.length > 0 
      ? Math.round((presentDays / attendance.length) * 100) 
      : 100;

    const unpaidFees = feesData
      .filter(f => f.status === 'Unpaid')
      .reduce((sum, f) => sum + f.amount, 0);

    res.json({
      attendanceRate,
      unpaidFees
    });
  });

  return httpServer;
}