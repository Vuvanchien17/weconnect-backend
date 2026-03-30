// src/config/prisma.js
import { PrismaClient } from "@prisma/client";

// Khởi tạo không tham số để dùng engine mặc định (library/binary)
const prisma = new PrismaClient({});

// Kiểm tra kết nối
prisma
  .$connect()
  .then(() => console.log("Prisma connected to Database!"))
  .catch((err) => {
    console.error("❌ Prisma connection error:", err);
    process.exit(1);
  });

export default prisma;
