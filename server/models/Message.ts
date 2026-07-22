import {Schema, model, models} from 'mongoose';
import type {Message} from '../utils/parser';

export interface MessageDocument extends Omit<Message, 'hash'> {
  _id: string;
}

const messageSchema = new Schema<MessageDocument>(
    {
      _id: {type: String, required: true},
      date: {type: String, required: true},
      time: {type: String, required: true},
      content: {type: String, required: true},
    },
    {
      timestamps: true,
      _id: false,
    },
);

export const MessageModel =
    models.Message || model<MessageDocument>('Message', messageSchema);
