import mongoose from "mongoose";

// create Schema
const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: BigInt, // SQL -> user.id
      required: true,
      index: true,
    },
    refreshToken: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// auto delete when expires
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // when (Time Server >= expiresAt) auto delete record index

const Session = mongoose.model("Session", sessionSchema);
export default Session;
