// Import this first in any test file that touches the access-card or invitation
// flows. Sending is real, so this blanks the API key before anything loads it:
// a test that forgets to pass its own mail client then fails with "RESEND_API_KEY
// is not set" instead of emailing through the real Resend account. (An empty
// value also stops dotenv filling it in from .env.)
process.env.RESEND_API_KEY = "";
