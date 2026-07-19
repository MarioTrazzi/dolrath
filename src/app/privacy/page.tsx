import type { Metadata } from 'next'
import LegalShell, { LegalSection } from '@/components/legal/LegalShell'
import { getLocale } from '@/lib/i18n/server'

export const metadata: Metadata = {
  title: 'Privacy Policy — BDI',
  description: 'How Black Dolrath Idle handles your data.',
}

// ⚠️ A prosa EN é tradução nova do texto legal PT — pendente de revisão humana.
function PrivacyEn() {
  return (
    <LegalShell title="Privacy Policy" updatedAt="July 18, 2026">
      <p>
        This policy describes what data Black Dolrath Idle (&quot;BDI&quot;) collects and how it is used.
        We take data minimization seriously: we collect the minimum needed to run the game.
      </p>

      <LegalSection heading="Data we collect">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li><strong>Public wallet address</strong> — used for login (SIWE) and to credit assets. It is public by nature on the blockchain.</li>
          <li><strong>Email (optional)</strong> — only if you provide it, for launch notices, recovery and news. You can remove it at any time.</li>
          <li><strong>Game data</strong> — characters, progress, inventory, combat history and rewards, tied to your account.</li>
          <li><strong>Technical data</strong> — access and error logs (including IP and user-agent) for security, abuse prevention and diagnostics.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="On-chain data is public">
        <p>
          Transactions on the Polygon network (claims, mints, market purchases) are recorded on a
          public, permanent ledger. We do not control and cannot delete on-chain data.
        </p>
      </LegalSection>

      <LegalSection heading="How we use data">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>run the game, sync progress and credit rewards;</li>
          <li>prevent fraud, abuse and economic exploitation;</li>
          <li>share news and launch updates (if you joined the waitlist);</li>
          <li>improve stability and performance through aggregated metrics.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Sharing">
        <p>
          We do not sell your data. We share it only with providers essential to operations
          (hosting, database, RPC/infrastructure providers), under confidentiality obligations, or
          when required by law.
        </p>
      </LegalSection>

      <LegalSection heading="Retention">
        <p>
          We keep account data for as long as the account exists and as needed for legal obligations
          and security. You can request deletion of your email and off-chain data through the official
          channels; on-chain data is immutable.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          Under applicable law (for example, the LGPD in Brazil), you may request access, correction,
          portability or deletion of your off-chain data. Contact us through the official channels
          listed on the site.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          This policy may be updated. The &quot;last updated&quot; date indicates the current version.
        </p>
      </LegalSection>
    </LegalShell>
  )
}

function PrivacyPt() {
  return (
    <LegalShell title="Política de Privacidade" updatedAt="18 de julho de 2026">
      <p>
        Esta política descreve quais dados o Black Dolrath Idle (&quot;BDI&quot;) coleta e como os utiliza.
        Levamos a sério a minimização de dados: coletamos o mínimo necessário para operar o jogo.
      </p>

      <LegalSection heading="Dados que coletamos">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li><strong>Endereço de carteira pública</strong> — usado para login (SIWE) e para creditar ativos. É público por natureza na blockchain.</li>
          <li><strong>Email (opcional)</strong> — apenas se você fornecer, para avisos de lançamento, recuperação e novidades. Você pode remover a qualquer momento.</li>
          <li><strong>Dados de jogo</strong> — personagens, progresso, inventário, histórico de combate e recompensas, associados à sua conta.</li>
          <li><strong>Dados técnicos</strong> — logs de acesso e erros (incluindo IP e user-agent) para segurança, prevenção de abuso e diagnóstico.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Dados on-chain são públicos">
        <p>
          Transações na rede Polygon (claims, mints, compras no mercado) são registradas em um
          livro-razão público e permanente. Não controlamos e não podemos apagar dados on-chain.
        </p>
      </LegalSection>

      <LegalSection heading="Como usamos os dados">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>operar o jogo, sincronizar progresso e creditar recompensas;</li>
          <li>prevenir fraude, abuso e exploração econômica;</li>
          <li>comunicar novidades e o lançamento (se você entrou na lista de espera);</li>
          <li>melhorar estabilidade e desempenho por meio de métricas agregadas.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Compartilhamento">
        <p>
          Não vendemos seus dados. Compartilhamos apenas com prestadores essenciais à operação
          (hospedagem, banco de dados, provedores de RPC/infra), sob obrigação de confidencialidade, ou
          quando exigido por lei.
        </p>
      </LegalSection>

      <LegalSection heading="Retenção">
        <p>
          Mantemos dados de conta enquanto ela existir e pelo tempo necessário a obrigações legais e à
          segurança. Você pode solicitar a exclusão do seu email e de dados off-chain pelos canais
          oficiais; dados on-chain são imutáveis.
        </p>
      </LegalSection>

      <LegalSection heading="Seus direitos">
        <p>
          Conforme a legislação aplicável (por exemplo, a LGPD no Brasil), você pode solicitar acesso,
          correção, portabilidade ou exclusão dos seus dados off-chain. Entre em contato pelos canais
          oficiais divulgados no site.
        </p>
      </LegalSection>

      <LegalSection heading="Alterações">
        <p>
          Esta política pode ser atualizada. A data de &quot;última atualização&quot; indica a versão vigente.
        </p>
      </LegalSection>
    </LegalShell>
  )
}

export default function PrivacyPage() {
  return getLocale() === 'pt' ? <PrivacyPt /> : <PrivacyEn />
}
