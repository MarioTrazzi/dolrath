import type { Metadata } from 'next'
import LegalShell, { LegalSection } from '@/components/legal/LegalShell'
import { getLocale } from '@/lib/i18n/server'

// SEO fixo em EN (idioma principal do lançamento).
export const metadata: Metadata = {
  title: 'Terms of Use — BDI',
  description: 'Terms of use for Black Dolrath Idle.',
}

// ⚠️ A prosa EN é tradução nova do texto legal PT — pendente de revisão humana.
function TermsEn() {
  return (
    <LegalShell title="Terms of Use" updatedAt="July 18, 2026">
      <p>
        By accessing or using Black Dolrath Idle (&quot;BDI&quot;, &quot;the game&quot;, &quot;we&quot;), you agree to these
        Terms of Use, to our <a href="/disclaimer" className="text-amber-300 hover:underline">Risk Notice</a> and
        to our <a href="/privacy" className="text-amber-300 hover:underline">Privacy Policy</a>. If you
        do not agree, do not use the game.
      </p>

      <LegalSection heading="1. Account and access">
        <p>
          Access is exclusively via Web3 wallet (SIWE). You are solely responsible for keeping your
          credentials safe and for all activity performed with your wallet. You must have the legal
          capacity to enter into contracts in your jurisdiction.
        </p>
      </LegalSection>

      <LegalSection heading="2. Game assets">
        <p>
          Characters, items and tokens (DOL, GOLD) may exist as NFTs or ERC-20 tokens on the Polygon
          network. They are game assets intended for entertainment. DOL is a utility token and grants
          no corporate or economic rights and no promise of return (see the Risk Notice). We do not
          guarantee value, liquidity or a market for any asset.
        </p>
      </LegalSection>

      <LegalSection heading="3. Prohibited conduct">
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>exploit bugs, economic flaws or vulnerabilities to gain an unfair advantage;</li>
          <li>use bots, automation or multiple accounts to manipulate rewards, rankings or the market;</li>
          <li>attempt to mint, duplicate or issue assets outside the flows intended by the game;</li>
          <li>attack, overload or attempt to compromise the infrastructure or the contracts;</li>
          <li>use the game for money laundering or any unlawful purpose.</li>
        </ul>
        <p>
          We may suspend accounts, reverse improper off-chain credits and block access for anyone who
          violates these rules.
        </p>
      </LegalSection>

      <LegalSection heading="4. Fees and transactions">
        <p>
          On-chain transactions require a network fee (gas) in POL, paid by you. In-game markets may
          charge fees (part burned, part to the treasury), as described in the game documentation. All
          on-chain transactions are irreversible.
        </p>
      </LegalSection>

      <LegalSection heading="5. No warranties">
        <p>
          The game is provided &quot;as is&quot;, without warranties of any kind. We do not guarantee
          continuous availability, absence of errors, or that the game will meet your expectations. We
          may change, pause or discontinue features at any time.
        </p>
      </LegalSection>

      <LegalSection heading="6. Limitation of liability">
        <p>
          To the maximum extent permitted by law, we will not be liable for loss of assets, lost
          profits, or indirect, incidental or consequential damages arising from use of the game, from
          smart-contract failures, from the Polygon network, from your wallet or from third parties.
        </p>
      </LegalSection>

      <LegalSection heading="7. Changes">
        <p>
          We may update these Terms. Continued use after changes means acceptance of the current
          version. The &quot;last updated&quot; date indicates the most recent revision.
        </p>
      </LegalSection>

      <LegalSection heading="8. Contact">
        <p>
          Questions about these Terms can be sent through the official community channels listed in
          the site footer.
        </p>
      </LegalSection>
    </LegalShell>
  )
}

function TermsPt() {
  return (
    <LegalShell title="Termos de Uso" updatedAt="18 de julho de 2026">
      <p>
        Ao acessar ou usar o Black Dolrath Idle (&quot;BDI&quot;, &quot;jogo&quot;, &quot;nós&quot;), você concorda com estes
        Termos de Uso e com o nosso <a href="/disclaimer" className="text-amber-300 hover:underline">Aviso de Risco</a> e
        a nossa <a href="/privacy" className="text-amber-300 hover:underline">Política de Privacidade</a>. Se você
        não concordar, não use o jogo.
      </p>

      <LegalSection heading="1. A conta e o acesso">
        <p>
          O acesso é feito exclusivamente por carteira Web3 (SIWE). Você é o único responsável por
          manter suas credenciais seguras e por toda atividade realizada com a sua carteira. Você deve
          ter capacidade legal para celebrar contratos na sua jurisdição.
        </p>
      </LegalSection>

      <LegalSection heading="2. Ativos do jogo">
        <p>
          Personagens, itens e tokens (DOL, GOLD) podem existir como NFTs ou tokens ERC-20 na rede
          Polygon. Eles são ativos de jogo com finalidade de entretenimento. O DOL é um token
          utilitário e não confere qualquer direito societário, econômico ou promessa de retorno (veja
          o Aviso de Risco). Não garantimos valor, liquidez ou mercado para qualquer ativo.
        </p>
      </LegalSection>

      <LegalSection heading="3. Conduta proibida">
        <p>Você concorda em não:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>explorar bugs, falhas econômicas ou vulnerabilidades para obter vantagem indevida;</li>
          <li>usar bots, automação ou múltiplas contas para manipular recompensas, ranking ou mercado;</li>
          <li>tentar cunhar, duplicar ou emitir ativos fora dos fluxos previstos no jogo;</li>
          <li>atacar, sobrecarregar ou tentar comprometer a infraestrutura ou os contratos;</li>
          <li>usar o jogo para lavagem de dinheiro ou qualquer finalidade ilícita.</li>
        </ul>
        <p>
          Podemos suspender contas, reverter créditos indevidos off-chain e bloquear o acesso de quem
          violar estas regras.
        </p>
      </LegalSection>

      <LegalSection heading="4. Taxas e transações">
        <p>
          Transações on-chain exigem taxa de rede (gas) em POL, paga por você. Mercados internos podem
          cobrar taxas (parte queimada, parte à tesouraria), descritas na documentação do jogo. Todas
          as transações on-chain são irreversíveis.
        </p>
      </LegalSection>

      <LegalSection heading="5. Sem garantias">
        <p>
          O jogo é fornecido &quot;no estado em que se encontra&quot;, sem garantias de qualquer tipo. Não
          garantimos disponibilidade contínua, ausência de erros, nem que o jogo atenderá às suas
          expectativas. Podemos alterar, pausar ou descontinuar recursos a qualquer momento.
        </p>
      </LegalSection>

      <LegalSection heading="6. Limitação de responsabilidade">
        <p>
          Na máxima extensão permitida por lei, não seremos responsáveis por perdas de ativos, lucros
          cessantes, danos indiretos, incidentais ou consequentes decorrentes do uso do jogo, de falhas
          em contratos inteligentes, da rede Polygon, de sua carteira ou de terceiros.
        </p>
      </LegalSection>

      <LegalSection heading="7. Alterações">
        <p>
          Podemos atualizar estes Termos. O uso continuado após mudanças significa aceitação da versão
          vigente. A data de &quot;última atualização&quot; indica a revisão mais recente.
        </p>
      </LegalSection>

      <LegalSection heading="8. Contato">
        <p>
          Dúvidas sobre estes Termos podem ser encaminhadas pelos canais oficiais da comunidade
          divulgados no rodapé do site.
        </p>
      </LegalSection>
    </LegalShell>
  )
}

export default function TermsPage() {
  return getLocale() === 'pt' ? <TermsPt /> : <TermsEn />
}
