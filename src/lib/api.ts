import { NextResponse } from "next/server";
import { auth } from "@/auth";

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}
export function bad(message: string, status = 400) { return json({ error: message }, status); }

type Ctx = { params: Promise<Record<string, string>> };
export function withUser<T extends unknown[]>(handler: (userId: string, req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx) => {
    const session = await auth();
    if (!session?.user?.id) return bad("Sign in first", 401);
    try { return await handler(session.user.id, req, ctx); }
    catch (e) { if (e instanceof Response) return e; console.error(e); return bad(e instanceof Error ? e.message : "Something went wrong", 500); }
  };
}
export async function body<T = Record<string, unknown>>(req: Request): Promise<T> { try { return (await req.json()) as T; } catch { return {} as T; } }
