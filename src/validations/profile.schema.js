import * as z from "zod";
import { REGEX } from "../utils/constants.js";

export const profileSchema = z.object({
  displayName: z
    .string()
    .min(1, "At least one character is required.")
    .max(50, "No more than 50 characters.")
    .optional(),
  phoneNumber: z
    .string()
    .regex(REGEX.PHONE, "Invalid Vietnamese phone number")
    .optional()
    .nullable(),
  gender: z.enum(["male", "female", "other"]).optional(),
  birthDay: z
    .preprocess(
      (arg) => {
        if (typeof arg == "string" || arg instanceof Date) return new Date(arg);
      },
      z.date().max(new Date(), "Birthday cannot be in the future"),
    )
    .optional(),
  bio: z
    .string()
    .max(200, "Bio must be under 200 characters")
    .optional()
    .nullable(),
  location: z.string().max(100).optional().nullable(),
  website: z.string().url("Invalid website URL").optional().nullable(),
  deleteAvatar: z
    .preprocess((val) => val === "true" || val === true, z.boolean())
    .optional(),
  deleteCoverImg: z
    .preprocess((val) => val === "true" || val === true, z.boolean())
    .optional(),
});
