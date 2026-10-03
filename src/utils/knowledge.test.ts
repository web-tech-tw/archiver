import { describe, it, expect } from "bun:test";
import { resolveDocType, ingestKnowledgeFile } from "./knowledge";
import { join } from "node:path";
import { unlink } from "node:fs/promises";

describe("Knowledge Ingest Utility", () => {
    it("should resolve docType by file extension", () => {
        expect(resolveDocType("record.md")).toBe("chat-archive");
        expect(resolveDocType("record.MD")).toBe("chat-archive");
        expect(resolveDocType("paper.pdf")).toBe("engineering-paper");
        expect(resolveDocType("Paper.PDF")).toBe("engineering-paper");
        expect(resolveDocType("photo.png")).toBeNull();
        expect(resolveDocType("log.txt")).toBeNull();
    });

    it("should reject unsupported file types and missing cached files", async () => {
        const unsupported = await ingestKnowledgeFile({
            filePath: "./received/x.txt",
            fileName: "log.txt",
            roomId: "room",
            uploaderId: "user",
            transactionId: "txn",
        });
        expect(unsupported.ok).toBe(false);
        expect(unsupported.status).toBe(400);

        const missing = await ingestKnowledgeFile({
            filePath: "./received/non-existent-id.md",
            fileName: "record.md",
            roomId: "room",
            uploaderId: "user",
            transactionId: "txn",
        });
        expect(missing.ok).toBe(false);
        expect(missing.status).toBe(404);
    });

    it("should post the cached file to the Nymph ingest API with correct payload", async () => {
        const tempPath = join(import.meta.dir, "temp_knowledge_test.md");
        const content = "# Chat record\nHello world";
        await Bun.write(tempPath, content);

        Bun.env.KNOWLEDGE_INGEST_SECRET = "test-secret";
        Bun.env.NYMPH_URL = "http://nymph-test:3000";

        const originalFetch = globalThis.fetch;
        let capturedRequest: Request | null = null;
        let capturedBody: any = null;
        globalThis.fetch = (async (input: any, init: any) => {
            capturedRequest = new Request(input, init);
            capturedBody = JSON.parse((init?.body as string) || "{}");
            return new Response(JSON.stringify({ knowledgeId: "kd_123", deduped: false }), {
                status: 202,
                headers: { "Content-Type": "application/json" },
            });
        }) as typeof fetch;

        try {
            const result = await ingestKnowledgeFile({
                filePath: tempPath,
                fileName: "record.md",
                roomId: "975639402900496414",
                uploaderId: "usr_test",
                transactionId: "txn_test",
            });

            expect(result.ok).toBe(true);
            expect(result.knowledgeId).toBe("kd_123");
            expect(result.deduped).toBe(false);

            expect(capturedRequest!.url).toBe("http://nymph-test:3000/knowledge/ingest");
            expect(capturedRequest!.headers.get("Authorization")).toBe("Bearer test-secret");

            const expectedHash = await Bun.file(tempPath).arrayBuffer().then((buf) =>
                new Bun.CryptoHasher("sha256").update(buf).digest("hex")
            );
            expect(capturedBody.docType).toBe("chat-archive");
            expect(capturedBody.mimeType).toBe("text/markdown");
            expect(capturedBody.sha256).toBe(expectedHash);
            expect(capturedBody.sizeBytes).toBe(content.length);
            expect(capturedBody.sourceChannelId).toBe("975639402900496414");
            expect(capturedBody.uploadedBy).toBe("usr_test");
            expect(capturedBody.transactionId).toBe("txn_test");
            expect(Buffer.from(capturedBody.contentBase64, "base64").toString("utf-8")).toBe(content);
        } finally {
            globalThis.fetch = originalFetch;
            delete Bun.env.KNOWLEDGE_INGEST_SECRET;
            delete Bun.env.NYMPH_URL;
            await unlink(tempPath);
        }
    });

    it("should surface Nymph error responses", async () => {
        const tempPath = join(import.meta.dir, "temp_knowledge_test2.md");
        await Bun.write(tempPath, "# x");

        Bun.env.NYMPH_URL = "http://nymph-test:3000";

        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () =>
            new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            })) as unknown as typeof fetch;

        try {
            const result = await ingestKnowledgeFile({
                filePath: tempPath,
                fileName: "record.md",
                roomId: "room",
                uploaderId: "user",
                transactionId: "txn",
            });
            expect(result.ok).toBe(false);
            expect(result.status).toBe(401);
            expect(result.error).toBe("Unauthorized");
        } finally {
            globalThis.fetch = originalFetch;
            delete Bun.env.NYMPH_URL;
            await unlink(tempPath);
        }
    });
});
