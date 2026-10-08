import { publicTranslation } from "../../../server/plain-translation";
export function POST(request: Request) { return publicTranslation(request, process.env); }
