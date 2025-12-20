-- Add optional image field to Item (stores Cloudinary publicId or full URL)

ALTER TABLE "Item"
ADD COLUMN IF NOT EXISTS "image" TEXT;
