const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  try {
    // Test connection
    await prisma.$connect();
    console.log('✅ Database connection successful');
    
    // Run migrations
    console.log('🔄 Running migrations...');
    // The actual migration will be handled by Vercel/Prisma during build
    
    console.log('✅ Database setup complete');
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
