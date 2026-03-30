/*
  Warnings:

  - You are about to drop the column `extraInfo` on the `blockevent` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `blockevent` table. All the data in the column will be lost.
  - Added the required column `title` to the `BlockEvent` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `blockevent` DROP COLUMN `extraInfo`,
    DROP COLUMN `location`,
    ADD COLUMN `description` VARCHAR(500) NULL,
    ADD COLUMN `title` VARCHAR(255) NOT NULL,
    ADD COLUMN `workPlace` VARCHAR(255) NULL,
    MODIFY `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
