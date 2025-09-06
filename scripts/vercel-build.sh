#!/bin/bash

echo "🚀 Starting Vercel build process..."

# Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# Reset database and apply all migrations
echo "� Resetting database and applying all migrations..."
npx prisma migrate reset --force

# Deploy migrations (redundant but safe)
echo "🗃️ Ensuring all migrations are deployed..."
npx prisma migrate deploy

# Build the application
echo "🏗️ Building Next.js application..."
npm run build

echo "✅ Build process completed!"
