import { describe, it, expect } from "bun:test";
import { getCollectionForRoom, loadMappingConfig } from "./mapping";
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
"123456" = "channel_a"
"room_xyz" = "channel_b"
`,
        );

        const mappings = await loadMappingConfig(tempPath);
        expect(mappings["123456"]).toBe("channel_a");
        expect(mappings["room_xyz"]).toBe("channel_b");

        const found = await getCollectionForRoom("123456", tempPath);
        expect(found).toBe("channel_a");

        const notFound = await getCollectionForRoom("999999", tempPath);
        expect(notFound).toBeNull();

        await unlink(tempPath);
    });
});
