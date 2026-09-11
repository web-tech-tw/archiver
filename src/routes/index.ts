import { Elysia } from "elysia";

const GITHUB_REPO_URL = "https://github.com/web-tech-tw/archiver";

export const server = new Elysia()
    .get("/", ({ redirect }) => redirect(GITHUB_REPO_URL))
    .get("/healthz", () => ({
        status: "healthy",
        timestamp: new Date().toISOString(),
    }));

export type HttpServer = Elysia<any, any, any, any, any, any, any>;
