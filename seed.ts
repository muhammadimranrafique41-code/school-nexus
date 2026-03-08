import { db } from "./server/db";
import { academics, schoolSettings, schoolSettingsAuditLogs, schoolSettingsVersions, students, teachers, users } from "./shared/schema";
import { defaultSchoolSettingsData } from "./shared/settings";
import { count, eq } from "drizzle-orm";

async function seed() {
  const [{ value }] = await db.select({ value: count() }).from(users);
  let adminUserId: number | null = null;

  if (value === 0) {
    const insertedUsers = await db.insert(users).values([
      // Admin
      { name: "John Admin", email: "admin@school.edu", password: "password123", role: "admin" },

      // Teachers
      { name: "Dr. Sarah Mitchell", email: "s.mitchell@school.edu", password: "password123", role: "teacher", subject: "Mathematics" },
      { name: "Prof. Michael Chen", email: "m.chen@school.edu", password: "password123", role: "teacher", subject: "Physics" },
      { name: "Emily Rodriquez", email: "e.rodriguez@school.edu", password: "password123", role: "teacher", subject: "Literature" },
      { name: "David Thompson", email: "d.thompson@school.edu", password: "password123", role: "teacher", subject: "History" },

      // Students
      { name: "Alex Rivera", email: "a.rivera@student.edu", password: "password123", role: "student", className: "Grade 10-A" },
      { name: "Chloe Bennett", email: "c.bennett@student.edu", password: "password123", role: "student", className: "Grade 10-A" },
      { name: "Marcus Wright", email: "m.wright@student.edu", password: "password123", role: "student", className: "Grade 11-B" },
      { name: "Sophia Garcia", email: "s.garcia@student.edu", password: "password123", role: "student", className: "Grade 12-C" },
      { name: "Jordan Lee", email: "j.lee@student.edu", password: "password123", role: "student", className: "Grade 9-D" },
    ]).returning();

    adminUserId = insertedUsers.find((user) => user.role === "admin")?.id ?? null;

    const teacherUsers = insertedUsers.filter((user) => user.role === "teacher");
    const studentUsers = insertedUsers.filter((user) => user.role === "student");

    await db.insert(teachers).values(
      teacherUsers.map((user) => ({
        userId: user.id,
        subject: user.subject ?? "General",
      })),
    );

    await db.insert(students).values(
      studentUsers.map((user) => ({
        userId: user.id,
        className: user.className ?? "Unassigned",
      })),
    );

    await db.insert(academics).values([
      {
        title: "Mathematics",
        code: "MATH-101",
        description: "Core mathematics curriculum for secondary students.",
        className: "Grade 10-A",
        teacherUserId: teacherUsers.find((user) => user.subject === "Mathematics")?.id,
      },
      {
        title: "Physics",
        code: "PHYS-201",
        description: "Intermediate physics with theory and lab concepts.",
        className: "Grade 11-B",
        teacherUserId: teacherUsers.find((user) => user.subject === "Physics")?.id,
      },
      {
        title: "Literature",
        code: "LIT-110",
        description: "Reading comprehension and literary analysis program.",
        className: "Grade 12-C",
        teacherUserId: teacherUsers.find((user) => user.subject === "Literature")?.id,
      },
    ]);
    console.log("Database seeded with professional default users.");
  } else {
    console.log("Database already has users, skipping seed.");
    const [adminUser] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
    adminUserId = adminUser?.id ?? null;
  }

  const [{ value: settingsCount }] = await db.select({ value: count() }).from(schoolSettings);

  if (settingsCount === 0) {
    const timestamp = new Date().toISOString();
    const seededSettings = {
      ...defaultSchoolSettingsData,
      schoolInformation: {
        ...defaultSchoolSettingsData.schoolInformation,
        schoolName: "School Nexus Academy",
        shortName: "School Nexus",
        schoolCode: "SNX-001",
        principalName: "John Admin",
        schoolEmail: "info@schoolnexus.edu",
        schoolPhone: "+1 (555) 010-2024",
        schoolAddress: "125 Learning Avenue, Innovation District, Springfield",
        websiteUrl: "https://schoolnexus.edu",
        motto: "Inspiring excellence every day",
      },
      academicConfiguration: {
        ...defaultSchoolSettingsData.academicConfiguration,
        currentAcademicYear: "2026/2027",
        currentTerm: "Term 1",
        academicLevels: ["Grade 9", "Grade 10", "Grade 11", "Grade 12"],
        gradingScale: ["A", "B", "C", "D", "E", "F"],
        periodsPerDay: 8,
        passingScore: 50,
      },
      financialSettings: {
        ...defaultSchoolSettingsData.financialSettings,
        currencyCode: "USD",
        currencySymbol: "$",
        locale: "en-US",
        timezone: "America/New_York",
        invoicePrefix: "INV-SNX",
        receiptPrefix: "RCT-SNX",
      },
      branding: {
        ...defaultSchoolSettingsData.branding,
        headerTitle: "School Nexus Academy",
        headerSubtitle: "Professional school management workspace",
        loginWelcomeTitle: "Welcome to School Nexus",
        loginWelcomeSubtitle: "Manage academics, finance, and student success from one connected platform.",
      },
      systemPreferences: {
        ...defaultSchoolSettingsData.systemPreferences,
        enablePublicBranding: true,
        enableDocumentWatermark: true,
      },
      documentTemplates: {
        ...defaultSchoolSettingsData.documentTemplates,
        invoiceHeader: "Official school fee invoice",
        reportCardHeader: "Student academic report card",
        certificateHeader: "Official school certificate",
        footerNote: "Generated by School Nexus Academy. Contact the administration office for assistance.",
      },
      notificationSettings: {
        ...defaultSchoolSettingsData.notificationSettings,
        senderName: "School Nexus Academy",
        replyToEmail: "support@schoolnexus.edu",
      },
    };

    const [createdSettings] = await db.insert(schoolSettings).values({
      version: 1,
      data: seededSettings,
      createdAt: timestamp,
      updatedAt: timestamp,
      updatedBy: adminUserId,
    }).returning();

    await db.insert(schoolSettingsVersions).values({
      settingsId: createdSettings.id,
      version: 1,
      data: seededSettings,
      changeSummary: "Initial school settings seed",
      createdAt: timestamp,
      createdBy: adminUserId,
    });

    await db.insert(schoolSettingsAuditLogs).values({
      settingsId: createdSettings.id,
      action: "create",
      category: null,
      fieldPath: null,
      previousValue: null,
      nextValue: null,
      changeSummary: "Initial school settings seed",
      createdAt: timestamp,
      createdBy: adminUserId,
    });

    console.log("Default school settings seeded.");
  } else {
    console.log("School settings already exist, skipping settings seed.");
  }
}

seed().catch(console.error).finally(() => process.exit(0));
