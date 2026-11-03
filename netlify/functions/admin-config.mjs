// GET /.netlify/functions/admin-config -> the public Google sign-in client ID, so the admin page can show its button.
export default async () => new Response(JSON.stringify({ google: process.env.GOOGLE_CLIENT_ID || '' }), { headers: { 'content-type': 'application/json' } });
