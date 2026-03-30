/*
  Warnings:

  - You are about to alter the column `type` on the `postblock` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(2))` to `VarChar(191)`.
  - You are about to drop the `blockembed` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `blockevent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `blockfeeling` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `blockimage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `blocklive` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `blocklocation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `blocktext` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `blockvideo` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `content` to the `PostBlock` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `blockembed` DROP FOREIGN KEY `BlockEmbed_postBlockId_fkey`;

-- DropForeignKey
ALTER TABLE `blockevent` DROP FOREIGN KEY `BlockEvent_eventMasterId_fkey`;

-- DropForeignKey
ALTER TABLE `blockevent` DROP FOREIGN KEY `BlockEvent_postBlockId_fkey`;

-- DropForeignKey
ALTER TABLE `blockfeeling` DROP FOREIGN KEY `BlockFeeling_feelingMasterId_fkey`;

-- DropForeignKey
ALTER TABLE `blockfeeling` DROP FOREIGN KEY `BlockFeeling_postBlockId_fkey`;

-- DropForeignKey
ALTER TABLE `blockimage` DROP FOREIGN KEY `BlockImage_postBlockId_fkey`;

-- DropForeignKey
ALTER TABLE `blocklive` DROP FOREIGN KEY `BlockLive_postBlockId_fkey`;

-- DropForeignKey
ALTER TABLE `blocklocation` DROP FOREIGN KEY `BlockLocation_postBlockId_fkey`;

-- DropForeignKey
ALTER TABLE `blocktext` DROP FOREIGN KEY `BlockText_postBlockId_fkey`;

-- DropForeignKey
ALTER TABLE `blockvideo` DROP FOREIGN KEY `BlockVideo_postBlockId_fkey`;

-- DropForeignKey
ALTER TABLE `postblock` DROP FOREIGN KEY `PostBlock_postId_fkey`;

-- AlterTable
ALTER TABLE `postblock` ADD COLUMN `content` JSON NOT NULL,
    MODIFY `type` VARCHAR(191) NOT NULL;

-- DropTable
DROP TABLE `blockembed`;

-- DropTable
DROP TABLE `blockevent`;

-- DropTable
DROP TABLE `blockfeeling`;

-- DropTable
DROP TABLE `blockimage`;

-- DropTable
DROP TABLE `blocklive`;

-- DropTable
DROP TABLE `blocklocation`;

-- DropTable
DROP TABLE `blocktext`;

-- DropTable
DROP TABLE `blockvideo`;

-- AddForeignKey
ALTER TABLE `PostBlock` ADD CONSTRAINT `PostBlock_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
