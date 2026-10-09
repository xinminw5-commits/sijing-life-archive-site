export type AccountProfile = {
  displayName: string;
  number: string;
  createdAt: string;
  loginMethod: "email_code";
};
export type AccountSummary = {
  savedVersions: number;
  savedQuestions: number;
  lastSavedAt: string | null;
};
