import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";

export const protectedRoute = async (req, res, next) => {
  // Thêm async ở đầu
  try {
    const authHeader = req.headers["authorization"];

    // 1. Kiểm tra sự tồn tại của header VÀ định dạng "Bearer "
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Not found accessToken or invalid format.",
      });
    }

    // 2. Tách token an toàn
    const accessToken = authHeader.split(" ")[1];

    // 3. Verify JWT (Nên dùng dạng Promise để đồng nhất với async/await)
    jwt.verify(
      accessToken,
      process.env.JWT_SECRECT_KEY,
      async (error, decodedUser) => {
        if (error) {
          console.log("Error jwt: ", error.message);
          return res.status(401).json({
            message: "Token invalid.",
          });
        }

        try {
          // find user
          const user = await prisma.user.findUnique({
            where: { id: decodedUser.userId },
          });

          if (!user) {
            return res.status(404).json({ message: "User does not exist." });
          }

          // remove passwordHash from user
          const { passwordHash, ...userWithoutPassword } = user;
          req.user = userWithoutPassword; // Convenient for subsequent requests

          next();
        } catch (dbError) {
          return res.status(500).json({ message: "Database error." });
        }
      },
    );
  } catch (error) {
    console.log("Error verify jwt: ", error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};
