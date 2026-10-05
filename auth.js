/* Public browser configuration. Never put a secret or service-role key here. */
(() => {
  const client = window.supabase?.createClient(
    "https://virlqetwxpgkienkpjdr.supabase.co",
    "sb_publishable_u58SE9eR4dglronJsmLb5A_zKA2KerQ",
    {
      auth: {
        storageKey: "track-the-track.auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "implicit",
      },
    },
  );

  function errorMessage(error) {
    if (error?.code === "invalid_credentials" || error?.message === "Invalid login credentials") return "Your email or password is incorrect. Try again.";
    if (error?.code === "email_not_confirmed" || error?.message === "Email not confirmed") return "Confirm your email address using the link in your inbox, then log in.";
    if (error?.code === "over_email_send_rate_limit" || error?.status === 429) return "Too many requests. Wait a few minutes and try again.";
    if (error?.code === "email_address_not_authorized") return "Email delivery isn't enabled for this address yet. The site owner needs to configure Supabase email delivery.";
    if (error?.code === "user_already_exists") return "An account with this email already exists. Log in or reset your password.";
    if (error?.code === "weak_password") return "Use a stronger password with at least 8 characters.";
    if (error?.code === "same_password") return "Choose a password different from your current password.";
    if (error?.name === "AuthRetryableFetchError" || error instanceof TypeError) return "We couldn't connect. Check your connection and try again.";
    return error?.message || "Something went wrong. Please try again.";
  }

  window.TrackAuth = {
    client,
    errorMessage,
    pageUrl: (page) => new URL(page, window.location.href).href,
    unavailableMessage: "Sign-in couldn't load. Refresh the page and try again.",
  };
})();
