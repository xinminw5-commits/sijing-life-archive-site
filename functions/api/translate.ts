import { publicTranslation } from "../../server/plain-translation.ts";
export function onRequestPost({ request, env }: { request: Request; env: Record<string, string | undefined> }) { return publicTranslation(request, env); }
