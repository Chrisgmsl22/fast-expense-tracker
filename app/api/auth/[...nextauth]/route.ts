import { handlers } from "@/auth";

// Auth.js route handler — serves /api/auth/* (callbacks, session, CSRF, etc.).
export const { GET, POST } = handlers;
