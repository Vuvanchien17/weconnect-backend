-- AlterTable
ALTER TABLE `profile` MODIFY `updatedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `user` MODIFY `updatedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `PostPrivacy` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PostBlock` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `postId` BIGINT NOT NULL,
    `type` ENUM('text', 'image', 'video', 'embed', 'location', 'live', 'feeling', 'event') NOT NULL,
    `position` INTEGER NOT NULL,

    INDEX `PostBlock_postId_position_idx`(`postId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BlockText` (
    `postBlockId` BIGINT NOT NULL,
    `content` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`postBlockId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BlockImage` (
    `postBlockId` BIGINT NOT NULL,
    `image` VARCHAR(255) NOT NULL,
    `imageId` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`postBlockId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BlockVideo` (
    `postBlockId` BIGINT NOT NULL,
    `video` VARCHAR(255) NOT NULL,
    `videoId` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`postBlockId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BlockEmbed` (
    `postBlockId` BIGINT NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `embedUrl` VARCHAR(255) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `thumbnailUrl` VARCHAR(50) NOT NULL,
    `provider` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`postBlockId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BlockLocation` (
    `postBlockId` BIGINT NOT NULL,
    `place` VARCHAR(255) NOT NULL,
    `latitude` DECIMAL(65, 30) NOT NULL,
    `longitude` DECIMAL(65, 30) NOT NULL,

    PRIMARY KEY (`postBlockId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BlockLive` (
    `postBlockId` BIGINT NOT NULL,
    `status` ENUM('scheduled', 'live', 'ended', 'cancelled') NOT NULL DEFAULT 'scheduled',
    `streamKey` VARCHAR(255) NOT NULL,
    `streamUrl` VARCHAR(500) NOT NULL,
    `replayUrl` VARCHAR(500) NULL,
    `scheduledAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `thumbnailUrl` VARCHAR(500) NULL,

    INDEX `BlockLive_status_idx`(`status`),
    PRIMARY KEY (`postBlockId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeelingMaster` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('feeling', 'activity') NOT NULL,
    `displayText` VARCHAR(50) NOT NULL,
    `icon` VARCHAR(50) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BlockFeeling` (
    `postBlockId` BIGINT NOT NULL,
    `feelingMasterId` INTEGER NOT NULL,

    PRIMARY KEY (`postBlockId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventCategory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `keyName` VARCHAR(255) NOT NULL,
    `displayName` VARCHAR(500) NOT NULL,
    `icon` VARCHAR(50) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventMaster` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventCategoryId` INTEGER NOT NULL,
    `keyName` VARCHAR(255) NOT NULL,
    `displayText` VARCHAR(500) NOT NULL,
    `icon` VARCHAR(50) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BlockEvent` (
    `postBlockId` BIGINT NOT NULL,
    `eventMasterId` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `location` VARCHAR(255) NOT NULL,
    `extraInfo` VARCHAR(500) NOT NULL,

    PRIMARY KEY (`postBlockId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Post` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `privacyId` INTEGER NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `isEdited` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NULL,

    INDEX `Post_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `Post_isDeleted_idx`(`isDeleted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PostTag` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `postId` BIGINT NOT NULL,
    `taggedBy` BIGINT NOT NULL,
    `taggedUserId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PostTag_postId_taggedUserId_key`(`postId`, `taggedUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PostBlock` ADD CONSTRAINT `PostBlock_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlockText` ADD CONSTRAINT `BlockText_postBlockId_fkey` FOREIGN KEY (`postBlockId`) REFERENCES `PostBlock`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlockImage` ADD CONSTRAINT `BlockImage_postBlockId_fkey` FOREIGN KEY (`postBlockId`) REFERENCES `PostBlock`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlockVideo` ADD CONSTRAINT `BlockVideo_postBlockId_fkey` FOREIGN KEY (`postBlockId`) REFERENCES `PostBlock`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlockEmbed` ADD CONSTRAINT `BlockEmbed_postBlockId_fkey` FOREIGN KEY (`postBlockId`) REFERENCES `PostBlock`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlockLocation` ADD CONSTRAINT `BlockLocation_postBlockId_fkey` FOREIGN KEY (`postBlockId`) REFERENCES `PostBlock`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlockLive` ADD CONSTRAINT `BlockLive_postBlockId_fkey` FOREIGN KEY (`postBlockId`) REFERENCES `PostBlock`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlockFeeling` ADD CONSTRAINT `BlockFeeling_postBlockId_fkey` FOREIGN KEY (`postBlockId`) REFERENCES `PostBlock`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlockFeeling` ADD CONSTRAINT `BlockFeeling_feelingMasterId_fkey` FOREIGN KEY (`feelingMasterId`) REFERENCES `FeelingMaster`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventMaster` ADD CONSTRAINT `EventMaster_eventCategoryId_fkey` FOREIGN KEY (`eventCategoryId`) REFERENCES `EventCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlockEvent` ADD CONSTRAINT `BlockEvent_postBlockId_fkey` FOREIGN KEY (`postBlockId`) REFERENCES `PostBlock`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlockEvent` ADD CONSTRAINT `BlockEvent_eventMasterId_fkey` FOREIGN KEY (`eventMasterId`) REFERENCES `EventMaster`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Post` ADD CONSTRAINT `Post_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Post` ADD CONSTRAINT `Post_privacyId_fkey` FOREIGN KEY (`privacyId`) REFERENCES `PostPrivacy`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostTag` ADD CONSTRAINT `PostTag_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostTag` ADD CONSTRAINT `PostTag_taggedBy_fkey` FOREIGN KEY (`taggedBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostTag` ADD CONSTRAINT `PostTag_taggedUserId_fkey` FOREIGN KEY (`taggedUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
