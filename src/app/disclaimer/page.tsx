import type { Metadata } from 'next'
import LegalShell, { LegalSection } from '@/components/legal/LegalShell'

export const metadata: Metadata = {
  title: 'Aviso de Risco — BDI',
  description: 'Aviso de risco sobre criptoativos no Black Dolrath Idle.',
}

export default function DisclaimerPage() {
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
