import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("citizen"),
  language: text("language").notNull().default("English"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailIdx: uniqueIndex("users_email_idx").on(table.email),
}));

export const lawyersTable = pgTable("lawyers", {
  id: serial("id").primaryKey(),
  lawyerId: text("lawyer_id").notNull(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  email: text("email"),
  sampleRegistrationNumber: text("sample_registration_number").notNull(),
  verificationDocumentName: text("verification_document_name"),
  specialization: text("specialization").notNull(),
  location: text("location").notNull(),
  languages: text("languages").array().notNull(),
  experience: integer("experience").notNull().default(0),
  availability: text("availability").notNull().default("Available"),
  verificationStatus: text("verification_status").notNull().default("Verification Required"),
  isSample: boolean("is_sample").notNull().default(true),
});

export const casesTable = pgTable("cases", {
  id: serial("id").primaryKey(),
  caseNumber: text("case_number").notNull(),
  title: text("title").notNull(),
  citizenId: integer("citizen_id"),
  lawyerId: integer("lawyer_id"),
  court: text("court").notNull(),
  location: text("location").notNull(),
  filingDate: date("filing_date", { mode: "string" }).notNull(),
  currentStatus: text("current_status").notNull(),
  monitoringStatus: text("monitoring_status").notNull(),
});

export const hearingsTable = pgTable("hearings", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  hearingDate: date("hearing_date", { mode: "string" }).notNull(),
  time: text("time").notNull(),
  stage: text("stage").notNull(),
  result: text("result").notNull(),
  adjournmentReason: text("adjournment_reason"),
});

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  uploadedBy: integer("uploaded_by"),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  filePath: text("file_path"),
  explanation: text("explanation"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const legalQuestionsTable = pgTable("legal_questions", {
  id: serial("id").primaryKey(),
  citizenId: integer("citizen_id"),
  lawyerId: integer("lawyer_id"),
  category: text("category").notNull(),
  question: text("question").notNull(),
  attachmentName: text("attachment_name"),
  status: text("status").notNull().default("Pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const legalResponsesTable = pgTable("legal_responses", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull(),
  lawyerId: integer("lawyer_id"),
  response: text("response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const complaintsTable = pgTable("complaints", {
  id: serial("id").primaryKey(),
  citizenId: integer("citizen_id"),
  category: text("category").notNull(),
  description: text("description").notNull(),
  location: text("location").notNull(),
  attachmentName: text("attachment_name"),
  status: text("status").notNull().default("Submitted"),
  guidance: text("guidance").notNull().default("Collect relevant documents and keep records of communication."),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const awarenessArticlesTable = pgTable("awareness_articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  summary: text("summary").notNull(),
  content: text("content").notNull(),
  language: text("language").notNull().default("English"),
  published: boolean("published").notNull().default(true),
});

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export const insertLawyerSchema = createInsertSchema(lawyersTable).omit({ id: true });
export const insertCaseSchema = createInsertSchema(casesTable).omit({ id: true });
export const insertHearingSchema = createInsertSchema(hearingsTable).omit({ id: true });
export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, uploadedAt: true });
export const insertQuestionSchema = createInsertSchema(legalQuestionsTable).omit({ id: true, createdAt: true });
export const insertResponseSchema = createInsertSchema(legalResponsesTable).omit({ id: true, createdAt: true });
export const insertComplaintSchema = createInsertSchema(complaintsTable).omit({ id: true, createdAt: true });
export const insertArticleSchema = createInsertSchema(awarenessArticlesTable).omit({ id: true });
export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });

export type User = typeof usersTable.$inferSelect;
export type Lawyer = typeof lawyersTable.$inferSelect;
export type Case = typeof casesTable.$inferSelect;
export type Hearing = typeof hearingsTable.$inferSelect;
export type Document = typeof documentsTable.$inferSelect;
export type LegalQuestion = typeof legalQuestionsTable.$inferSelect;
export type LegalResponse = typeof legalResponsesTable.$inferSelect;
export type Complaint = typeof complaintsTable.$inferSelect;
export type AwarenessArticle = typeof awarenessArticlesTable.$inferSelect;
export type Notification = typeof notificationsTable.$inferSelect;

export const roleSchema = z.enum(["citizen", "lawyer", "admin"]);