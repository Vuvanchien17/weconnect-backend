import mongoose, { mongo } from "mongoose";

const participantSchema = new mongoose.Schema(
  {
    userId: {
      type: Number, // SQL -> user.id
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  }
);

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
  },
  createdBy: {
    type: Number, // SQL -> user.id
    required: true,
  },
});

const lastMessageSchema = new mongoose.Schema(
  {
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    content: {
      type: String,
      trim: true,
      default: null,
    },
    senderId: {
      type: Number, // SQL -> user.id
      required: true,
    },
    createdAt: {
      type: Date,
    },
  },
  {
    _id: false,
  }
);

// create Object Schema
const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["direct", "group"],
      required: true,
    },
    participants: {
      type: [participantSchema],
      required: true,
    },
    group: {
      type: groupSchema,
    },
    lastMessageAt: {
      type: Date,
    },
    seenBy: [
      {
        type: Number, // SQL -> user.id
      },
    ],
    lastMessage: {
      type: lastMessageSchema,
      default: null,
    },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

conversationSchema.index({
  "participants.userId": 1,
  lastMessageAt: -1,
});

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;

// thiếu collection Notification
// Conversation setting
// User setting / privacy
// table authentication
