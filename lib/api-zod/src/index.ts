export * from "./generated/api";
export * from "./generated/types";
import * as zod from 'zod';

export const DocumentAssistantBody = zod.object({
  question: zod.string().min(1)
});

export const DocumentAssistantResponse = zod.object({
  answer: zod.string(),
  disclaimer: zod.string()
});

export const GeneralAssistantBody = zod.object({
  question: zod.string().min(1)
});

export const GeneralAssistantResponse = zod.object({
  answer: zod.string(),
  disclaimer: zod.string()
});
