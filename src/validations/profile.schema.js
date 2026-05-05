import * as z from "zod";
import { REGEX } from "../utils/constants.js";

// FE form gửi empty string `""` khi user xóa field (input.value = "").
// Zod `.optional().nullable()` chỉ accept undefined/null → empty string vẫn chạy
// validator (.url(), .regex()...) và fail. Preprocess convert "" trước:
// - emptyToNull: cho field nullable (clear semantics — set null trong DB)
// - emptyToUndefined: cho field non-nullable (skip semantics — không update field này)
// Cho phép partial update: vd FE chỉ đổi avatar mà vẫn submit cả form.
const emptyToNull = (val) =>
  typeof val === "string" && val.trim() === "" ? null : val;
const emptyToUndefined = (val) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

export const profileSchema = z.object({
  displayName: z
    .preprocess(
      emptyToUndefined,
      z
        .string()
        .min(1, "At least one character is required.")
        .max(50, "No more than 50 characters."),
    )
    .optional(),
  phoneNumber: z
    .preprocess(
      emptyToNull,
      z
        .string()
        .regex(REGEX.PHONE, "Invalid Vietnamese phone number")
        .nullable(),
    )
    .optional(),
  gender: z
    .preprocess(emptyToUndefined, z.enum(["male", "female", "other"]))
    .optional(),
  birthDay: z
    .preprocess(
      (arg) => {
        if (arg === "" || arg == null) return undefined;
        if (typeof arg == "string" || arg instanceof Date) return new Date(arg);
      },
      z.date().max(new Date(), "Birthday cannot be in the future"),
    )
    .optional(),
  bio: z
    .preprocess(
      emptyToNull,
      z.string().max(200, "Bio must be under 200 characters").nullable(),
    )
    .optional(),
  location: z
    .preprocess(emptyToNull, z.string().max(100).nullable())
    .optional(),
  website: z
    .preprocess(
      emptyToNull,
      z.string().url("Invalid website URL").nullable(),
    )
    .optional(),
  deleteAvatar: z
    .preprocess((val) => val === "true" || val === true, z.boolean())
    .optional(),
  deleteCoverImg: z
    .preprocess((val) => val === "true" || val === true, z.boolean())
    .optional(),
});
