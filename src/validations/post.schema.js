import * as z from "zod";

export const textBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1, "The field must not be left blank"),
});

export const imageBlockSchema = z.object({
  type: z.literal("image"),
  // xử lý upload image lên Cloudinary trước, sau đó trả về image link
  image: z.string().min(1, "Image link is required").optional(),
  imageId: z.string().min(1, "Missing photo ID").optional(),
});

export const videoBlockSchema = z.object({
  type: z.literal("video"),
  video: z.string().min(1, "Video link is required").optional(),
  videoId: z.string().min(1, "Missing video ID").optional(),
});

export const embedBlockSchema = z.object({
  type: z.literal("embed"),
  embedType: z.string().min(1, "Embed type is required"), // Ví dụ: 'youtube', 'video'
  embedUrl: z.string().min(1, "Missing embed URL"),
  title: z.string().min(1, "Title is required"),
  thumbnailUrl: z.string().min(1, "Thumbnail is required"),
  provider: z.string().min(1, "Provider is required"), // Ví dụ: 'YouTube', 'Vimeo'
});

export const locationBlockSchema = z.object({
  type: z.literal("location"),
  place: z.string().min(1, "Place is required"),
});

// export const liveVideoBlockSchema = z.object({})

export const feelingBlockSchema = z.object({
  type: z.literal("feeling"),
  feelingMasterId: z.number().int().positive("Invalid feeling ID"),
  customText: z.string().max(100).optional(),
});

export const feelingMasterSchema = z.object({
  type: z.enum(["feeling", "activity"]),
  displayText: z.string().min(1, "Missing display text"),
  icon: z.string().min(1, "Missing icon"),
});

export const lifeEventBlockSchema = z.object({
  type: z.literal("event"),
  lifeEventMasterId: z.coerce.string().min(1, "Please choose event master"),
  title: z.string().min(1, "Missing title"),
  date: z.coerce.date({
    required_error: "Please select the date",
    invalid_type_error: "Invalid date format",
  }),
  workPlace: z.string().max(255).optional().nullable(),
  description: z.string().max(255).optional().nullable(),
});

export const lifeEventMasterSchema = z.object({
  eventCategoryId: z.coerce.string().min(1, "Please choose event category"),
  keyName: z.string().min(1, "Missing key name"),
  displayText: z.string().min(1, "Missing display text"),
  icon: z.string().min(1, "Missing icon"),
});

export const lifeEventCategorySchema = z.object({
  keyName: z.string().min(1, "Missing key name"),
  displayName: z.string().min(1, "Missing display name"),
  icon: z.string().min(1, "Missing icon"),
});

export const postBlockSchema = z.discriminatedUnion("type", [
  // textBlock
  textBlockSchema,
  imageBlockSchema,
  videoBlockSchema,
  embedBlockSchema,
  locationBlockSchema,
  feelingBlockSchema,
  lifeEventBlockSchema,
]);

export const postSchema = z.object({
  privacyId: z.coerce.number(),
  taggedUserIds: z.preprocess((val) => {
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        return [];
      }
    }
    return val;
  }, z.array(z.coerce.number()).default([])),
  collabUserIds: z.preprocess((val) => {
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        return [];
      }
    }
    return val;
  }, z.array(z.coerce.number()).default([])),
  blocks: z
    .preprocess(
      (val) => {
        // Nếu FE gửi bằng FormData, blocks sẽ là 1 chuỗi JSON
        if (typeof val === "string") {
          try {
            return JSON.parse(val);
          } catch (e) {
            return val; // Nếu parse lỗi thì trả về nguyên bản để Zod báo lỗi validation sau
          }
        }
        return val;
      },
      z
        .array(postBlockSchema)
        .min(1, "Post must have at least one content block"),
    )
    .transform((blocks) =>
      blocks.map((block, index) => {
        const { type, ...content } = block;
        return {
          type: type,
          position: index,
          content: content,
        };
      }),
    ),
});
