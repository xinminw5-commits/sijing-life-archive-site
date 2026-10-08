import { accountRequest, type Env } from "../../../server/account-service.ts";
export function onRequest({ request, env }: { request: Request; env: Env }) { return accountRequest(request, env); }
