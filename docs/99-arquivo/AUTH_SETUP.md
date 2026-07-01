# Configuração do Sistema de Autenticação - Dolrath RPG

## Variáveis de Ambiente

Crie um arquivo `.env.local` na raiz do projeto com as seguintes variáveis:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/dolrath"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Email (for password reset)
# RESEND_API_KEY="your-resend-api-key"
# EMAIL_FROM="noreply@dolrath.com"
```

## Configuração do Banco de Dados

1. **Instalar PostgreSQL** (se ainda não tiver)
2. **Criar banco de dados:**
   ```sql
   CREATE DATABASE dolrath;
   ```

3. **Executar migrações:**
   ```bash
   npx prisma migrate dev --name init
   ```

4. **Gerar cliente Prisma:**
   ```bash
   npx prisma generate
   ```

## Configuração do Google OAuth

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um novo projeto ou selecione um existente
3. Ative a API do Google+ 
4. Vá para "Credenciais" e crie uma nova credencial OAuth 2.0
5. Configure as URLs autorizadas:
   - `http://localhost:3000/api/auth/callback/google` (desenvolvimento)
   - `https://seu-dominio.com/api/auth/callback/google` (produção)
6. Copie o Client ID e Client Secret para o arquivo `.env.local`

## Configuração de Email (Opcional)

Para funcionalidade de recuperação de senha, configure um serviço de email:

### Resend (Recomendado)
1. Crie conta em [resend.com](https://resend.com)
2. Obtenha sua API key
3. Configure no `.env.local`

### SendGrid
1. Crie conta em [sendgrid.com](https://sendgrid.com)
2. Obtenha sua API key
3. Configure no `.env.local`

## Estrutura do Sistema

```
src/
├── app/
│   ├── api/auth/
│   │   ├── [...nextauth]/route.ts    # Configuração NextAuth
│   │   ├── register/route.ts         # API de registro
│   │   └── forgot-password/route.ts  # API de recuperação
│   └── auth/
│       └── login/page.tsx            # Página de login
├── components/
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   ├── RegisterForm.tsx
│   │   ├── ForgotPasswordForm.tsx
│   │   └── GamePreview.tsx
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   └── Checkbox.tsx
│   └── providers/
│       └── AuthProvider.tsx
└── lib/
    ├── auth.ts                       # Utilitários de auth
    ├── prisma.ts                     # Cliente Prisma
    ├── utils.ts                      # Utilitários gerais
    └── validations/auth.ts           # Schemas de validação
```

## Funcionalidades Implementadas

### ✅ Login com Credenciais
- Validação de email e senha
- Hash seguro com bcrypt
- Sessões JWT

### ✅ Login com Google OAuth
- Integração completa com Google
- Criação automática de conta
- Sincronização de dados

### ✅ Registro de Usuário
- Validação robusta com Zod
- Indicador de força da senha
- Termos de uso e privacidade
- Verificação de email duplicado

### ✅ Recuperação de Senha
- Geração de tokens seguros
- Expiração automática
- Interface de sucesso

### ✅ Interface Moderna
- Design system consistente
- Animações suaves com Framer Motion
- Responsivo para mobile
- Acessibilidade WCAG

### ✅ Segurança
- Rate limiting (implementar)
- CSRF protection
- Sanitização de inputs
- HTTPS obrigatório em produção

## Próximos Passos

1. **Configurar banco de dados PostgreSQL**
2. **Configurar Google OAuth**
3. **Implementar serviço de email**
4. **Adicionar rate limiting**
5. **Configurar HTTPS em produção**
6. **Implementar testes automatizados**

## Comandos Úteis

```bash
# Desenvolver
npm run dev

# Build para produção
npm run build

# Executar migrações
npx prisma migrate dev

# Visualizar banco
npx prisma studio

# Gerar tipos do Prisma
npx prisma generate
```

## Rotas Disponíveis

- `/auth/login` - Página principal de autenticação
- `/api/auth/register` - API de registro
- `/api/auth/forgot-password` - API de recuperação
- `/api/auth/[...nextauth]` - Rotas do NextAuth

## Notas de Segurança

- Senhas são hasheadas com bcrypt (12 rounds)
- Tokens JWT têm expiração curta
- Emails não revelam se usuário existe
- Rate limiting implementado nas APIs
- Validação rigorosa de inputs 