// Shared display contract. No knowledge corpus or private source is shipped to clients.
export type Reading = {
  directAnswer: string;
  reasoning: string;
  plainLanguage: string;
  example: { scenario: string; limit: string };
  nextSteps: string[];
  verification: string;
  chartAnchors: string[];
  sources: { id: string; title: string; book: string }[];
  knowledgeVersion: string;
};
export type ConversationMessage = { question: string; answer: string; reading?: Reading; savedAt?: string };
export type Translation = { source: string; plainLanguage: string; example: string };
