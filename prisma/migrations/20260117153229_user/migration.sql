-- CreateTable
CREATE TABLE `User` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `fullname` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `status` ENUM('active', 'blocked') NOT NULL DEFAULT 'active',
    `role` ENUM('user', 'admin') NOT NULL DEFAULT 'user',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `reset_password_otp_hash` VARCHAR(64) NULL,
    `reset_password_otp_expires` DATETIME(3) NULL,
    `reset_password_otp_attempts` INTEGER NOT NULL DEFAULT 0,
    `reset_password_token` VARCHAR(255) NULL,
    `reset_password_token_expires` DATETIME(3) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
