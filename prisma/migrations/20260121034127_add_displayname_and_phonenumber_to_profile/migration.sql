/*
  Warnings:

  - Added the required column `displayName` to the `Profile` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `profile` ADD COLUMN `displayName` VARCHAR(255) NOT NULL,
    ADD COLUMN `phoneNumber` VARCHAR(20) NULL;
