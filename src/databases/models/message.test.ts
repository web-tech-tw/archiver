import { describe, it, expect } from "bun:test";
import { messageSchema, getMessageModel } from "./message";

describe("Message Schema & Model", () => {
    it("should define compound index on { date: 1, time: 1, createdAt: 1 }", () => {
        const indexes = messageSchema.indexes();
        const compoundIndex = indexes.find(([fields]) => (
            fields.date === 1 && fields.time === 1 && fields.createdAt === 1
        ));

        expect(compoundIndex).toBeDefined();
    });

    it("should return a mongoose model for a given collection", () => {
        const model = getMessageModel("test_col_idx");
        expect(model).toBeDefined();
        expect(model.modelName).toBe("test_col_idx");
    });
});
