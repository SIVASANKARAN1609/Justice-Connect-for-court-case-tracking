import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { and, asc, count, desc, eq, gte, ilike, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  awarenessArticlesTable,
  casesTable,
  complaintsTable,
  documentsTable,
  hearingsTable,
  lawyersTable,
  legalQuestionsTable,
  legalResponsesTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";
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

const router: IRouter = Router();
const ADMIN_LOGIN_ID = "JC-ADMIN-001";

const nowIso = (value: Date | string | null | undefined) =>
  value instanceof Date ? value.toISOString() : value ?? null;

const ageLabel = (filingDate: string) => {
  const years = Math.max(0, Math.floor((Date.now() - new Date(filingDate).getTime()) / 31_557_600_000));
  return years === 0 ? "Less than a year" : `${years} year${years === 1 ? "" : "s"}`;
};

const publicUser = (user: User, lawyerId: string | null = null) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  language: user.language,
  lawyerId,
});

async function lawyerProfileForUser(userId: number) {
  const [profile] = await db.select().from(lawyersTable).where(eq(lawyersTable.userId, userId));
  return profile;
}

async function caseView(row: {
  case: Case;
  citizenName: string | null;
  lawyerName: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [hearing] = await db
    .select()
    .from(hearingsTable)
    .where(and(eq(hearingsTable.caseId, row.case.id), gte(hearingsTable.hearingDate, today)))
    .orderBy(asc(hearingsTable.hearingDate))
    .limit(1);
  return {
    id: row.case.id,
    caseNumber: row.case.caseNumber,
    title: row.case.title,
    citizenName: row.citizenName,
    lawyerName: row.lawyerName,
    court: row.case.court,
    location: row.case.location,
    filingDate: row.case.filingDate,
    currentStatus: row.case.currentStatus,
    monitoringStatus: row.case.monitoringStatus,
    caseAge: ageLabel(row.case.filingDate),
    nextHearing: hearing?.hearingDate ?? null,
  };
}

function hearingView(hearing: Hearing, currentCase?: Case) {
  return {
    id: hearing.id,
    caseId: hearing.caseId,
    hearingDate: hearing.hearingDate,
    time: hearing.time,
    stage: hearing.stage,
    court: currentCase?.court ?? "Sample Court",
    location: currentCase?.location ?? "Sample location",
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
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email.toLowerCase()));
  if (existing.length > 0) {
    res.status(400).json({ error: "An account with that email already exists" });
    return;
  }
  const [user] = await db.insert(usersTable).values({
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    passwordHash: await bcrypt.hash(parsed.data.password, 10),
    role: parsed.data.role,
    language: parsed.data.language ?? "English",
  }).returning();
  let lawyerId: string | null = null;
  if (parsed.data.role === "lawyer") {
    lawyerId = `JC-LAW-${String(user.id).padStart(4, "0")}`;
    await db.insert(lawyersTable).values({
      lawyerId,
      userId: user.id,
      name: user.name,
      email: user.email,
      sampleRegistrationNumber: `PENDING-${user.id}`,
      specialization: "General Practice",
      location: "To be added",
      languages: [user.language],
      experience: 0,
      availability: "Available",
      verificationStatus: "Verification Required",
      isSample: false,
    });
  }
  const authUser = { id: user.id, name: user.name, email: user.email, role: parsed.data.role };
  res.status(201).json(RegisterResponse.parse({ token: createToken(authUser), user: publicUser(user, lawyerId) }));
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
  if (!row || !row.user.active || !(await bcrypt.compare(parsed.data.password, row.user.passwordHash))) {
    res.status(401).json({ error: "Invalid demo account details" });
    return;
  }
  const role = row.user.role as "citizen" | "lawyer" | "admin";
  const authUser = { id: row.user.id, name: row.user.name, email: row.user.email, role };
  res.json(LoginResponse.parse({ token: createToken(authUser), user: publicUser(row.user, row.lawyerId) }));
});

router.use(requireAuth);

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
  const caseViews = await Promise.all(cases.map(caseView));
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
  res.json(ListCasesResponse.parse(await Promise.all(filtered.map(caseView))));
});

router.post("/cases", requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateCaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db.insert(casesTable).values(parsed.data).returning();
  const [row] = (await caseRows()).filter((item) => item.case.id === created.id);
  res.status(201).json(CreateCaseResponse.parse(await caseView(row)));
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
    ...(await caseView(row)),
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
  const [updated] = await db.update(casesTable).set(parsed.data).where(eq(casesTable.id, params.data.id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Case not found" });
    return;
  }
  const [row] = (await caseRows()).filter((item) => item.case.id === updated.id);
  res.json(UpdateCaseResponse.parse(await caseView(row)));
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
  const [created] = await db.insert(hearingsTable).values({ ...parsed.data, caseId: params.data.id }).returning();
  const [currentCase] = await db.select().from(casesTable).where(eq(casesTable.id, params.data.id));
  res.status(201).json(CreateHearingResponse.parse(hearingView(created, currentCase)));
});

router.put("/hearings/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateHearingParams.safeParse(req.params);
  const parsed = UpdateHearingBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid hearing update" });
    return;
  }
  const [updated] = await db.update(hearingsTable).set(parsed.data).where(eq(hearingsTable.id, params.data.id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Hearing not found" });
    return;
  }
  const [currentCase] = await db.select().from(casesTable).where(eq(casesTable.id, updated.caseId));
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

router.post("/documents", async (req, res): Promise<void> => {
  const parsed = CreateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = await visibleCases(req.authUser!.id, req.authUser!.role);
  if (!rows.some((row) => row.case.id === parsed.data.caseId)) {
    res.status(404).json({ error: "Case not found" });
    return;
  }
  const [created] = await db.insert(documentsTable).values({ ...parsed.data, uploadedBy: req.authUser!.id }).returning();
  res.status(201).json(CreateDocumentResponse.parse(documentView(created)));
});

router.get("/lawyers", async (req, res): Promise<void> => {
  const parsed = ListLawyersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const lawyers = await db.select().from(lawyersTable).orderBy(asc(lawyersTable.name));
  const filtered = lawyers.filter((lawyer) => {
    const locationMatch = parsed.data.location ? lawyer.location.toLowerCase().includes(parsed.data.location.toLowerCase()) : true;
    const languageMatch = parsed.data.language ? lawyer.languages.some((item) => item.toLowerCase() === parsed.data.language?.toLowerCase()) : true;
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
    sampleRegistrationNumber: `SAMPLE-REG-${nextNumber}`,
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
  const verified = lawyer.sampleRegistrationNumber === parsed.data.sampleRegistrationNumber;
  const [updated] = await db.update(lawyersTable).set({ verificationStatus: verified ? "Verified Sample Lawyer" : "Verification Required" }).where(eq(lawyersTable.id, lawyer.id)).returning();
  res.json(VerifyLawyerResponse.parse({
    verified,
    message: verified ? "VERIFIED SAMPLE LAWYER" : "Verification Required",
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

export default router;