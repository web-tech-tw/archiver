import { createHash } from "node:crypto";

const MAX_KNOWLEDGE_BYTES = 15 * 1024 * 1024;

export interface KnowledgeIngestParams {
    filePath: string;
    fileName: string;
    roomId: string;
    uploaderId: string;
    transactionId: string;
    knowledgeCollection?: string;
}

export interface KnowledgeIngestResult {
    ok: boolean;
    status: number;
    knowledgeId?: string;
    deduped?: boolean;
    error?: string;
}

export function resolveDocType(fileName: string): "chat-archive" | "engineering-paper" | null {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".md")) return "chat-archive";
    if (lower.endsWith(".pdf")) return "engineering-paper";
    return null;
}

/**
 * 將 received/ 快取的知識文件上傳至 Nymph 的 knowledge ingest API
 */
export async function ingestKnowledgeFile(params: KnowledgeIngestParams): Promise<KnowledgeIngestResult> {
    const docType = resolveDocType(params.fileName);
    if (!docType) {
        return { ok: false, status: 400, error: `不支援的檔案類型：${params.fileName}` };
    }

    const file = Bun.file(params.filePath);
    if (!(await file.exists())) {
        return { ok: false, status: 404, error: `找不到快取檔案：${params.filePath}` };
    }

    const bytes = await file.bytes();
    if (bytes.length > MAX_KNOWLEDGE_BYTES) {
        return { ok: false, status: 413, error: `檔案超過 15MB 上限（${bytes.length} bytes）` };
    }

    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const baseUrl = Bun.env.NYMPH_URL || "http://nymph:3000";
    const secret = Bun.env.KNOWLEDGE_INGEST_SECRET || "";

    try {
        const res = await fetch(`${baseUrl}/knowledge/ingest`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${secret}`,
            },
            body: JSON.stringify({
                docType,
                fileName: params.fileName,
                mimeType: docType === "engineering-paper" ? "application/pdf" : "text/markdown",
                sha256,
                sizeBytes: bytes.length,
                sourceChannelId: params.roomId,
                uploadedBy: params.uploaderId,
                transactionId: params.transactionId,
                contentBase64: Buffer.from(bytes).toString("base64"),
                meta: params.knowledgeCollection ? { knowledgeCollection: params.knowledgeCollection } : {},
            }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const error = (data as { error?: string }).error || `Nymph 回應 ${res.status}`;
            return { ok: false, status: res.status, error };
        }

        const result = data as { knowledgeId?: string; deduped?: boolean };
        return {
            ok: true,
            status: 202,
            knowledgeId: result.knowledgeId,
            deduped: result.deduped,
        };
    } catch (err) {
        return { ok: false, status: 0, error: `無法連上 Nymph ingest API：${(err as Error).message}` };
    }
}
