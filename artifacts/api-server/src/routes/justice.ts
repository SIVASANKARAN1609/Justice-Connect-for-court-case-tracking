import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
import Tesseract from "tesseract.js";
import { and, asc, count, desc, eq, gte, ilike, or, sql, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  awarenessArticlesTable,
  casesTable,
  caseSequencesTable,
  appointmentOrdersTable,
  complaintsTable,
  documentsTable,
  hearingsTable,
  lawyersTable,
  legalQuestionsTable,
  legalResponsesTable,
  notificationsTable,
  usersTable,
  caseMessagesTable,
} from "@workspace/db";
import { chatSessionsTable, chatMessagesTable } from "@workspace/db/schema";
import {
  AwarenessArticle,
  Case,
  Complaint,
  Document,
  Hearing,
  Lawyer,
  LegalQuestion,
  Notification,
  User,
} from "@workspace/db";
import {
  AuthResponse,
  CreateAppointmentBody,
  UpdateAppointmentStatusBody,
  CreateAwarenessBody,
  CreateAwarenessResponse,
  CreateCaseBody,
  CreateCaseResponse,
  CreateComplaintBody,
  CreateComplaintResponse,
  CreateDocumentBody,
  CreateDocumentResponse,
  CreateHearingBody,
  CreateHearingResponse,
  CreateHearingParams,
  CreateLawyerBody,
  CreateLawyerResponse,
  CreateQuestionBody,
  CreateQuestionResponse,
  DeleteAwarenessParams,
  GetAwarenessParams,
  GetAwarenessResponse,
  GetCaseParams,
  GetCaseResponse,
  GetLawyerParams,
  GetLawyerResponse,
  GetMeResponse,
  GetQuestionParams,
  GetQuestionResponse,
  GetDashboardSummaryResponse,
  ListAwarenessResponse,
  ListCasesQueryParams,
  ListCasesResponse,
  ListComplaintsResponse,
  ListDocumentsParams,
  ListDocumentsResponse,
  ListHearingsParams,
  ListHearingsResponse,
  ListLawyersQueryParams,
  ListLawyersResponse,
  ListNotificationsResponse,
  ListQuestionsResponse,
  LoginBody,
  LoginResponse,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
  RegisterBody,
  RegisterResponse,
  RespondToQuestionBody,
  RespondToQuestionParams,
  RespondToQuestionResponse,
  UpdateAwarenessBody,
  UpdateAwarenessParams,
  UpdateAwarenessResponse,
  UpdateCaseBody,
  UpdateCaseParams,
  UpdateCaseResponse,
  UpdateComplaintBody,
  UpdateComplaintParams,
  UpdateComplaintResponse,
  UpdateHearingBody,
  UpdateHearingParams,
  UpdateHearingResponse,
  UpdateLawyerBody,
  UpdateLawyerParams,
  UpdateLawyerResponse,
  UpdateUserBody,
  UpdateUserParams,
  VerifyLawyerBody,
  VerifyLawyerParams,
  VerifyLawyerResponse,
} from "@workspace/api-zod";
import { requireAuth, requireRole, createToken } from "../middlewares/auth";
import { saveDocument, getDocumentPath } from "../services/storage";
import { askJusticeConnectAI } from "../services/ai";
import { sendNotification } from "../services/notifications";
import { DocumentAssistantBody, DocumentAssistantResponse, GeneralAssistantBody, GeneralAssistantResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});
const ADMIN_LOGIN_ID = "JC-ADMIN-001";

const nowIso = (value: Date | string | null | undefined) =>
  value instanceof Date ? value.toISOString() : value ?? null;

const ageLabel = (filingDate: string) => {
  const years = Math.max(0, Math.floor((Date.now() - new Date(filingDate).getTime()) / 31_557_600_000));
  return years === 0 ? "Less than a year" : `${years} year${years === 1 ? "" : "s"}`;
};

const publicUser = (user: User, lawyerId: string | null = null) => ({
  id: user.id,
  justiceId: user.justiceId,
  name: user.name,
  email: user.email,
  role: user.role as "citizen" | "lawyer" | "admin",
  language: user.language as "English" | "Tamil",
  lawyerId,
});

async function lawyerProfileForUser(userId: number) {
  const [profile] = await db.select().from(lawyersTable).where(eq(lawyersTable.userId, userId));
  return profile;
}

async function mapCaseViews(rows: any[]) {
  if (rows.length === 0) return [];
  const caseIds = rows.map((r: any) => r.case.id);
  const today = new Date().toISOString().slice(0, 10);
  const allHearings = await db
    .select()
    .from(hearingsTable)
    .where(and(
       inArray(hearingsTable.caseId, caseIds),
       gte(hearingsTable.hearingDate, today)
    ))
    .orderBy(asc(hearingsTable.hearingDate));

  const hearingMap = new Map<number, string>();
  for (const h of allHearings) {
    if (!hearingMap.has(h.caseId)) {
      hearingMap.set(h.caseId, h.hearingDate);
    }
  }

  return rows.map((row: any) => ({
    id: row.case.id,
    caseNumber: row.case.caseNumber ?? `JC-${new Date().getFullYear()}-${String(row.case.id).padStart(6, "0")}`,
    title: row.case.title,
    category: row.case.category,
    description: row.case.description,
    requiredAction: row.case.requiredAction,
    citizenName: row.citizenName,
    lawyerName: row.lawyerName,
    court: row.case.court,
    location: row.case.location,
    filingDate: row.case.filingDate,
    currentStatus: row.case.currentStatus,
    monitoringStatus: row.case.monitoringStatus,
    caseAge: ageLabel(row.case.filingDate),
    nextHearing: hearingMap.get(row.case.id) ?? null,
  }));
}

async function caseViewSingle(row: {
  case: Case;
  citizenName: string | null;
  lawyerName: string | null;
}) {
  const views = await mapCaseViews([row]);
  return views[0];
}

function hearingView(hearing: Hearing, currentCase?: Case) {
  return {
    id: hearing.id,
    caseId: hearing.caseId,
    hearingDate: hearing.hearingDate,
    time: hearing.time,
    stage: hearing.stage,
    court: hearing.court || currentCase?.court || "Sample Court",
    location: hearing.location || currentCase?.location || "Sample location",
    result: hearing.result,
    adjournmentReason: hearing.adjournmentReason,
  };
}

function documentView(document: Document) {
  return {
    id: document.id,
    caseId: document.caseId,
    fileName: document.fileName,
    fileType: document.fileType,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    processingStatus: document.processingStatus,
    uploadedAt: nowIso(document.uploadedAt),
    explanation: document.explanation,
  };
}

function lawyerView(lawyer: Lawyer) {
  return {
    id: lawyer.id,
    lawyerId: lawyer.lawyerId,
    name: lawyer.name,
    email: lawyer.email,
    sampleRegistrationNumber: lawyer.sampleRegistrationNumber,
    verificationDocumentName: lawyer.verificationDocumentName,
    specialization: lawyer.specialization,
    location: lawyer.location,
    languages: lawyer.languages,
    experience: lawyer.experience,
    availability: lawyer.availability,
    verificationStatus: lawyer.verificationStatus,
    isSample: lawyer.isSample,
  };
}

async function caseRows() {
  return db
    .select({
      case: casesTable,
      citizenName: usersTable.name,
      lawyerName: lawyersTable.name,
    })
    .from(casesTable)
    .leftJoin(usersTable, eq(casesTable.citizenId, usersTable.id))
    .leftJoin(lawyersTable, eq(casesTable.lawyerId, lawyersTable.id));
}

async function visibleCases(userId: number, role: string) {
  const rows = await caseRows();
  if (role === "admin") return rows;
  if (role === "citizen") return rows.filter((row) => row.case.citizenId === userId);
  const profile = await lawyerProfileForUser(userId);
  return rows.filter((row) => profile && row.case.lawyerId === profile.id);
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if ((parsed.data.role as string) === "admin") {
    res.status(403).json({ error: "Cannot register as admin through public portal." });
    return;
  }
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email.toLowerCase()));
  if (existing.length > 0) {
    res.status(400).json({ error: "An account with that email already exists" });
    return;
  }
  if (parsed.data.role === "lawyer" && (!parsed.data.sampleRegistrationNumber?.trim() || !parsed.data.verificationDocumentName?.trim())) {
    res.status(400).json({ error: "Lawyer applications need a council/registration number and a verification document name" });
    return;
  }
  let justiceId = "";
  if (parsed.data.role === "citizen") {
    justiceId = `JC-C-${String(Date.now()).slice(-6)}`;
  } else if (parsed.data.role === "lawyer") {
    justiceId = `JC-L-${String(Date.now()).slice(-6)}`;
  }

  const [user] = await db.insert(usersTable).values({
    justiceId,
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    passwordHash: await bcrypt.hash(parsed.data.password, 10),
    role: parsed.data.role,
    language: parsed.data.language ?? "English",
  }).returning();

  if (parsed.data.role === "lawyer") {
    await db.insert(lawyersTable).values({
      lawyerId: justiceId,
      userId: user.id,
      name: user.name,
      email: user.email,
      sampleRegistrationNumber: parsed.data.sampleRegistrationNumber!.trim(),
      verificationDocumentName: parsed.data.verificationDocumentName?.trim() || "N/A",
      specialization: parsed.data.specialization || "General Practice",
      location: parsed.data.location || "To be added",
      languages: parsed.data.languages && parsed.data.languages.length > 0 ? parsed.data.languages : [user.language],
      experience: parsed.data.experience || 0,
      availability: parsed.data.availability || "Available",
      verificationStatus: "Verification Required",
      isSample: false,
    });
  }
  const authUser = { id: user.id, name: user.name, email: user.email, role: parsed.data.role };
  res.status(201).json(RegisterResponse.parse({ token: createToken(authUser), user: publicUser(user, parsed.data.role === "lawyer" ? justiceId : null) }));
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(401).json({ error: parsed.error.message });
    return;
  }
  const identifier = parsed.data.identifier.trim();
  const identifierMatches = [ilike(usersTable.email, identifier), eq(lawyersTable.lawyerId, identifier)];
  if (identifier.toUpperCase() === ADMIN_LOGIN_ID) {
    identifierMatches.push(eq(usersTable.role, "admin"));
  }
  const [row] = await db.select({ user: usersTable, lawyerId: lawyersTable.lawyerId })
    .from(usersTable)
    .leftJoin(lawyersTable, eq(lawyersTable.userId, usersTable.id))
    .where(or(...identifierMatches));
  if (!row) {
    res.status(404).json({ error: "Account not found. Please create an account to continue." });
    return;
  }
  if (!row.user.active || !(await bcrypt.compare(parsed.data.password, row.user.passwordHash))) {
    res.status(401).json({ error: "Incorrect email or password. Please try again." });
    return;
  }
  const role = row.user.role as "citizen" | "lawyer" | "admin";
  if (identifier.toUpperCase() !== ADMIN_LOGIN_ID && (parsed.data as any).role && role !== (parsed.data as any).role) {
    res.status(403).json({ error: "This account is registered for a different role. Please select the correct portal." });
    return;
  }
  const authUser = { id: row.user.id, name: row.user.name, email: row.user.email, role };
  res.json(LoginResponse.parse({ token: createToken(authUser), user: publicUser(row.user, row.lawyerId) }));
});

const otpStore = new Map<string, { otp: string, expires: number }>();

router.post("/auth/forgot-password/request", async (req, res): Promise<void> => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(ilike(usersTable.email, email.trim()));
  if (!user) {
    res.status(404).json({ error: "Account with that email not found" });
    return;
  }
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit OTP
  otpStore.set(user.email.toLowerCase(), { otp, expires: Date.now() + 10 * 60000 });
  console.log(`[MOCK EMAIL] To: ${user.email} -> Your password reset OTP is: ${otp}`);
  res.json({ success: true, message: "OTP sent to your email.", mockOtp: otp });
});

router.post("/auth/forgot-password/verify", async (req, res): Promise<void> => {
  const { email, otp } = req.body;
  const record = otpStore.get(email.toLowerCase());
  if (!record || record.otp !== otp || record.expires < Date.now()) {
    res.status(400).json({ error: "Invalid or expired OTP" });
    return;
  }
  res.json({ success: true, message: "OTP verified" });
});

router.post("/auth/forgot-password/reset", async (req, res): Promise<void> => {
  const { email, otp, newPassword } = req.body;
  const record = otpStore.get(email.toLowerCase());
  if (!record || record.otp !== otp || record.expires < Date.now()) {
    res.status(400).json({ error: "Invalid or expired OTP" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(ilike(usersTable.email, email.trim()));
  if (!user) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, user.id));
  otpStore.delete(user.email.toLowerCase());
  res.json({ success: true, message: "Password reset successfully" });
});

router.use(requireAuth);

router.post("/auth/change-password", async (req, res): Promise<void> => {
  const { currentPassword, newPassword } = req.body;
  const user = req.authUser!;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Current and new password are required" });
    return;
  }
  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  if (!(await bcrypt.compare(currentPassword, dbUser.passwordHash))) {
    res.status(400).json({ error: "Incorrect current password" });
    return;
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, user.id));
  res.json({ success: true, message: "Password changed successfully" });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const user = req.authUser!;
  const [record] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  const lawyer = await lawyerProfileForUser(user.id);
  if (!record) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json(GetMeResponse.parse(publicUser(record, lawyer?.lawyerId ?? null)));
});

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const user = req.authUser!;
  const cases = await visibleCases(user.id, user.role);
  const caseViews = await mapCaseViews(cases);
  const questions = user.role === "lawyer"
    ? await db.select().from(legalQuestionsTable).where(eq(legalQuestionsTable.status, "Pending"))
    : await db.select().from(legalQuestionsTable).where(eq(legalQuestionsTable.citizenId, user.id));
  const notifications = await db.select().from(notificationsTable).where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.isRead, false)));
  const complaints = user.role === "admin"
    ? await db.select().from(complaintsTable)
    : await db.select().from(complaintsTable).where(eq(complaintsTable.citizenId, user.id));
  const lawyers = await db.select().from(lawyersTable);
  const citizens = await db.select().from(usersTable).where(eq(usersTable.role, "citizen"));
  res.json(GetDashboardSummaryResponse.parse({
    role: user.role,
    activeCases: cases.length,
    upcomingHearings: caseViews.filter((item) => item.nextHearing).length,
    pendingQuestions: questions.filter((item) => item.status === "Pending").length,
    notifications: notifications.length,
    complaints: complaints.length,
    verifiedLawyers: lawyers.filter((item) => item.verificationStatus === "Verified Sample Lawyer").length,
    totalCitizens: citizens.length,
    totalLawyers: lawyers.length,
  }));
});

router.get("/users", requireRole("admin"), async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));
  const filtered = search ? users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase())) : users;
  res.json(filtered.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    language: user.language,
    active: user.active,
    createdAt: nowIso(user.createdAt),
  })));
});

router.put("/users/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  const body = UpdateUserBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid user update" });
    return;
  }
  const [user] = await db.update(usersTable).set({ active: body.data.active }).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    language: user.language,
    active: user.active,
    createdAt: nowIso(user.createdAt),
  });
});

router.get("/cases", async (req, res): Promise<void> => {
  const parsed = ListCasesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = await visibleCases(req.authUser!.id, req.authUser!.role);
  const filtered = rows.filter((row) => {
    const haystack = `${row.case.caseNumber} ${row.case.title} ${row.case.court}`.toLowerCase();
    const searchMatch = parsed.data.search ? haystack.includes(parsed.data.search.toLowerCase()) : true;
    const statusMatch = parsed.data.monitoringStatus ? row.case.monitoringStatus === parsed.data.monitoringStatus : true;
    return searchMatch && statusMatch;
  });
  res.json(ListCasesResponse.parse(await mapCaseViews(filtered)));
});

async function generateUniqueJcNumber(tx: any): Promise<string> {
  const currentYear = new Date().getFullYear();

  // Ensure case_sequences table exists in PostgreSQL
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS case_sequences (
      year integer PRIMARY KEY,
      last_number integer NOT NULL DEFAULT 0
    )
  `);

  // Find max existing number for the current year in casesTable to prevent collision with seed or existing data
  const maxExistingResult = await tx.execute(sql`
    SELECT MAX(
      NULLIF(
        regexp_replace(case_number, '^JC-' || ${currentYear} || '-([0-9]+)$', '\\1'),
        case_number
      )::integer
    ) as max_num
    FROM cases
    WHERE case_number LIKE ${'JC-' + currentYear + '-%'}
  `);

  const rawMax = maxExistingResult.rows?.[0]?.max_num;
  const startingNum = (rawMax != null && !isNaN(Number(rawMax))) ? Number(rawMax) : 0;

  // Atomic PostgreSQL upsert with row-level lock:
  // Multiple concurrent citizen submissions are serialized by Postgres row-level lock on case_sequences.
  // Each transaction receives a strictly unique, incrementing sequence number.
  const seqResult = await tx.execute(sql`
    INSERT INTO case_sequences (year, last_number)
    VALUES (${currentYear}, ${startingNum + 1})
    ON CONFLICT (year) DO UPDATE
    SET last_number = GREATEST(case_sequences.last_number, ${startingNum}) + 1
    RETURNING last_number
  `);

  const nextNumber = Number(seqResult.rows[0].last_number);
  return `JC-${currentYear}-${String(nextNumber).padStart(6, "0")}`;
}

async function allocateNextCaseNumber() {
  return db.transaction(async (tx) => generateUniqueJcNumber(tx));
}

router.post("/cases", requireRole("citizen", "admin"), async (req, res): Promise<void> => {
  const parsed = CreateCaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const actor = req.authUser!;
  // Strictly enforce citizenId: citizens cannot spoof another citizen's ID
  const citizenId = actor.role === "citizen" ? actor.id : parsed.data.citizenId ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const courtName = (parsed.data as any).court?.trim() || "Justice Connect Review Forum";
  const locationName = parsed.data.location?.trim() || "To be assigned";

  const created = await db.transaction(async (tx) => {
    // Automatically generate unique JC case number: JC-{YEAR}-{6 DIGITS}
    const caseNumber = await generateUniqueJcNumber(tx);

    const [saved] = await tx.insert(casesTable).values({
      caseNumber,
      title: parsed.data.title.trim(),
      category: parsed.data.category.trim(),
      description: parsed.data.description.trim(),
      requiredAction: "We will review your submission and contact you if more information is needed.",
      citizenId,
      lawyerId: null,
      court: courtName,
      location: locationName,
      filingDate: today,
      currentStatus: "Submitted",
      monitoringStatus: "Normal Monitoring",
    }).returning();

    if (citizenId) {
      // We do not wait for email sending in the transaction
      sendNotification(
        citizenId,
        "Case submitted",
        "case_submitted",
        `Your Justice Connect case ${caseNumber} was submitted successfully. Note: This is an internal Justice Connect reference number, not an official court case number.`,
        actor.email
      ).catch(console.error);
    }
    return saved;
  });

  const [row] = (await caseRows()).filter((item) => item.case.id === created.id);
  res.status(201).json(CreateCaseResponse.parse(await caseViewSingle(row)));
});

router.get("/cases/:id", async (req, res): Promise<void> => {
  const params = GetCaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await visibleCases(req.authUser!.id, req.authUser!.role);
  const row = rows.find((item) => item.case.id === params.data.id);
  if (!row) {
    res.status(404).json({ error: "Case not found" });
    return;
  }
  const [hearings, documents] = await Promise.all([
    db.select().from(hearingsTable).where(eq(hearingsTable.caseId, row.case.id)).orderBy(asc(hearingsTable.hearingDate)),
    db.select().from(documentsTable).where(eq(documentsTable.caseId, row.case.id)).orderBy(desc(documentsTable.uploadedAt)),
  ]);
  res.json(GetCaseResponse.parse({
    ...(await caseViewSingle(row)),
    hearings: hearings.map((hearing) => hearingView(hearing, row.case)),
    documents: documents.map(documentView),
  }));
});

router.put("/cases/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateCaseParams.safeParse(req.params);
  const parsed = UpdateCaseBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid case update" });
    return;
  }
  const [existingCase] = await db.select().from(casesTable).where(eq(casesTable.id, params.data.id));
  if (!existingCase) {
    res.status(404).json({ error: "Case not found" });
    return;
  }
  const [updated] = await db.update(casesTable).set(parsed.data).where(eq(casesTable.id, params.data.id)).returning();

  if (existingCase.currentStatus !== updated.currentStatus) {
    if (updated.citizenId) {
      await db.insert(notificationsTable).values({ userId: updated.citizenId, title: "Case Status Updated", type: "case_update", message: `Your case ${updated.caseNumber || ''} status was updated to ${updated.currentStatus}.` });
    }
    if (updated.lawyerId) {
      const [lawyer] = await db.select().from(lawyersTable).where(eq(lawyersTable.id, updated.lawyerId));
      if (lawyer && lawyer.userId) {
        await db.insert(notificationsTable).values({ userId: lawyer.userId, title: "Case Status Updated", type: "case_update", message: `Case ${updated.caseNumber || ''} status was updated to ${updated.currentStatus}.` });
      }
    }
  }
  if (!updated) {
    res.status(404).json({ error: "Case not found" });
    return;
  }
  const [row] = (await caseRows()).filter((item) => item.case.id === updated.id);
  res.json(UpdateCaseResponse.parse(await caseViewSingle(row)));
});

router.get("/cases/:id/hearings", async (req, res): Promise<void> => {
  const params = ListHearingsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await visibleCases(req.authUser!.id, req.authUser!.role);
  const currentCase = rows.find((row) => row.case.id === params.data.id)?.case;
  if (!currentCase) {
    res.status(404).json({ error: "Case not found" });
    return;
  }
  const hearings = await db.select().from(hearingsTable).where(eq(hearingsTable.caseId, params.data.id)).orderBy(asc(hearingsTable.hearingDate));
  res.json(ListHearingsResponse.parse(hearings.map((hearing) => hearingView(hearing, currentCase))));
});

router.post("/cases/:id/hearings", requireRole("admin"), async (req, res): Promise<void> => {
  const params = CreateHearingParams.safeParse(req.params);
  const parsed = CreateHearingBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid hearing" });
    return;
  }
  const rawBody = req.body as any;
  const court = rawBody.court;
  const location = rawBody.location;

  const [created] = await db.insert(hearingsTable).values({ ...parsed.data, court, location, caseId: params.data.id }).returning();
  const [currentCase] = await db.select().from(casesTable).where(eq(casesTable.id, params.data.id));

  if (currentCase) {
    if (currentCase.citizenId) {
      await db.insert(notificationsTable).values({ userId: currentCase.citizenId, title: "New Hearing Scheduled", type: "hearing_update", message: `A new hearing was scheduled for case ${currentCase.caseNumber || ''} on ${created.hearingDate}.` });
    }
    if (currentCase.lawyerId) {
      const [lawyer] = await db.select().from(lawyersTable).where(eq(lawyersTable.id, currentCase.lawyerId));
      if (lawyer && lawyer.userId) {
         await db.insert(notificationsTable).values({ userId: lawyer.userId, title: "New Hearing Scheduled", type: "hearing_update", message: `A new hearing was scheduled for case ${currentCase.caseNumber || ''} on ${created.hearingDate}.` });
      }
    }
  }

  res.status(201).json(CreateHearingResponse.parse(hearingView(created, currentCase)));
});

router.put("/hearings/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateHearingParams.safeParse(req.params);
  const parsed = UpdateHearingBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid hearing update" });
    return;
  }
  const [existingHearing] = await db.select().from(hearingsTable).where(eq(hearingsTable.id, params.data.id));
  if (!existingHearing) {
    res.status(404).json({ error: "Hearing not found" });
    return;
  }

  const [updated] = await db.update(hearingsTable).set(parsed.data).where(eq(hearingsTable.id, params.data.id)).returning();
  const [currentCase] = await db.select().from(casesTable).where(eq(casesTable.id, updated.caseId));

  if (currentCase && (existingHearing.hearingDate !== updated.hearingDate || existingHearing.stage !== updated.stage)) {
    if (currentCase.citizenId) {
      await db.insert(notificationsTable).values({ userId: currentCase.citizenId, title: "Hearing Updated", type: "hearing_update", message: `The hearing for case ${currentCase.caseNumber || ''} was updated to ${updated.hearingDate}.` });
    }
    if (currentCase.lawyerId) {
      const [lawyer] = await db.select().from(lawyersTable).where(eq(lawyersTable.id, currentCase.lawyerId));
      if (lawyer && lawyer.userId) {
         await db.insert(notificationsTable).values({ userId: lawyer.userId, title: "Hearing Updated", type: "hearing_update", message: `The hearing for case ${currentCase.caseNumber || ''} was updated to ${updated.hearingDate}.` });
      }
    }
  }
  res.json(UpdateHearingResponse.parse(hearingView(updated, currentCase)));
});

router.get("/cases/:id/documents", async (req, res): Promise<void> => {
  const params = ListDocumentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await visibleCases(req.authUser!.id, req.authUser!.role);
  if (!rows.some((row) => row.case.id === params.data.id)) {
    res.status(404).json({ error: "Case not found" });
    return;
  }
  const documents = await db.select().from(documentsTable).where(eq(documentsTable.caseId, params.data.id)).orderBy(desc(documentsTable.uploadedAt));
  res.json(ListDocumentsResponse.parse(documents.map(documentView)));
});

router.post("/cases/:id/documents/upload", requireRole("citizen"), upload.single("file"), async (req, res): Promise<void> => {
  const params = GetCaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const rows = await visibleCases(req.authUser!.id, req.authUser!.role);
  if (!rows.some((row) => row.case.id === params.data.id)) {
    res.status(404).json({ error: "Case not found" });
    return;
  }

  const storedFileName = await saveDocument(file.originalname, file.buffer);

  let extractedText: string | null = null;
  let processingStatus = "PROCESSED";

  if (file.mimetype === "application/pdf") {
    try {
      const data = await pdf(file.buffer);
      extractedText = data.text;
    } catch (e) {
      processingStatus = "FAILED";
    }
  } else if (file.mimetype.startsWith("image/")) {
    processingStatus = "PROCESSING";
    try {
      // For images, we can do OCR
      const result = await Tesseract.recognize(file.buffer, "eng");
      extractedText = result.data.text;
      processingStatus = "PROCESSED";
    } catch (e) {
      console.error("OCR Error:", e);
      processingStatus = "FAILED";
      extractedText = "OCR processing failed.";
    }
  } else {
    processingStatus = "PROCESSED";
    extractedText = "Text extraction not supported for this format.";
  }

  const [created] = await db.insert(documentsTable).values({
    caseId: params.data.id,
    uploadedBy: req.authUser!.id,
    fileName: file.originalname,
    storedFileName,
    fileType: file.mimetype.includes("pdf") ? "PDF" : "Image",
    mimeType: file.mimetype,
    fileSize: file.size,
    extractedText,
    processingStatus,
  }).returning();

  sendNotification(
    req.authUser!.id,
    "Document Processed",
    "document_processed",
    `Your document ${file.originalname} has been uploaded and processed.`,
    req.authUser!.email
  ).catch(console.error);

  res.status(201).json(documentView(created));
});

router.post("/ai/chat", requireRole("citizen", "lawyer", "admin"), async (req, res): Promise<void> => {
  const { message, caseId, documentId, inlineData } = req.body;
  let { sessionId } = req.body;

  if (typeof message !== "string" || message.trim() === "") {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const user = req.authUser!;

  try {
    // 1. Session Management
    if (!sessionId) {
      const [newSession] = await db.insert(chatSessionsTable).values({
        userId: user.id,
        title: message.substring(0, 50),
      }).returning();
      sessionId = newSession.id;
    }

    // 2. Fetch history
    const history = await db.select().from(chatMessagesTable)
      .where(eq(chatMessagesTable.sessionId, sessionId))
      .orderBy(asc(chatMessagesTable.createdAt));

    // Save user message
    await db.insert(chatMessagesTable).values({
      sessionId,
      role: "user",
      content: message,
    });

    // 3. Build Context
    const context: any = {
      userRole: user.role,
      userName: user.name,
    };

    // RBAC & Context Data
    const visibleUserCases = await visibleCases(user.id, user.role);

    if (documentId) {
      const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, documentId));
      if (!doc || !visibleUserCases.some((row) => row.case.id === doc.caseId)) {
        res.status(403).json({ error: "Unauthorized access to document" });
        return;
      }
      context.documentText = doc.extractedText;
    }

    if (caseId) {
      const caseRow = visibleUserCases.find((row) => row.case.id === caseId);
      if (!caseRow) {
        res.status(403).json({ error: "Unauthorized access to case" });
        return;
      }
      const hearings = await db.select().from(hearingsTable).where(eq(hearingsTable.caseId, caseId));
      context.caseContext = { ...caseRow.case, hearings };
    } else if (user.role === "citizen") {
      // If no specific case requested but is a citizen, attach their cases overview
      context.userCases = visibleUserCases.map((row) => row.case);
    }

    // If asking about lawyers, pass verified lawyers context
    if (message.toLowerCase().includes("lawyer")) {
      const verifiedLawyers = await db.select().from(lawyersTable).where(eq(lawyersTable.verificationStatus, "Verified Sample Lawyer"));
      context.lawyerContext = verifiedLawyers.map(l => ({ name: l.name, specialization: l.specialization, location: l.location, languages: l.languages }));
    }

    if (inlineData) {
      context.multimodalFile = inlineData;
    }

    // 4. Call AI
    const answer = await askJusticeConnectAI(message, history as any, context);

    // Save assistant message
    await db.insert(chatMessagesTable).values({
      sessionId,
      role: "assistant",
      content: answer,
    });

    res.json({
      answer,
      sessionId,
      disclaimer: "Justice Connect provides general educational information only and does not replace professional legal advice."
    });
  } catch (error: any) {
    if (error.message === "OPENAI_API_KEY_MISSING") {
      res.status(503).json({ error: "AI Assistant is not configured yet (Missing OPENAI_API_KEY)." });
    } else {
      console.error(error);
      res.status(500).json({ error: "There was an error communicating with the AI service. Please try again later." });
    }
  }
});

router.get("/lawyers", async (req, res): Promise<void> => {
  const parsed = ListLawyersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Extract token to check if user is admin
  let isAdmin = false;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      const secret = process.env.SESSION_SECRET ?? "justice-connect-academic-development-secret";
      const claims = jwt.verify(token, secret) as any;
      if (claims.role === "admin") {
        isAdmin = true;
      }
    } catch (e) {
      // ignore invalid token for this public route
    }
  }

  let query: any = db.select().from(lawyersTable);
  if (!isAdmin) {
    query = query.where(eq(lawyersTable.verificationStatus, "Verified Sample Lawyer"));
  }
  const lawyers = await query.orderBy(asc(lawyersTable.name));
  console.log(`[DEBUG] GET /lawyers - Found ${lawyers.length} lawyers from DB for isAdmin=${isAdmin}`);
  const filtered = lawyers.filter((lawyer: any) => {
    const locationMatch = parsed.data.location ? lawyer.location.toLowerCase().includes(parsed.data.location.toLowerCase()) : true;
    const languageMatch = parsed.data.language ? (lawyer.languages as string[]).some((item: string) => item.toLowerCase() === parsed.data.language?.toLowerCase()) : true;
    const specializationMatch = parsed.data.specialization ? lawyer.specialization.toLowerCase().includes(parsed.data.specialization.toLowerCase()) : true;
    const availabilityMatch = parsed.data.availability ? lawyer.availability === parsed.data.availability : true;
    return locationMatch && languageMatch && specializationMatch && availabilityMatch;
  });
  res.json(ListLawyersResponse.parse(filtered.map(lawyerView)));
});

router.post("/lawyers", requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateLawyerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [{ value: maxId }] = await db.select({ value: count() }).from(lawyersTable);
  const nextNumber = 1001 + Number(maxId);
  const [created] = await db.insert(lawyersTable).values({
    ...parsed.data,
    lawyerId: `JC-LAW-${nextNumber}`,
    sampleRegistrationNumber: parsed.data.sampleRegistrationNumber || `SAMPLE-REG-${nextNumber}`,
    verificationDocumentName: parsed.data.verificationDocumentName || "admin-added-fictional-document.pdf",
    languages: parsed.data.languages,
    verificationStatus: "Verification Required",
    isSample: true,
  }).returning();
  res.status(201).json(CreateLawyerResponse.parse(lawyerView(created)));
});

router.get("/lawyers/:id", async (req, res): Promise<void> => {
  const params = GetLawyerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [lawyer] = await db.select().from(lawyersTable).where(eq(lawyersTable.id, params.data.id));
  if (!lawyer) {
    res.status(404).json({ error: "Lawyer not found" });
    return;
  }
  if (req.authUser!.role !== "admin" && !lawyer.verificationStatus.startsWith("Verified")) {
    const myProfile = await lawyerProfileForUser(req.authUser!.id);
    if (!myProfile || myProfile.id !== lawyer.id) {
      res.status(403).json({ error: "Access denied. Lawyer is not verified." });
      return;
    }
  }
  res.json(GetLawyerResponse.parse(lawyerView(lawyer)));
});

router.put("/lawyers/:id", requireRole("admin", "lawyer"), async (req, res): Promise<void> => {
  const params = UpdateLawyerParams.safeParse(req.params);
  const parsed = UpdateLawyerBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid lawyer update" });
    return;
  }
  if (req.authUser!.role === "lawyer") {
    const profile = await lawyerProfileForUser(req.authUser!.id);
    if (!profile || profile.id !== params.data.id) {
      res.status(403).json({ error: "You can only update your own profile" });
      return;
    }
  }
  const [updated] = await db.update(lawyersTable).set(parsed.data).where(eq(lawyersTable.id, params.data.id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Lawyer not found" });
    return;
  }
  res.json(UpdateLawyerResponse.parse(lawyerView(updated)));
});

router.post("/lawyers/:id/verify", requireRole("admin"), async (req, res): Promise<void> => {
  const params = VerifyLawyerParams.safeParse(req.params);
  const parsed = VerifyLawyerBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid verification request" });
    return;
  }
  const [lawyer] = await db.select().from(lawyersTable).where(eq(lawyersTable.id, params.data.id));
  if (!lawyer) {
    res.status(404).json({ error: "Lawyer not found" });
    return;
  }
  const rejected = parsed.data.decision === "reject";
  const verified = !rejected && lawyer.sampleRegistrationNumber.trim().toLowerCase() === parsed.data.sampleRegistrationNumber.trim().toLowerCase();
  const [updated] = await db.update(lawyersTable).set({ verificationStatus: rejected ? "Rejected" : verified ? "Verified Sample Lawyer" : "Verification Required" }).where(eq(lawyersTable.id, lawyer.id)).returning();
  res.json(VerifyLawyerResponse.parse({
    verified,
    message: rejected ? "APPLICATION REJECTED" : verified ? "VERIFIED SAMPLE LAWYER" : "Verification Required",
    lawyer: lawyerView(updated),
  }));
});

async function questionView(question: LegalQuestion) {
  const [citizen, lawyer, response] = await Promise.all([
    question.citizenId ? db.select().from(usersTable).where(eq(usersTable.id, question.citizenId)) : Promise.resolve([]),
    question.lawyerId ? db.select().from(lawyersTable).where(eq(lawyersTable.id, question.lawyerId)) : Promise.resolve([]),
    db.select().from(legalResponsesTable).where(eq(legalResponsesTable.questionId, question.id)).orderBy(desc(legalResponsesTable.createdAt)).limit(1),
  ]);
  return {
    id: question.id,
    citizenName: citizen[0]?.name ?? null,
    lawyerName: lawyer[0]?.name ?? null,
    category: question.category,
    question: question.question,
    attachmentName: question.attachmentName,
    status: question.status,
    response: response[0]?.response ?? null,
    createdAt: nowIso(question.createdAt),
  };
}

router.get("/questions", async (req, res): Promise<void> => {
  const user = req.authUser!;
  const rows = user.role === "citizen"
    ? await db.select().from(legalQuestionsTable).where(eq(legalQuestionsTable.citizenId, user.id)).orderBy(desc(legalQuestionsTable.createdAt))
    : await db.select().from(legalQuestionsTable).orderBy(desc(legalQuestionsTable.createdAt));
  res.json(ListQuestionsResponse.parse(await Promise.all(rows.map(questionView))));
});

router.post("/questions", requireRole("citizen"), async (req, res): Promise<void> => {
  const parsed = CreateQuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db.insert(legalQuestionsTable).values({ ...parsed.data, citizenId: req.authUser!.id }).returning();
  const view = await questionView(created);
  res.status(201).json(CreateQuestionResponse.parse(view));
});

router.get("/questions/:id", async (req, res): Promise<void> => {
  const params = GetQuestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [question] = await db.select().from(legalQuestionsTable).where(eq(legalQuestionsTable.id, params.data.id));
  if (!question || (req.authUser!.role === "citizen" && question.citizenId !== req.authUser!.id)) {
    res.status(404).json({ error: "Question not found" });
    return;
  }
  res.json(GetQuestionResponse.parse(await questionView(question)));
});

router.post("/questions/:id/respond", requireRole("lawyer"), async (req, res): Promise<void> => {
  const params = RespondToQuestionParams.safeParse(req.params);
  const parsed = RespondToQuestionBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid response" });
    return;
  }
  const profile = await lawyerProfileForUser(req.authUser!.id);
  const [question] = await db.select().from(legalQuestionsTable).where(eq(legalQuestionsTable.id, params.data.id));
  if (!profile || !question) {
    res.status(404).json({ error: "Question not found" });
    return;
  }
  await db.insert(legalResponsesTable).values({ questionId: question.id, lawyerId: profile.id, response: parsed.data.response });
  const [updated] = await db.update(legalQuestionsTable).set({ status: "Answered", lawyerId: profile.id }).where(eq(legalQuestionsTable.id, question.id)).returning();
  res.json(RespondToQuestionResponse.parse(await questionView(updated)));
});

router.get("/complaints", async (req, res): Promise<void> => {
  const rows = req.authUser!.role === "admin"
    ? await db.select().from(complaintsTable).orderBy(desc(complaintsTable.createdAt))
    : await db.select().from(complaintsTable).where(eq(complaintsTable.citizenId, req.authUser!.id)).orderBy(desc(complaintsTable.createdAt));
  res.json(ListComplaintsResponse.parse(rows.map((complaint: Complaint) => ({
    id: complaint.id,
    category: complaint.category,
    description: complaint.description,
    location: complaint.location,
    status: complaint.status,
    guidance: complaint.guidance,
    createdAt: nowIso(complaint.createdAt),
  }))));
});

router.post("/complaints", requireRole("citizen"), async (req, res): Promise<void> => {
  const parsed = CreateComplaintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db.insert(complaintsTable).values({ ...parsed.data, citizenId: req.authUser!.id }).returning();
  res.status(201).json(CreateComplaintResponse.parse({
    id: created.id,
    category: created.category,
    description: created.description,
    location: created.location,
    status: created.status,
    guidance: created.guidance,
    createdAt: nowIso(created.createdAt),
  }));
});

router.put("/complaints/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateComplaintParams.safeParse(req.params);
  const parsed = UpdateComplaintBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid complaint update" });
    return;
  }
  const [updated] = await db.update(complaintsTable).set(parsed.data).where(eq(complaintsTable.id, params.data.id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Complaint not found" });
    return;
  }
  res.json(UpdateComplaintResponse.parse({
    id: updated.id,
    category: updated.category,
    description: updated.description,
    location: updated.location,
    status: updated.status,
    guidance: updated.guidance,
    createdAt: nowIso(updated.createdAt),
  }));
});

router.get("/awareness", async (req, res): Promise<void> => {
  const rows = req.authUser!.role === "admin"
    ? await db.select().from(awarenessArticlesTable).orderBy(asc(awarenessArticlesTable.id))
    : await db.select().from(awarenessArticlesTable).where(eq(awarenessArticlesTable.published, true)).orderBy(asc(awarenessArticlesTable.id));
  res.json(ListAwarenessResponse.parse(rows));
});

router.post("/awareness", requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateAwarenessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db.insert(awarenessArticlesTable).values(parsed.data).returning();
  res.status(201).json(CreateAwarenessResponse.parse(created));
});

router.get("/awareness/:id", async (req, res): Promise<void> => {
  const params = GetAwarenessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [article] = await db.select().from(awarenessArticlesTable).where(eq(awarenessArticlesTable.id, params.data.id));
  if (!article) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  res.json(GetAwarenessResponse.parse(article));
});

router.put("/awareness/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateAwarenessParams.safeParse(req.params);
  const parsed = UpdateAwarenessBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid article update" });
    return;
  }
  const [updated] = await db.update(awarenessArticlesTable).set(parsed.data).where(eq(awarenessArticlesTable.id, params.data.id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  res.json(UpdateAwarenessResponse.parse(updated));
});

router.delete("/awareness/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const params = DeleteAwarenessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(awarenessArticlesTable).where(eq(awarenessArticlesTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/notifications", async (req, res): Promise<void> => {
  const rows = await db.select().from(notificationsTable).where(eq(notificationsTable.userId, req.authUser!.id)).orderBy(desc(notificationsTable.createdAt));
  res.json(ListNotificationsResponse.parse(rows.map((notification: Notification) => ({
    id: notification.id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    isRead: notification.isRead,
    createdAt: nowIso(notification.createdAt),
  }))));
});

router.put("/notifications/:id/read", async (req, res): Promise<void> => {
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [updated] = await db.update(notificationsTable).set({ isRead: true }).where(and(eq(notificationsTable.id, params.data.id), eq(notificationsTable.userId, req.authUser!.id))).returning();
  if (!updated) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json(MarkNotificationReadResponse.parse({
    id: updated.id,
    title: updated.title,
    message: updated.message,
    type: updated.type,
    isRead: updated.isRead,
    createdAt: nowIso(updated.createdAt),
  }));
});

// --- Appointments ---
router.get("/appointments", requireRole("citizen", "lawyer"), async (req, res): Promise<void> => {
  const user = req.authUser!;
  let condition;
  if (user.role === "citizen") {
    condition = eq(appointmentOrdersTable.citizenId, user.id);
  } else if (user.role === "lawyer") {
    const profile = await lawyerProfileForUser(user.id);
    if (!profile) {
      res.json([]);
      return;
    }
    condition = eq(appointmentOrdersTable.lawyerId, profile.id);
  } else {
    res.status(403).json({ error: "Unauthorized role" });
    return;
  }

  const orders = await db
    .select({
      id: appointmentOrdersTable.id,
      citizenId: appointmentOrdersTable.citizenId,
      lawyerId: appointmentOrdersTable.lawyerId,
      caseId: appointmentOrdersTable.caseId,
      caseNumber: casesTable.caseNumber,
      caseType: appointmentOrdersTable.caseType,
      subject: appointmentOrdersTable.subject,
      description: appointmentOrdersTable.description,
      status: appointmentOrdersTable.status,
      scheduledDate: appointmentOrdersTable.scheduledDate,
      scheduledTime: appointmentOrdersTable.scheduledTime,
      scheduledPlace: appointmentOrdersTable.scheduledPlace,
      createdAt: appointmentOrdersTable.createdAt
    })
    .from(appointmentOrdersTable)
    .leftJoin(casesTable, eq(appointmentOrdersTable.caseId, casesTable.id))
    .where(condition)
    .orderBy(desc(appointmentOrdersTable.createdAt));
  res.json(orders);
});

router.post("/appointments", requireRole("citizen"), async (req, res): Promise<void> => {
  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = req.authUser!;

  const [order] = await db.insert(appointmentOrdersTable).values({
    citizenId: user.id,
    lawyerId: parsed.data.lawyerId,
    caseId: parsed.data.caseId,
    caseType: parsed.data.caseType,
    subject: parsed.data.subject,
    description: parsed.data.description,
    status: "PENDING"
  }).returning();

  res.status(201).json(order);
});

router.post("/appointments/:id/status", requireRole("lawyer"), async (req, res): Promise<void> => {
  const parsed = UpdateAppointmentStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const id = Number(req.params["id"]);
  if (Number.isNaN(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID format" });
    return;
  }

  const user = req.authUser!;
  const [order] = await db.select().from(appointmentOrdersTable).where(eq(appointmentOrdersTable.id, id));

  const profile = await lawyerProfileForUser(user.id);
  if (!order || !profile || order.lawyerId !== profile.id) {
    res.status(404).json({ error: "Appointment order not found or not assigned to you" });
    return;
  }

  if (order.status === parsed.data.status) {
    res.json(order);
    return;
  }

  const [updatedOrder] = await db.update(appointmentOrdersTable)
    .set({
      status: parsed.data.status,
      scheduledDate: parsed.data.scheduledDate ?? null,
      scheduledTime: parsed.data.scheduledTime ?? null,
      scheduledPlace: parsed.data.scheduledPlace ?? null
    })
    .where(eq(appointmentOrdersTable.id, id))
    .returning();

  const [lawyer] = await db.select().from(lawyersTable).where(eq(lawyersTable.userId, user.id));

  if (parsed.data.status === "ACCEPTED") {
    if (order.caseId) {
      // Assign lawyer to existing case instead of creating duplicate
      await db.update(casesTable)
        .set({ lawyerId: lawyer?.id ?? null })
        .where(eq(casesTable.id, order.caseId));
    } else {
      // Generate new case
      const caseNumber = await allocateNextCaseNumber();
      await db.insert(casesTable).values({
        caseNumber,
        title: order.subject,
        category: order.caseType,
        description: order.description,
        citizenId: order.citizenId,
        lawyerId: lawyer?.id ?? null,
        court: "Unassigned",
        location: lawyer?.location || "Unknown",
        filingDate: new Date().toISOString().split("T")[0],
        currentStatus: "Under Review",
        monitoringStatus: "Normal Monitoring"
      });
    }
    await db.insert(notificationsTable).values({
      userId: order.citizenId,
      title: "Request Accepted",
      type: "appointment_update",
      message: `Your legal help request has been ACCEPTED by ${lawyer?.name || 'the lawyer'}.`,
    });
  } else if (parsed.data.status === "REJECTED") {
    if (order.caseId && lawyer) {
      const [relatedCase] = await db.select().from(casesTable).where(eq(casesTable.id, order.caseId));
      if (relatedCase && relatedCase.lawyerId === lawyer.id) {
        await db.update(casesTable).set({ lawyerId: null }).where(eq(casesTable.id, order.caseId));
      }
    }
    await db.insert(notificationsTable).values({
      userId: order.citizenId,
      title: "Request Rejected",
      type: "appointment_update",
      message: `Your legal help request was REJECTED by ${lawyer?.name || 'the lawyer'}.`,
    });
  }

  res.json(updatedOrder);
});

router.put("/lawyers/:id", requireRole("lawyer", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (Number.isNaN(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID format" });
    return;
  }
  const body = req.body as any;
  const updateData = {
    specialization: body.specialization,
    location: body.location,
    languages: body.languages,
    availability: body.availability,
  };

  const [updated] = await db.update(lawyersTable)
    .set(updateData)
    .where(eq(lawyersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Lawyer not found" });
    return;
  }
  res.json(updated);
});

// --- Case Messages ---
router.get("/cases/:id/messages", requireRole("citizen", "lawyer"), async (req, res): Promise<void> => {
  const caseId = Number(req.params["id"]);
  if (Number.isNaN(caseId) || caseId <= 0) {
    res.status(400).json({ error: "Invalid ID format" });
    return;
  }
  const user = req.authUser!;
  const [caseItem] = await db.select().from(casesTable).where(eq(casesTable.id, caseId));
  if (!caseItem) {
    res.status(404).json({ error: "Case not found" });
    return;
  }

  if (user.role === "citizen" && caseItem.citizenId !== user.id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (user.role === "lawyer") {
    const [lawyer] = await db.select().from(lawyersTable).where(eq(lawyersTable.userId, user.id));
    if (!lawyer || caseItem.lawyerId !== lawyer.id) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
  }

  const messages = await db
    .select({
      id: caseMessagesTable.id,
      caseId: caseMessagesTable.caseId,
      senderId: caseMessagesTable.senderId,
      senderName: usersTable.name,
      content: caseMessagesTable.content,
      createdAt: caseMessagesTable.createdAt
    })
    .from(caseMessagesTable)
    .innerJoin(usersTable, eq(caseMessagesTable.senderId, usersTable.id))
    .where(eq(caseMessagesTable.caseId, caseId))
    .orderBy(asc(caseMessagesTable.createdAt));

  // Format dates for response
  const formatted = messages.map(m => ({
    ...m,
    createdAt: nowIso(m.createdAt)
  }));

  res.json(formatted);
});

router.post("/cases/:id/messages", requireRole("citizen", "lawyer"), async (req, res): Promise<void> => {
  const caseId = Number(req.params["id"]);
  if (Number.isNaN(caseId) || caseId <= 0) {
    res.status(400).json({ error: "Invalid ID format" });
    return;
  }

  const content = req.body?.content;
  if (!content || typeof content !== "string") {
    res.status(400).json({ error: "Content is required" });
    return;
  }

  const user = req.authUser!;
  const [caseItem] = await db.select().from(casesTable).where(eq(casesTable.id, caseId));
  if (!caseItem) {
    res.status(404).json({ error: "Case not found" });
    return;
  }

  if (user.role === "citizen" && caseItem.citizenId !== user.id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (user.role === "lawyer") {
    const [lawyer] = await db.select().from(lawyersTable).where(eq(lawyersTable.userId, user.id));
    if (!lawyer || caseItem.lawyerId !== lawyer.id) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
  }

  const [created] = await db.insert(caseMessagesTable).values({
    caseId,
    senderId: user.id,
    content
  }).returning();

  res.status(201).json({
    ...created,
    senderName: user.name,
    createdAt: nowIso(created.createdAt)
  });
});

export default router;