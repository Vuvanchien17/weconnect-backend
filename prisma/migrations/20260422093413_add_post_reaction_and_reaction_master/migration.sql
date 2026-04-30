-- CreateTable
CREATE TABLE `ReactionMaster` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `keyName` VARCHAR(30) NOT NULL,
    `displayText` VARCHAR(50) NOT NULL,
    `icon` VARCHAR(50) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PostReaction` (
    `postId` BIGINT NOT NULL,
    `userId` BIGINT NOT NULL,
    `reactionId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`postId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PostReaction` ADD CONSTRAINT `PostReaction_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostReaction` ADD CONSTRAINT `PostReaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostReaction` ADD CONSTRAINT `PostReaction_reactionId_fkey` FOREIGN KEY (`reactionId`) REFERENCES `ReactionMaster`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
