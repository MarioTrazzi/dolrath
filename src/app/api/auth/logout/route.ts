import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
  try {
    // Clear all NextAuth cookies
    const cookieStore = cookies()
    
    // List of NextAuth cookie names to clear
    const nextAuthCookies = [
      'next-auth.session-token',
      '__Secure-next-auth.session-token',
      'next-auth.csrf-token',
      '__Host-next-auth.csrf-token',
      'next-auth.callback-url',
      '__Secure-next-auth.callback-url',
      'next-auth.pkce.code_verifier'
    ]

    // Clear all NextAuth cookies
    nextAuthCookies.forEach(cookieName => {
      try {
        cookieStore.delete(cookieName)
      } catch (error) {
        // Cookie might not exist, ignore
      }
    })

    console.log('🧹 Cookies de sessão limpos')

    return NextResponse.json(
      { message: 'Logout realizado e cookies limpos' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Erro no logout:', error)
    return NextResponse.json(
      { error: 'Erro no logout' },
      { status: 500 }
    )
  }
}
