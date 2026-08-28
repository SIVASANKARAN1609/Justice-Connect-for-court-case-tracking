import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type AuthUser = {
  id: number;
  role: "citizen" | "lawyer" | "admin";
  name: string;
  email: string;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

const secret = () =>
  process.env.SESSION_SECRET ?? "justice-connect-academic-development-secret";

export function createToken(user: AuthUser): string {
  return jwt.sign(user, secret(), { expiresIn: "7d" });
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const claims = jwt.verify(token, secret()) as AuthUser;
    const [user] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        active: usersTable.active,
      })
      .from(usersTable)
      .where(eq(usersTable.id, claims.id));

    if (!user || !user.active) {
      res.status(401).json({ error: "This account is not active" });
      return;
    }

    if (!["citizen", "lawyer", "admin"].includes(user.role)) {
      res.status(401).json({ error: "Invalid account role" });
      return;
    }

    req.authUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as AuthUser["role"],
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}

export function requireRole(...roles: AuthUser["role"][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      res.status(403).json({ error: "You do not have access to this area" });
      return;
    }
    next();
  };
}