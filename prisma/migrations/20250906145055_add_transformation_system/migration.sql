-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "isTransformed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "transformationData" JSONB,
ADD COLUMN     "transformationType" TEXT;
