-- CreateTable
CREATE TABLE `Profile` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `avatar` VARCHAR(255) NULL,
    `coverImage` VARCHAR(255) NULL,
    `bio` VARCHAR(191) NULL,
    `gender` ENUM('male', 'female', 'other') NOT NULL DEFAULT 'other',
    `birthDay` DATETIME(3) NULL,
    `location` VARCHAR(255) NULL,
    `website` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Profile_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Profile` ADD CONSTRAINT `Profile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
