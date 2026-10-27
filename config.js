// Site configuration. The Supabase anon key is public by design; row-level security (supabase/migrations) guards writes.
// With supabaseUrl empty the site runs without a backend: votes, comments and submissions live in the visitor's
// browser, and "publish" offers a GitHub pull request / issue instead.
window.NEURONARY = {
  supabaseUrl: "https://mcczbdcymyhzfputyqcr.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jY3piZGN5bXloemZwdXR5cWNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMjMwNTksImV4cCI6MjEwODY5OTA1OX0.t9K3_sJ-xezKq3VmkXoEPJvF-kLLfK_GLK1s1GKfdA4",
  authProviders: ["x"], // Supabase provider ids: "x" is X OAuth 2.0 ("twitter" is the older OAuth 1.0a one)

  // GitHub repo that holds recipes/*.json, as "owner/name". Enables the pull request / issue buttons on submit.
  repo: "lyramakesmusic/neuronary",
  branch: "main",

  // Home page categories. Each one is a tag.
  categories: [
    { tag: "persona", name: "Personas" },
    { tag: "language", name: "Languages" },
    { tag: "style", name: "Styles" },
    { tag: "emotion", name: "Emotions" },
    { tag: "animal", name: "Animals" },
    { tag: "food", name: "Food" },
    { tag: "obsession", name: "Obsessions" },
    { tag: "broken", name: "Broken" },
  ],
};
