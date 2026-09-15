import { adminClient, isAdminConfigured } from '@/lib/supabase/admin'

/**
 * POST /api/invite — email someone an invitation to set up their account.
 *
 * Sent when a guest is added with an email. They are already in the group as
 * a guest; the email is what turns that row into a real membership, because
 * signing up with that address is what claim_guest_rows() matches on.
 *
 * This is the first server-side code in the app, and it exists only because
 * sending mail needs the secret key. Everything else the app does is a
 * Postgres function called straight from the browser, where auth.uid() makes
 * the caller's identity unforgeable.
 *
 * That protection is exactly what is missing here, so this handler has to
 * rebuild it by hand:
 *
 *   1. Take the caller's access token from the Authorization header and ask
 *      Supabase who it belongs to. Never believe an id sent in the body.
 *   2. Check that person is actually in the group they are inviting into.
 *
 * Without step 2 this route is an open mail relay wearing our domain.
 */
export async function POST(request) {
  if (!isAdminConfigured) {
    return Response.json(
      { error: 'Invites are not configured on this server.' },
      { status: 501 }
    )
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return Response.json({ error: 'Not signed in.' }, { status: 401 })

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Bad request.' }, { status: 400 })
  }

  const { email, groupId, name } = body ?? {}
  if (!email || !groupId) {
    return Response.json({ error: 'Bad request.' }, { status: 400 })
  }

  const admin = adminClient()

  // Step 1 — who is really asking.
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(token)

  if (userError || !user) {
    return Response.json({ error: 'Not signed in.' }, { status: 401 })
  }

  // Step 2 — are they in this group.
  const { data: membership, error: membershipError } = await admin
    .from('members')
    .select('id')
    .eq('group_id', groupId)
    .eq('account_id', user.id)
    .maybeSingle()

  if (membershipError) {
    return Response.json({ error: membershipError.message }, { status: 500 })
  }

  if (!membership) {
    return Response.json({ error: 'You are not in that group.' }, { status: 403 })
  }

  // Creating the invite also creates an auth user, which fires the
  // handle_new_user trigger and gives that email an `accounts` row straight
  // away — before they have accepted anything. add_guest() treats an address
  // with an account as a roster member, so adding the same email again later
  // adds them to the roster rather than as a guest.
  const origin = new URL(request.url).origin

  // The name whoever added them typed, carried into user_metadata so that
  // handle_new_user writes it onto the accounts row instead of falling back
  // to the email's local part. It is a display name and nothing more — no
  // decision in this app is made on it — so trimming and capping it is the
  // whole of the checking it needs.
  const displayName = typeof name === 'string' ? name.trim().slice(0, 80) : ''

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/`,
    ...(displayName === '' ? {} : { data: { name: displayName } }),
  })

  if (error) {
    // Already invited, already registered, or the mail quota is spent. None
    // of these should undo the session that was just saved, so the caller
    // reports rather than retries.
    return Response.json({ error: error.message }, { status: 400 })
  }

  return Response.json({ ok: true })
}
