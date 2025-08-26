#!/bin/bash

echo "🚀 Starting Vercel build process..."

# Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# Deploy migrations
echo "🗃️ Deploying database migrations..."
npx prisma migrate deploy

# Build the application
echo "🏗️ Building Next.js application..."
npm run build

echo "✅ Build process completed!"
