import { redirect } from 'next/navigation';

// A antiga "Loja do Aventureiro" foi dividida em Ferreiro (equipamentos + reparo)
// e Alquimista (consumíveis). Mantemos /store como redirecionamento para o ferreiro.
export default function StorePage() {
  redirect('/blacksmith');
}
