// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * TestUSDC — dublê da USDC para o ensaio na Amoy. NUNCA vai para a mainnet.
 *
 * O ponto do ensaio é provar que o caminho de pagamento aguenta um token de
 * **6 decimais**: `payDol.ts` e `dolPayments.ts` leem `decimals()` do contrato
 * em runtime, mas isso nunca foi exercitado contra nada que não fosse 18.
 * O erro que este contrato existe para pegar é 2 virar 2000000 ou 0.000002.
 *
 * Traz o próprio faucet para que os testadores da semana se sirvam sozinhos,
 * sem depender de faucet de terceiro nem de o estúdio distribuir na mão.
 */
contract TestUSDC is ERC20, Ownable {
    /// Quanto o faucet entrega por saque (em unidades base, 6 casas).
    uint256 public constant FAUCET_AMOUNT = 50_000_000; // 50 USDC
    uint256 public constant FAUCET_COOLDOWN = 12 hours;

    mapping(address => uint256) public lastFaucetAt;

    error FaucetCooldown(uint256 availableAt);

    event FaucetDrip(address indexed to, uint256 amount);

    constructor() ERC20("Test USD Coin", "tUSDC") Ownable(msg.sender) {}

    /// USDC tem 6 casas, não 18 — é exatamente o que este dublê existe para replicar.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// Auto-atendimento para os testadores.
    function faucet() external {
        uint256 last = lastFaucetAt[msg.sender];
        if (last != 0 && block.timestamp < last + FAUCET_COOLDOWN) {
            revert FaucetCooldown(last + FAUCET_COOLDOWN);
        }
        lastFaucetAt[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetDrip(msg.sender, FAUCET_AMOUNT);
    }

    /// Carga manual (contas de teste do estúdio, bots da frota).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
