/*
  Warnings:

  - The values [Oauth] on the enum `Account_type` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `Account` MODIFY `type` ENUM('oauth', 'credential') NOT NULL;
