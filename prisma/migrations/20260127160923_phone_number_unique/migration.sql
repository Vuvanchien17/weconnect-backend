/*
  Warnings:

  - A unique constraint covering the columns `[phoneNumber]` on the table `Profile` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `Profile_phoneNumber_key` ON `Profile`(`phoneNumber`);
