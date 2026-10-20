import Foundation

// The same project the web app talks to. The anon key is public by design:
// it ships in every web bundle, and row-level security is what guards data.
enum Config {
    static let supabaseURL = URL(string: "https://ezlousklksipvwuinpzq.supabase.co")!
    static let supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6bG91c2tsa3NpcHZ3dWlucHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2ODk3MTAsImV4cCI6MjA4OTI2NTcxMH0.r_z3gUdUkwBYph5igLxr2O_qD4K9morPVQwm0fuSsrg"
    // Where Google sign-in returns to. Must be listed under Auth -> URL
    // Configuration -> Redirect URLs in the Supabase dashboard.
    static let authCallback = URL(string: "chumoku://auth-callback")!
}
