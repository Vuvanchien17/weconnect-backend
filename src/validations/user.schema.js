import { email, z } from "zod";
import { REGEX } from "../utils/constants.js";

const userCore = {
  email: z
    .string()
    .trim()
    .regex(REGEX.EMAIL, "Invalid email format (e.g., user@example.com)")
    .max(100),
  password: z
    .string()
    .min(8, "At least 8 characters")
    .regex(/[A-Z]/, "At least one uppercase character is required")
    .regex(/[0-9]/, "At least one number is needed"),
};

export const signUpSchema = z.object(userCore).strict();

export const changePasswordSchema = z
  .object({
    oldPassword: userCore.password,
    newPassword: userCore.password,
    confirmPassword: userCore.password,
  })
  .strict();

export const changeEmailSchema = z.object({
  newEmail: z.string().trim().regex(REGEX.EMAIL, "Invalid email format"),
  password: userCore.password,
});
