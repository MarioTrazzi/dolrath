import type { Metadata } from 'next'
import LegalShell, { LegalSection } from '@/components/legal/LegalShell'
import { getLocale } from '@/lib/i18n/server'

export const metadata: Metadata = {
  title: 'Risk Notice — BDI',
  description: 'Risk notice about crypto assets in Black Dolrath Idle.',
}

// ⚠️ A prosa EN é tradução nova do texto legal PT — pendente de revisão humana.
function DisclaimerEn() {
  return (
    <LegalShell title="Risk Notice" updatedAt="July 18, 2026">
      <p className="text-amber-200/90 font-medium">
        Read carefully before connecting your wallet or acquiring any in-game asset.
      </p>

      <LegalSection heading="Not financial advice">
        <p>
          Black Dolrath Idle (&quot;BDI&quot; or &quot;the game&quot;) is an idle RPG with on-chain elements on the
          Polygon network. Nothing in the game, on the site, in the documentation or on our channels
          constitutes investment, financial, legal or tax advice. Any decisions you make are entirely
          your responsibility.
        </p>
      </LegalSection>

      <LegalSection heading="DOL is a utility token">
        <p>
          DOL is a utility token used inside the game (character market purchases, image adjustments,
          internal fees). It does <strong>not represent</strong> equity, shares, quotas, a promise of
          profit, dividends or any right over BDI or its developers. We do not guarantee that DOL will
          have liquidity, an external market or any monetary value — today or in the future.
        </p>
      </LegalSection>

      <LegalSection heading="Volatility and total loss">
        <p>
          Crypto assets are volatile and can lose all of their value. You can lose the entirety of any
          amount you commit. Never commit resources you cannot afford to lose completely.
        </p>
      </LegalSection>

      <LegalSection heading="You are responsible for your wallet">
        <p>
          Login is via wallet (MetaMask or compatible). We never have access to your private key or
          seed. On-chain transactions are irreversible. Losing your credentials means losing the
          associated assets, with no possibility of recovery on our side. You are also responsible for
          network fees (gas), paid in POL.
        </p>
      </LegalSection>

      <LegalSection heading="Contracts without external audit">
        <p>
          The smart contracts have gone through internal review and automated tests, but
          <strong> not yet</strong> an independent external audit. The code may contain flaws.
          Use at your own risk.
        </p>
      </LegalSection>

      <LegalSection heading="Eligibility and jurisdiction">
        <p>
          You declare that you have the legal capacity to use the game and that you are not located in
          a jurisdiction where access to crypto assets is prohibited. It is your responsibility to
          comply with the laws applicable to you. The game may not be available in all countries.
        </p>
      </LegalSection>

      <LegalSection heading="Development status">
        <p>
          BDI is under active development. Features, economy, fees and rules may change without prior
          notice. We may pause on-chain markets in the event of a security incident.
        </p>
      </LegalSection>
    </LegalShell>
  )
}

function DisclaimerPt() {
  return (
    <LegalShell title="Aviso de Risco" updatedAt="18 de julho de 2026">
      <p className="text-amber-200/90 font-medium">
        Leia com atenção antes de conectar sua carteira ou adquirir qualquer ativo no jogo.
      </p>

      <LegalSection heading="Não é conselho financeiro">
        <p>
          O Black Dolrath Idle (&quot;BDI&quot; ou &quot;o jogo&quot;) é um jogo de RPG idle com elementos on-chain
          na rede Polygon. Nada no jogo, no site, na documentação ou em nossos canais constitui
          conselho de investimento, financeiro, jurídico ou tributário. As decisões que você tomar
          são de sua inteira responsabilidade.
        </p>
      </LegalSection>

      <LegalSection heading="O token DOL é utilitário">
        <p>
          O DOL é um token utilitário usado dentro do jogo (compra de personagens no mercado, ajustes
          de imagem, taxas internas). Ele <strong>não representa</strong> participação, ação, cota,
          promessa de lucro, dividendo ou qualquer direito sobre a BDI ou seus desenvolvedores. Não
          garantimos que o DOL terá liquidez, mercado externo ou qualquer valor monetário — hoje ou no
          futuro.
        </p>
      </LegalSection>

      <LegalSection heading="Volatilidade e perda total">
        <p>
          Criptoativos são voláteis e podem perder todo o seu valor. Você pode perder integralmente
          qualquer quantia empregada. Nunca comprometa recursos que você não possa perder por completo.
        </p>
      </LegalSection>

      <LegalSection heading="Você é responsável pela sua carteira">
        <p>
          O login é feito por carteira (MetaMask ou compatível). Nós nunca temos acesso à sua chave
          privada ou seed. Transações on-chain são irreversíveis. A perda das suas credenciais implica
          a perda dos ativos associados, sem qualquer possibilidade de recuperação por nossa parte.
          Você também é responsável pelas taxas de rede (gas), pagas em POL.
        </p>
      </LegalSection>

      <LegalSection heading="Contratos sem auditoria externa">
        <p>
          Os contratos inteligentes passaram por revisão interna e testes automatizados, mas
          <strong> ainda não</strong> por auditoria externa independente. O código pode conter falhas.
          Use por sua conta e risco.
        </p>
      </LegalSection>

      <LegalSection heading="Elegibilidade e jurisdição">
        <p>
          Você declara ter capacidade legal para usar o jogo e não estar localizado em jurisdição onde
          o acesso a criptoativos seja proibido. É sua responsabilidade cumprir as leis aplicáveis a
          você. O jogo pode não estar disponível em todos os países.
        </p>
      </LegalSection>

      <LegalSection heading="Estado de desenvolvimento">
        <p>
          O BDI está em desenvolvimento ativo. Recursos, economia, taxas e regras podem mudar sem aviso
          prévio. Podemos pausar mercados on-chain em caso de incidente de segurança.
        </p>
      </LegalSection>
    </LegalShell>
  )
}

export default function DisclaimerPage() {
  return getLocale() === 'pt' ? <DisclaimerPt /> : <DisclaimerEn />
}
