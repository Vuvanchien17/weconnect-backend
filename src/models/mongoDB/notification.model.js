import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    // user receive notification
    userId: {
      type: BigInt, // SQL -> user.id
      required: true,
    },

    // user create action
    actorId: {
      type: BigInt, // SQL -> user.id
      required: true,
    },
    type: {
      type: String,
      enum: [
        "friend_request",
        "friend_accept",
        "post_reaction",
        "comment",
        "comment_reaction",
        "post_tag",
        "message",
        "group_invite",
      ],
      required: true,
    },
    payload: {
      type: Object,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    isDelivered: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

notificationSchema.index({
  userId: 1,
  createdAt: -1,
});

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
