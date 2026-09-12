import mongoose, { Schema } from "mongoose";
import type { Message } from "../../utils/parser";

export interface MessageVia {
    channelId: string;
    uploaderId: string;
    transactionId: string;
}

export interface MessageDocument extends Omit<Message, "hash"> {
    _id: string;
    via?: MessageVia;
}

export const messageSchema = new Schema<MessageDocument>(
    {
        _id: { type: String, required: true },
        date: {
            type: String,
            required: true,
            validate: {
                validator: (v: string) => typeof v === "string" && v.trim().length > 0,
                message: "date cannot be empty",
            },
        },
        time: {
            type: String,
            required: true,
            validate: {
                validator: (v: string) => typeof v === "string" && v.trim().length > 0,
                message: "time cannot be empty",
            },
        },
        content: {
            type: String,
            required: true,
            validate: {
                validator: (v: string) => typeof v === "string" && v.trim().length > 0,
                message: "content cannot be empty",
            },
        },
        via: {
            channelId: { type: String, required: true },
            uploaderId: { type: String, required: true },
            transactionId: { type: String, required: true },
        },
    },
    {
        timestamps: true,
        _id: false,
    },
);

/**
 * 依據指定之 collectionName 取得對應之 Mongoose Model
 */
export function getMessageModel(collectionName: string): mongoose.Model<MessageDocument> {
    return (
        (mongoose.models[collectionName] as mongoose.Model<MessageDocument>) ||
        mongoose.model<MessageDocument>(collectionName, messageSchema, collectionName)
    );
}
