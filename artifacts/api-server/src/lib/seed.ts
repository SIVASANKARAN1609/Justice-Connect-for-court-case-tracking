import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
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
import { logger } from "./logger";

export async function seedDatabase(): Promise<void> {
  const [{ value: userCount }] = await db
    .select({ value: count() })
    .from(usersTable);
  if (Number(userCount) > 0) {
    return;
  }

  const password = await bcrypt.hash("password123", 10);
  const adminPassword = await bcrypt.hash("admin12345", 10);
  const [citizen, secondCitizen, thirdCitizen, lawyerUser, admin] = await db
    .insert(usersTable)
    .values([
      { name: "Meena Rajan", email: "citizen@example.com", passwordHash: password, role: "citizen", language: "English" },
      { name: "Karthik S.", email: "karthik@example.com", passwordHash: password, role: "citizen", language: "Tamil" },
      { name: "Priya Nair", email: "priya@example.com", passwordHash: password, role: "citizen", language: "English" },
      { name: "Arun Kumar", email: "lawyer@example.com", passwordHash: password, role: "lawyer", language: "English" },
      { name: "Justice Connect Admin", email: "admin@example.com", passwordHash: adminPassword, role: "admin", language: "English" },
    ])
    .returning();

  const lawyers = await db
    .insert(lawyersTable)
    .values([
      { lawyerId: "JC-LAW-1001", userId: lawyerUser.id, name: "Arun Kumar", email: "lawyer@example.com", sampleRegistrationNumber: "SAMPLE-REG-1001", specialization: "Civil Law", location: "Chennai", languages: ["Tamil", "English"], experience: 6, availability: "Available", verificationStatus: "Verified Sample Lawyer", isSample: true },
      { lawyerId: "JC-LAW-1002", name: "Nila Joseph", email: "nila@example.com", sampleRegistrationNumber: "SAMPLE-REG-1002", specialization: "Family Law", location: "Coimbatore", languages: ["Tamil", "English"], experience: 8, availability: "Available", verificationStatus: "Verified Sample Lawyer", isSample: true },
      { lawyerId: "JC-LAW-1003", name: "Vikram Das", email: "vikram@example.com", sampleRegistrationNumber: "SAMPLE-REG-1003", specialization: "Consumer Law", location: "Madurai", languages: ["Tamil", "English"], experience: 4, availability: "Limited", verificationStatus: "Verified Sample Lawyer", isSample: true },
      { lawyerId: "JC-LAW-1004", name: "Sara Mathew", email: "sara@example.com", sampleRegistrationNumber: "SAMPLE-REG-1004", specialization: "Property Law", location: "Chennai", languages: ["English", "Malayalam"], experience: 10, availability: "Available", verificationStatus: "Verification Required", isSample: true },
      { lawyerId: "JC-LAW-1005", name: "Ravi Menon", email: "ravi@example.com", sampleRegistrationNumber: "SAMPLE-REG-1005", specialization: "Employment Law", location: "Tiruchirappalli", languages: ["Tamil", "English"], experience: 5, availability: "Available", verificationStatus: "Verified Sample Lawyer", isSample: true },
    ])
    .returning();

  const cases = await db
    .insert(casesTable)
    .values([
      { caseNumber: "JC-CIV-2026-001", title: "Rajan v. Blue Meadow Housing", citizenId: citizen.id, lawyerId: lawyers[0].id, court: "Chennai Civil Court", location: "Chennai", filingDate: "2024-07-12", currentStatus: "Evidence review", monitoringStatus: "Needs Attention" },
      { caseNumber: "JC-CON-2026-014", title: "Karthik v. Northstar Appliances", citizenId: secondCitizen.id, lawyerId: lawyers[2].id, court: "District Consumer Forum", location: "Madurai", filingDate: "2025-10-04", currentStatus: "Initial hearing complete", monitoringStatus: "Normal Monitoring" },
      { caseNumber: "JC-FAM-2025-078", title: "Nair family property mediation", citizenId: thirdCitizen.id, lawyerId: lawyers[1].id, court: "Family Court", location: "Coimbatore", filingDate: "2023-02-18", currentStatus: "Awaiting next hearing", monitoringStatus: "Long-Pending" },
      { caseNumber: "JC-EMP-2026-033", title: "Priya v. Cedar Works", citizenId: citizen.id, lawyerId: lawyers[4].id, court: "Labour Court", location: "Tiruchirappalli", filingDate: "2026-01-22", currentStatus: "Notice issued", monitoringStatus: "Normal Monitoring" },
      { caseNumber: "JC-PRO-2025-119", title: "Das v. Riverbank Estates", citizenId: secondCitizen.id, lawyerId: lawyers[3].id, court: "Chennai District Court", location: "Chennai", filingDate: "2022-09-10", currentStatus: "Documents submitted", monitoringStatus: "Long-Pending" },
    ])
    .returning();

  await db.insert(hearingsTable).values([
    { caseId: cases[0].id, hearingDate: "2024-08-08", time: "10:30 AM", stage: "Initial Hearing", result: "Matter heard; documents requested" },
    { caseId: cases[0].id, hearingDate: "2026-09-18", time: "11:00 AM", stage: "Evidence Review", result: "Upcoming" },
    { caseId: cases[1].id, hearingDate: "2025-11-02", time: "10:00 AM", stage: "Initial Hearing", result: "Response recorded" },
    { caseId: cases[1].id, hearingDate: "2026-10-07", time: "02:00 PM", stage: "Document Review", result: "Upcoming" },
    { caseId: cases[2].id, hearingDate: "2023-03-16", time: "11:30 AM", stage: "Mediation", result: "Adjourned", adjournmentReason: "Additional records requested" },
    { caseId: cases[2].id, hearingDate: "2026-11-12", time: "09:30 AM", stage: "Mediation Review", result: "Upcoming" },
    { caseId: cases[3].id, hearingDate: "2026-08-29", time: "10:00 AM", stage: "Notice Review", result: "Upcoming" },
    { caseId: cases[4].id, hearingDate: "2024-01-11", time: "11:00 AM", stage: "Document Submission", result: "Documents accepted" },
  ]);

  await db.insert(documentsTable).values([
    { caseId: cases[0].id, uploadedBy: citizen.id, fileName: "housing-agreement.pdf", fileType: "PDF", explanation: "A sample housing agreement used to demonstrate document explanation." },
    { caseId: cases[0].id, uploadedBy: citizen.id, fileName: "hearing-notice.png", fileType: "Image", explanation: "A sample hearing notice with a fictional date and court location." },
    { caseId: cases[1].id, uploadedBy: secondCitizen.id, fileName: "warranty-record.pdf", fileType: "PDF", explanation: "A fictional warranty record for the explainer demo." },
  ]);

  const questions = await db.insert(legalQuestionsTable).values([
    { citizenId: citizen.id, lawyerId: lawyers[0].id, category: "Civil", question: "What should I keep ready before the next evidence review hearing?", status: "Answered" },
    { citizenId: secondCitizen.id, lawyerId: lawyers[2].id, category: "Consumer", question: "How can I organize the warranty records for this sample complaint?", status: "Pending" },
    { citizenId: thirdCitizen.id, lawyerId: lawyers[1].id, category: "Property", question: "What does an adjournment mean for the next sample hearing?", status: "Answered" },
  ]).returning();
  await db.insert(legalResponsesTable).values([
    { questionId: questions[0].id, lawyerId: lawyers[0].id, response: "For this demo, keep the listed documents together and note which points you want clarified at the hearing. This is general educational information, not legal advice." },
    { questionId: questions[2].id, lawyerId: lawyers[1].id, response: "An adjournment means the hearing moved to another date. Check the next hearing entry and keep the reason recorded for your own notes." },
  ]);

  await db.insert(complaintsTable).values([
    { citizenId: citizen.id, category: "Consumer", description: "A sample appliance repair request has not received a response.", location: "Chennai", status: "Under Review", guidance: "Keep the invoice, warranty record, and copies of your communication together." },
    { citizenId: secondCitizen.id, category: "Public Service", description: "A fictional service request remains pending beyond the expected follow-up.", location: "Madurai", status: "Guidance Provided", guidance: "Record the request date and follow-up reference, then identify the appropriate official channel." },
    { citizenId: thirdCitizen.id, category: "Education", description: "A sample certificate correction request needs a clear next step.", location: "Coimbatore", status: "Submitted", guidance: "Collect the original record, correction request, and acknowledgement." },
  ]);

  await db.insert(awarenessArticlesTable).values([
    { title: "What is a Court Summons?", category: "Court Basics", summary: "A simple introduction to why a court may send a summons.", content: "A summons is a formal notice about a case or hearing. Read the details carefully, note the date, and seek qualified help if you are unsure what to do.", language: "English", published: true },
    { title: "Understanding Case Status", category: "Case Tracking", summary: "Learn the difference between common case stages.", content: "Case status is a short description of where a sample case currently stands. It can change after a hearing or document update.", language: "English", published: true },
    { title: "What is an Adjournment?", category: "Court Basics", summary: "Why a hearing might move to another date.", content: "An adjournment means a hearing is postponed to a later date. Note the reason shown and always check the next hearing information.", language: "English", published: true },
    { title: "Preparing for a Hearing", category: "Practical Steps", summary: "A calm checklist for getting organized.", content: "Keep your notices and documents together, write down questions, plan travel, and arrive before the scheduled time.", language: "English", published: true },
    { title: "Basic Consumer Rights", category: "Consumer", summary: "A plain-language overview of keeping purchase records.", content: "Keep receipts, warranty details, service records, and messages. This prototype only provides general educational information.", language: "English", published: true },
    { title: "Understanding Legal Documents", category: "Documents", summary: "How to read a document without feeling overwhelmed.", content: "Start with the document title, parties, dates, requested action, and deadlines. Ask a qualified professional when you need advice.", language: "English", published: true },
    { title: "How to Find Legal Help", category: "Legal Help", summary: "Questions to consider when reviewing sample profiles.", content: "Look at the listed area, languages, experience, and availability. The profiles here are fictional sample professionals.", language: "English", published: true },
    { title: "உங்கள் வழக்கை ஒழுங்குபடுத்துதல்", category: "வழக்கு தகவல்", summary: "வழக்கு ஆவணங்களை எளிதாக ஒழுங்குபடுத்தும் வழிகள்.", content: "வழக்கு எண், விசாரணை தேதி மற்றும் முக்கிய ஆவணங்களை ஒரே இடத்தில் வைத்துக் கொள்ளுங்கள். இது கல்வி நோக்கத்திற்கான தகவல் மட்டுமே.", language: "Tamil", published: true },
  ]);

  await db.insert(notificationsTable).values([
    { userId: citizen.id, title: "Upcoming hearing", message: "Evidence Review is scheduled for 18 Sep 2026 at 11:00 AM.", type: "hearing", isRead: false },
    { userId: citizen.id, title: "Sample lawyer response", message: "Arun Kumar responded to your civil question.", type: "response", isRead: false },
    { userId: secondCitizen.id, title: "Case status update", message: "Your sample consumer case is ready for document review.", type: "case", isRead: false },
    { userId: admin.id, title: "Review queue", message: "One sample lawyer profile needs verification.", type: "admin", isRead: false },
  ]);

  logger.info({ citizens: [citizen.id, secondCitizen.id, thirdCitizen.id].length, lawyers: lawyers.length, cases: cases.length }, "Seeded Justice Connect sample data");
}