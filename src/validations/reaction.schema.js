import * as z from "zod";

export const reactPostSchema = z.object({
  reactionId: z.coerce
    .number()
    .int()
    .positive("reactionId must be a positive integer"),
});
