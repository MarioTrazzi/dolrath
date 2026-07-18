import type { Metadata } from 'next'
import LegalShell, { LegalSection } from '@/components/legal/LegalShell'

export const metadata: Metadata = {
  title: 'Política de Privacidade — BDI',
  description: 'Como o Black Dolrath Idle trata seus dados.',
}

export default function PrivacyPage() {
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
