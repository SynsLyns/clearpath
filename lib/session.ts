import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { USERS } from "./constants";

export type Role = "submitter" | "reviewer";
export type Session = { role: Role; actor: string };

const COOKIE_NAME = "clearpath_role";

export async function getSession(): Promise<Session | null> {
  const role = (await cookies()).get(COOKIE_NAME)?.value;
  if (role === "submitter") return { role, actor: USERS.submitter };
  if (role === "reviewer") return { role, actor: USERS.reviewer };
  return null;
}

export async function requireRole(role: Role): Promise<Session> {
  const session = await getSession();
  if (session?.role !== role) redirect("/");
  return session;
}

export async function assertRole(role: Role): Promise<Session> {
  const session = await getSession();
  if (session?.role !== role) {
    throw new Error(`Unauthorized: ${role} role required.`);
  }
  return session;
}
