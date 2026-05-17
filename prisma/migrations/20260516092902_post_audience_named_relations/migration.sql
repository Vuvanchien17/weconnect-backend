-- CreateTable
CREATE TABLE `PostExcludedUser` (
    `postId` BIGINT NOT NULL,
    `userId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PostExcludedUser_userId_idx`(`userId`),
    PRIMARY KEY (`postId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PostAllowedUser` (
    `postId` BIGINT NOT NULL,
    `userId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PostAllowedUser_userId_idx`(`userId`),
    PRIMARY KEY (`postId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PostExcludedUser` ADD CONSTRAINT `PostExcludedUser_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostExcludedUser` ADD CONSTRAINT `PostExcludedUser_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostAllowedUser` ADD CONSTRAINT `PostAllowedUser_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostAllowedUser` ADD CONSTRAINT `PostAllowedUser_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
