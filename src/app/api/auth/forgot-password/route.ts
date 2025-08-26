import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forgotPasswordSchema } from '@/lib/validations/auth'
import { generateRandomString } from '@/lib/utils'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate input
    const validatedData = forgotPasswordSchema.parse(body)
    
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: validatedData.email }
    })
    
    if (!user) {
      // Don't reveal if user exists or not for security
      return NextResponse.json(
        { message: 'If an account with that email exists, a password reset link has been sent.' },
        { status: 200 }
      )
    }
    
    // Generate reset token
    const resetToken = generateRandomString(32)
    const resetTokenExpiry = new Date(Date.now() + 3600000) // 1 hour
    
    // Store reset token in database
    await prisma.verificationToken.create({
      data: {
        identifier: validatedData.email,
        token: resetToken,
        expires: resetTokenExpiry,
      }
    })
    
    // TODO: Send email with reset link
    // For now, just return success
    // In production, you would integrate with a service like SendGrid, Resend, etc.
    
    console.log('Password reset token:', resetToken) // Remove in production
    
    return NextResponse.json(
      { message: 'Password reset email sent successfully' },
      { status: 200 }
    )
    
  } catch (error) {
    console.error('Forgot password error:', error)
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 