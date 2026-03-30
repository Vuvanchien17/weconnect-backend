# 1. Sử dụng Node.js bản 18 trên nền Alpine Linux (siêu nhẹ)
FROM node:18-alpine

# 2. Cài đặt múi giờ Việt Nam cho hệ điều hành bên trong Docker
RUN apk add --no-cache tzdata
ENV TZ=Asia/Ho_Chi_Minh

# 3. Tạo thư mục làm việc bên trong container
WORKDIR /app

# 4. Copy file package.json và package-lock.json trước để cài thư viện
COPY package*.json ./

# 5. Cài đặt các thư viện (node_modules)
RUN npm install --legacy-peer-deps

# 6. Copy thư mục prisma vào trước để sinh Client tương thích với Linux
COPY prisma ./prisma/

# 7. Sinh ra Prisma Client (Cực kỳ quan trọng để không bị lỗi Prisma Client not found)
RUN npx prisma generate

# 8. Copy toàn bộ các file code còn lại từ máy thật vào Docker
COPY . .

# 9. Mở cổng 5000 (đúng cổng app của bạn đang chạy)
EXPOSE 5000

# 10. Lệnh khởi chạy App
CMD ["npm", "start"]



