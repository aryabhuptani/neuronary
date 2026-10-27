// Site configuration. Leave supabaseUrl empty to run without a backend: votes, comments and submissions then live in
// the visitor's browser only, and "publish" offers a GitHub pull request / issue instead.
window.NEURONARY = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  authProviders: ["twitter"], // Supabase provider ids; "twitter" is X

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
