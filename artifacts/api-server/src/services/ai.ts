import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@workspace/db";
import { legalKnowledgeTable } from "@workspace/db/schema";
import { ilike, or } from "drizzle-orm";

let genAI: GoogleGenerativeAI | null = null;
if (process.env.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AIContext = {
  userRole: string;
  userName: string;
  documentText?: string | null;
  caseContext?: any;
  userCases?: any[];
  userHearings?: any[];
  lawyerContext?: any[];
  multimodalFile?: { data: string, mimeType: string };
};

const SYSTEM_PROMPT = `You are the Justice Connect AI Assistant.
You help people understand legal information, legal rights, legal procedures, Justice Connect case information, hearings, summons, documents, lawyers and available assistance.
You are an AI information assistant. You are NOT a lawyer, judge, court, police officer or government authority.
Provide general legal information in clear, neat, and highly readable English with very simple explanations. Avoid complex legal jargon. Use bullet points or short sentences to make the response extremely easy to read.
When case-specific information is provided in the context, use it accurately.
Never invent case numbers, hearing dates, case status, legal sections, laws, court decisions, documents, lawyer information, or user information.
Never predict whether a person will win or lose a case.
Never guarantee bail, case outcome, case completion date, hearing outcome, or legal success.
Never tell a user to ignore a summons, legal notice or official communication.
Clearly distinguish GENERAL LEGAL INFORMATION from USER'S JUSTICE CONNECT RECORDS.
Respect privacy and authorization. Never reveal information belonging to another user.
If information is unavailable, say so.
For jurisdiction-specific questions, consider the relevant jurisdiction (usually India).
Support English, Tamil and mixed Tamil-English. If the user asks in Tamil, you MUST respond in Tamil.
Your goal is to make legal information easier to understand, navigate and access.`;

export async function askJusticeConnectAI(
  question: string,
  history: ChatMessage[],
  context: AIContext
): Promise<string> {
  // if (!openai) {
  //   throw new Error("OPENAI_API_KEY_MISSING");
  // }

  try {
    // Basic semantic search fallback using keywords
    const keywords = question.split(" ").filter((w) => w.length > 4);
    let knowledgeContext = "";

    if (keywords.length > 0) {
      const conditions = keywords.map((kw) =>
        or(ilike(legalKnowledgeTable.title, `%${kw}%`), ilike(legalKnowledgeTable.content, `%${kw}%`))
      );
      // Simplify logic for prototype: just grab matches based on the first keyword
      const results = await db.select().from(legalKnowledgeTable).where(conditions[0]).limit(5);

      if (results.length > 0) {
        knowledgeContext =
          "Trusted Reference Legal Information:\n" +
          results.map((r) => `[${r.title}]: ${r.content}`).join("\n\n");
      }
    }

    // Build the dynamic prompt context
    let dynamicContext = `User Role: ${context.userRole}\nUser Name: ${context.userName}\n\n`;

    if (context.documentText) {
      dynamicContext += `=== EXPLICIT DOCUMENT TEXT ===\nThe user has uploaded/selected a document. Text:\n${context.documentText}\n=========================\n\n`;
    }

    if (context.caseContext) {
      dynamicContext += `=== SELECTED CASE CONTEXT ===\n${JSON.stringify(context.caseContext, null, 2)}\n=========================\n\n`;
    }

    if (context.userCases && context.userCases.length > 0) {
      dynamicContext += `=== USER'S ACTIVE CASES ===\n${JSON.stringify(context.userCases, null, 2)}\n=========================\n\n`;
    }

    if (context.userHearings && context.userHearings.length > 0) {
      dynamicContext += `=== USER'S UPCOMING HEARINGS ===\n${JSON.stringify(context.userHearings, null, 2)}\n=========================\n\n`;
    }

    if (context.lawyerContext && context.lawyerContext.length > 0) {
      dynamicContext += `=== VERIFIED LAWYERS (for lawyer recommendation queries) ===\n${JSON.stringify(context.lawyerContext, null, 2)}\n=========================\n\n`;
    }

    if (knowledgeContext) {
      dynamicContext += `=== RELEVANT LEGAL KNOWLEDGE ===\n${knowledgeContext}\n=========================\n\n`;
    }

    // Ensure history is correctly formatted for Gemini
    const formattedHistory = history.slice(-6).map(h => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }],
    }));

    if (!genAI) {
      throw new Error("GEMINI_API_KEY is missing in the backend .env file. Please add it to use the AI Assistant.");
    }

    // Use fast and active available Gemini models first
    const modelsToTry = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3-flash-preview", "gemini-3.8-flash"];
    let responseText = "";
    let lastError = null;

    const userMessage = `CONTEXT DATA FOR THIS QUERY:\n${dynamicContext}\n\nUser Question:\n${question}`;

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: SYSTEM_PROMPT
        });

        const chat = model.startChat({
          history: formattedHistory,
          generationConfig: {
            temperature: 0.1,
          },
        });

        let result;
        if (context.multimodalFile) {
          result = await chat.sendMessage([
            { text: userMessage },
            {
              inlineData: {
                data: context.multimodalFile.data,
                mimeType: context.multimodalFile.mimeType,
              },
            }
          ]);
        } else {
          result = await chat.sendMessage(userMessage);
        }

        responseText = result.response.text();
        break; // Success, exit retry loop
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${modelName} failed with ${err.status || err.message}, trying next...`);
        // If it's a model availability/capacity error (404, 503, 429), we continue to next
        if (err.status === 503 || err.status === 404 || err.status === 429 || err.message?.includes('503') || err.message?.includes('404')) {
          continue;
        }
        // For other errors (like auth), we throw immediately
        throw err;
      }
    }

    if (!responseText) {
      throw lastError || new Error("All AI models are currently unavailable. Please try again later.");
    }

    return responseText;
  } catch (error) {
    console.error("AI Error:", error);
    throw error;
  }
}
