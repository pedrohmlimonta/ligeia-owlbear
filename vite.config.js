import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANTE: troque "ligeia-owlbear" pelo nome real do seu repositório no GitHub.
// Se o repositório se chamar "ligeia-owlbear", então `base` deve ser "/ligeia-owlbear/".
// Se for hospedado em um domínio customizado ou na raiz, use "/".
const REPO_NAME = process.env.REPO_NAME || "ligeia-owlbear";

export default defineConfig({
  plugins: [react()],
  base: `/${REPO_NAME}/`,
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: "index.html",
        sheet: "sheet.html",
        dice: "dice.html",
        rollOverlay: "roll-overlay.html",
        background: "background.html",
      },
    },
  },
});
