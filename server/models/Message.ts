import {Schema, model, models} from 'mongoose';
import type {Message} from '../utils/parser';

const messageSchema = new Schema<Message>(
    {
      date: {type: String, required: true},
      time: {type: String, required: true},
      content: {type: String, required: true},
      hash: {type: String, required: true, unique: true, index: true},
    },
    {
      timestamps: true,
    },
);

export const MessageModel =
    models.Message || model<Message>('Message', messageSchema);
