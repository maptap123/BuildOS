import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isAuthRoute   = path.startsWith('/login')
  const isApiRoute    = path.startsWith('/api/')
  const isPublicRoute =
    path.startsWith('/co/') || path.startsWith('/proposals/') || path.startsWith('/appt/')

  // API routes handle their own 401 — don't redirect them to /login
  // /co/*, /proposals/*, and /appt/* are public (token-authenticated pages: client
  // approvals, and the schedule confirmation link Fixer texts to subs) —
  // found broken 2026-08-19: /proposals/ was missing here, so every homeowner clicking
  // a proposal link got redirected to /login instead of seeing their proposal. The
  // entire estimate → proposal → accept → job path was unreachable by real clients.
  if (!user && !isAuthRoute && !isApiRoute && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/jobs'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
