import * as z from "zod";

export const postPrivacySchema = z.object({
  name: z.enum([
    "public",
    "friends",
    "friends_except",
    "specific_friends",
    "private",
    "custom",
  ]),
  description: z.string().min(1, "Missing description").max(255).optional(),
});
