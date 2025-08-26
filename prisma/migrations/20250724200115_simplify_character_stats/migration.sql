/*
  Warnings:

  - You are about to drop the column `def` on the `Character` table. All the data in the column will be lost.
  - You are about to drop the column `hp` on the `Character` table. All the data in the column will be lost.
  - You are about to drop the column `isTransformed` on the `Character` table. All the data in the column will be lost.
  - You are about to drop the column `maxHp` on the `Character` table. All the data in the column will be lost.
  - You are about to drop the column `maxMp` on the `Character` table. All the data in the column will be lost.
  - You are about to drop the column `maxStamina` on the `Character` table. All the data in the column will be lost.
  - You are about to drop the column `mp` on the `Character` table. All the data in the column will be lost.
  - You are about to drop the column `stamina` on the `Character` table. All the data in the column will be lost.
  - You are about to drop the column `str` on the `Character` table. All the data in the column will be lost.
  - You are about to drop the column `transformData` on the `Character` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Character" DROP COLUMN "def",
DROP COLUMN "hp",
DROP COLUMN "isTransformed",
DROP COLUMN "maxHp",
DROP COLUMN "maxMp",
DROP COLUMN "maxStamina",
DROP COLUMN "mp",
DROP COLUMN "stamina",
DROP COLUMN "str",
DROP COLUMN "transformData",
ADD COLUMN     "baseStats" JSONB;
