# Ligeia RPG · Owlbear Rodeo

Extensão para o [Owlbear Rodeo](https://www.owlbear.rodeo/) que adiciona suporte ao sistema [Ligeia RPG](https://www.dinhoreis.com.br/) — ficha de personagem digital com rolagens integradas e rolador de dados 3D, tudo no estilo visual do livro de regras.

> **Sistema homenageado:** *Ligeia RPG* foi criado por **Dinho Reis** e está licenciado sob Creative Commons BY-NC-ND 4.0. Esta extensão é um suporte digital não comercial para mesas que jogam o sistema.

---

## ✨ O que vem com a extensão

- **Ficha de personagem completa** seguindo o layout oficial — atributos primários (Força, Agilidade, Vigor, Mente, Percepção), atributos secundários derivados (Bloqueio, Esquiva, Conjuração, Iniciativa, Deslocamento…), PV, PM, Pontos Heroicos, Corrupção, XP, habilidades B/A/E, equipamentos, ataques e o **mapa de magias** com todas as 28 palavras arcanas e o grimório.
- **Rolagens automáticas seguindo as regras de Ligeia:**
  - `2d6 + atributo + dados de melhoria` (apenas os 2 maiores dados contam, conforme manual)
  - Sucesso crítico (6, 6) e falha crítica (1, 1) detectados automaticamente
  - Comparação contra dificuldade (Muito fácil 6 → Extrema 20)
- **Rolador de dados 3D** independente — clique em qualquer atributo, habilidade ou ataque para rolar, ou abra o rolador para rolagens livres.
- **Rolagens compartilhadas** com toda a mesa via Owlbear Rodeo broadcast.
- **Salvamento na sala** — todos os personagens ficam vinculados à sala do Owlbear; o narrador e os jogadores veem a lista compartilhada.
- **Visual fiel ao livro** — paleta dourado/sépia sobre fundo escuro, tipografia Cinzel/Garamond, círculos de atributos no mesmo estilo da ficha em PDF.

---

## 🚀 Instalação no Owlbear Rodeo

Depois que você publicar este projeto no seu GitHub e ativar o GitHub Pages (instruções abaixo), o link de instalação será:

```
https://SEU-USUARIO.github.io/ligeia-owlbear/manifest.json
```

**Para instalar no Owlbear Rodeo:**

1. Entre no [Owlbear Rodeo](https://www.owlbear.rodeo/) e abra a sala onde quer jogar.
2. Clique no ícone de **Extensions** no menu lateral.
3. Clique em **Add Custom Extension**.
4. Cole a URL do `manifest.json` acima.
5. A extensão "Ligeia RPG" aparecerá no menu de ações da sala.

---

## 🛠️ Como publicar no GitHub (passo a passo)

Siga estes passos exatamente assim e a extensão estará no ar em poucos minutos.

### 1. Criar o repositório

1. Crie um repositório novo no GitHub chamado **`ligeia-owlbear`** (público).
2. **Importante:** se você escolher outro nome, lembre-se de ajustar o caminho final na URL de instalação.

### 2. Subir o código

Em uma pasta vazia no seu computador, descompacte o conteúdo deste projeto e rode:

```bash
git init
git add .
git commit -m "Versão inicial - Ligeia RPG para Owlbear Rodeo"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/ligeia-owlbear.git
git push -u origin main
```

### 3. Ativar o GitHub Pages

1. Vá em **Settings → Pages** no seu repositório.
2. Em **Source**, escolha **GitHub Actions**.
3. Vá na aba **Actions** — o workflow `Deploy to GitHub Pages` já está configurado e vai rodar automaticamente a cada push.
4. Quando o workflow terminar (ícone verde), a extensão estará disponível em:

```
https://SEU-USUARIO.github.io/ligeia-owlbear/
```

### 4. Pegar o link de instalação

O link que você vai colar no Owlbear é o **manifest.json**:

```
https://SEU-USUARIO.github.io/ligeia-owlbear/manifest.json
```

Pronto. É esse link que você cola em "Add Custom Extension".

---

## 🧑‍💻 Rodando localmente para desenvolvimento

```bash
npm install
npm run dev
```

Abra `http://localhost:5173/` no navegador. A extensão funciona em modo "standalone" fora do Owlbear (usa `localStorage` em vez da metadata da sala), o que torna o desenvolvimento fácil.

Para gerar a build de produção:

```bash
npm run build
npm run preview
```

---

## 📂 Estrutura do projeto

```
ligeia-owlbear/
├── public/
│   ├── manifest.json    # Manifest da extensão Owlbear
│   ├── icon.svg         # Ícone da extensão
│   └── header.svg       # Banner da extensão
├── src/
│   ├── popover.jsx      # Entry: action popover (lista de personagens)
│   ├── sheet.jsx        # Entry: ficha de personagem
│   ├── dice.jsx         # Entry: rolador de dados 3D
│   ├── components/
│   │   ├── Popover.jsx
│   │   ├── CharacterSheet.jsx
│   │   ├── DiceRoller.jsx
│   │   └── Die3D.jsx    # Dado 3D animado em CSS
│   ├── lib/
│   │   ├── dice.js      # Motor de rolagem (regras de Ligeia)
│   │   ├── obr.js       # Integração com Owlbear Rodeo SDK
│   │   └── character.js # Modelo e cálculo de atributos derivados
│   ├── data/
│   │   ├── character.js # Listas de raças, vocações, nações
│   │   └── magicWords.js # 28 palavras arcanas + 3 abstratas
│   └── styles/
│       ├── global.css   # Tema visual (paleta Ligeia)
│       └── sheet.css    # Estilos específicos da ficha
├── index.html           # Action popover
├── sheet.html           # Ficha modal
├── dice.html            # Rolador popover
├── vite.config.js
└── .github/workflows/
    └── deploy.yml       # Deploy automático para GitHub Pages
```

---

## ⚙️ Regras de rolagem implementadas

O motor (`src/lib/dice.js`) segue fielmente o que está descrito no Livro de Regras, Sessão 2:

| Situação | Comportamento |
|---|---|
| Rolagem padrão | `2d6 + atributo + bônus` |
| Dado de melhoria | adiciona um d6 extra; apenas os **2 maiores** dados contam |
| Sucesso crítico | os dois dados que contam mostram **6** e o total supera a dificuldade |
| Falha crítica | os dois dados que contam mostram **1** |
| Rolagem oposta | maior vence; empate vai para o atacante |

A ficha aplica esses mesmos princípios automaticamente — clique em um atributo, habilidade ou ataque e veja o resultado animado.

---

## 📜 Licença

Este código está sob a licença **MIT** (veja `LICENSE`).

O sistema **Ligeia RPG**, suas regras, ilustrações e cenário pertencem a **Dinho Reis** e estão sob a licença [Creative Commons BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/). Esta extensão é um suporte digital comunitário não comercial — adquira o livro oficial em https://www.dinhoreis.com.br/.

---

## 🐛 Problemas e sugestões

Abra uma issue no GitHub do projeto. Pull requests são bem-vindos.
