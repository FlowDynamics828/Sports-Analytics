module.exports = {
  "env": {
    "node": true,
    "es2024": true,
    "jest": true
  },
  "extends": [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "prettier"
  ],
  "parserOptions": {
    "ecmaVersion": 2024,
    "sourceType": "module"
  },
  "rules": {
    "no-console": ["warn", { "allow": ["warn", "error", "info"] }],
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "import/order": ["error", {
      "groups": ["builtin", "external", "internal"],
      "newlines-between": "always",
      "alphabetize": { "order": "asc" }
    }]
  }
}
