-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'STANDARD', 'CHALLENGING');

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "difficulty" "Difficulty" NOT NULL DEFAULT 'CHALLENGING';
