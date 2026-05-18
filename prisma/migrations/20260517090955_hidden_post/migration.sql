-- CreateTable
CREATE TABLE `hidePost` (
    `postId` BIGINT NOT NULL,
    `userId` BIGINT NOT NULL,
    `hiddenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `hidePost_userId_idx`(`userId`),
    UNIQUE INDEX `hidePost_postId_userId_key`(`postId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `hidePost` ADD CONSTRAINT `hidePost_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hidePost` ADD CONSTRAINT `hidePost_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
