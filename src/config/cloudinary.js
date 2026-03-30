import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "weconnect_profile",
    allowed_formats: ["jpg", "png", "jpeg", "webp", "mp4", "mov"],
    transformation: [{ width: 500, height: 500, crop: "limit" }],
    limits: { fileSize: 100 * 1024 * 1024 },
    resource_type: "auto",
  },
});

export const uploadCloud = multer({ storage });
export { cloudinary };
