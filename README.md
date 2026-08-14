# CHC — Central de Coordenação

Painel de coordenação de voos de helicóptero (bases Macaé, Cabo Frio, Farol
de São Tomé, Jacarepaguá e Maricá). Front-end estático (HTML/CSS/JS puro) +
API em Azure Functions + Azure SQL Database, publicado como Azure Static
Web Apps com login via Microsoft Entra ID.

## Estrutura do repositório

```
/
├── index.html                  → front-end (a mesma tela de sempre, só o
│                                  chcData agora chama a API em vez do
│                                  localStorage)
├── staticwebapp.config.json    → exige login (Entra ID) para acessar o
│                                  site e a API; roteamento do SPA
├── /api
│   ├── host.json
│   ├── package.json
│   ├── local.settings.json.example  → copie para local.settings.json
│   │                                  e preencha a connection string
│   ├── /sql
│   │   └── schema.sql          → script para criar as tabelas no Azure SQL
│   └── /src
│       ├── db.js               → conexão (pool) com o Azure SQL
│       └── /functions
│           ├── bases.js        → GET  /api/bases
│           ├── aircraft.js     → GET  /api/aircraft
│           ├── flights.js      → GET  /api/flights   (lista, filtra por ?base=)
│           │                     POST /api/flights   (cria voo)
│           └── flightById.js   → PUT    /api/flights/{id}  (atualiza)
│                                  DELETE /api/flights/{id}  (exclui)
```

## 1. Criar o Azure SQL Database

1. No Portal Azure, crie um **Azure SQL Database** (pode ser o tier
   Serverless/Básico para começar — dá para escalar depois).
2. Em **Firewalls e redes**, marque **"Permitir que serviços e recursos do
   Azure acessem este servidor"** (necessário para as Functions se
   conectarem).
3. Abra o **Query editor** do banco (ou use Azure Data Studio/SSMS) e rode
   o script `api/sql/schema.sql` deste repositório. Ele cria as tabelas
   `Bases`, `Aircraft` e `Flights` e já popula bases/frota/2 voos de
   exemplo.

## 2. Configurar a API localmente (opcional, para testar antes do deploy)

```bash
cd api
npm install
cp local.settings.json.example local.settings.json
# edite local.settings.json e cole a connection string do seu Azure SQL
npm start
```

Isso sobe a API localmente (Azure Functions Core Tools) em
`http://localhost:7071/api/...`. Para testar o front-end junto, use a
[Static Web Apps CLI](https://learn.microsoft.com/azure/static-web-apps/local-development)
(`swa start . --api-location api`), que já espelha o comportamento de
produção (roteamento `/api`, autenticação, etc.).

## 3. Subir para o GitHub

```bash
git init
git add .
git commit -m "Setup inicial: front-end + Azure Functions + Azure SQL"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/chc-central.git
git push -u origin main
```

## 4. Criar o Azure Static Web Apps e conectar ao repositório

1. No Portal Azure, crie um recurso **Static Web App**.
2. Escolha **GitHub** como fonte e autorize o acesso ao repositório e à
   branch `main`. Isso já cria o workflow do GitHub Actions
   automaticamente (deploy a cada push).
3. Nos detalhes de build:
   - **App location**: `/`
   - **Api location**: `api`
   - **Output location**: (deixe em branco — é HTML puro, sem build)
4. Depois de criado, vá em **Configuração** (Configuration) da Static Web
   App e adicione a *application setting*:
   - `SQL_CONNECTION_STRING` → a mesma connection string do passo 1
     (é assim que a API em produção acessa o banco).

## 5. Ativar o login com Entra ID

O Azure Static Web Apps já vem com autenticação Entra ID (Azure AD)
embutida, sem precisar registrar app manualmente — é só usar o provedor
padrão `/.auth/login/aad`. O arquivo `staticwebapp.config.json` já está
configurado para:

- Exigir usuário autenticado (`allowedRoles: ["authenticated"]`) para
  acessar tanto o site quanto qualquer rota `/api/*`;
- Redirecionar automaticamente para o login do Entra ID quando alguém
  não autenticado tentar acessar.

Se depois você quiser restringir por grupo/role específico do Entra ID
(ex.: só o time de coordenação), dá para configurar
[papéis personalizados](https://learn.microsoft.com/azure/static-web-apps/authentication-custom)
e trocar `"authenticated"` pelo nome do papel.

## 6. Deploy

A partir daqui, todo `git push` na branch `main` dispara o GitHub Actions
criado no passo 4, que builda e publica o front-end e a API
automaticamente. Não precisa fazer mais nada manual.

## Observações de design

- A **sessão de login do app** (nome do coordenador, base e aeronaves
  selecionadas na tela inicial) continua salva em `localStorage` do
  navegador — ela é só o estado da UI de cada operador, não precisa ser
  compartilhada. Quem garante que só gente autorizada acessa o sistema é
  o Entra ID.
- Os `id`s dos voos seguem o mesmo formato que o app já usava
  (`fl_<timestamp>_<random>`), gerados agora no back-end ao criar o voo,
  para evitar colisão entre coordenadores simultâneos.
- As Functions usam **autenticação anônima no nível da Function**
  (`authLevel: 'anonymous'`) porque o controle de acesso real já acontece
  antes, no `staticwebapp.config.json` (só usuário autenticado chega até
  `/api/*`). Isso é o modelo padrão recomendado para Functions
  "gerenciadas" (managed functions) dentro de uma Static Web App.
