import { describe, it, expect } from "bun:test";
import { getCollectionForRoom, getKnowledgeCollectionForRoom, isKnowledgeRoom, loadMappingConfig } from "./mapping";
import { join } from "node:path";
import { unlink } from "node:fs/promises";

describe("Channel Mapping Utility", () => {
    it("should return empty object when file does not exist", async () => {
        const config = await loadMappingConfig("./non-existent-mapping.toml");
        expect(config).toEqual({});
    });

    it("should parse sample mapping correctly", async () => {
        const tempPath = join(import.meta.dir, "temp_test_mapping.toml");
        await Bun.write(
            tempPath,
            `[mappings]
"123456" = { message_collection = "channel_a", knowledge_collection = "knowledge_a" }
"room_xyz" = { message_collection = "channel_b" }
`,
        );

        const mappings = await loadMappingConfig(tempPath);
        expect(mappings["123456"]).toEqual({ message_collection: "channel_a", knowledge_collection: "knowledge_a" });
        expect(mappings["room_xyz"]).toEqual({ message_collection: "channel_b" });

        const found = await getCollectionForRoom("123456", tempPath);
        expect(found).toBe("channel_a");

        const notFound = await getCollectionForRoom("999999", tempPath);
        expect(notFound).toBeNull();

        await unlink(tempPath);
    });

    it("should treat presence of knowledge_collection as knowledge room", async () => {
        const tempPath = join(import.meta.dir, "temp_test_knowledge.toml");
        await Bun.write(
            tempPath,
            `[mappings]
"975639402900496414" = { message_collection = "channel_a", knowledge_collection = "knowledge_a" }
"987654321098765432" = { message_collection = "channel_b", knowledge_collection = "knowledge_b" }
"111111" = { message_collection = "channel_c" }
`,
        );

        expect(await isKnowledgeRoom("975639402900496414", tempPath)).toBe(true);
        expect(await isKnowledgeRoom("987654321098765432", tempPath)).toBe(true);
        expect(await isKnowledgeRoom("111111", tempPath)).toBe(false);
        expect(await isKnowledgeRoom("999999", tempPath)).toBe(false);

        expect(await getKnowledgeCollectionForRoom("975639402900496414", tempPath)).toBe("knowledge_a");
        expect(await getKnowledgeCollectionForRoom("111111", tempPath)).toBeNull();

        await unlink(tempPath);
    });

    it("should treat missing [mappings] section as empty config", async () => {
        const tempPath = join(import.meta.dir, "temp_test_mapping_off.toml");
        await Bun.write(tempPath, "[other]\nkey = 1\n");

        const mappings = await loadMappingConfig(tempPath);
        expect(mappings).toEqual({});
        expect(await getCollectionForRoom("123456", tempPath)).toBeNull();
        expect(await isKnowledgeRoom("123456", tempPath)).toBe(false);

        await unlink(tempPath);
    });
});
